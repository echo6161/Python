import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';

import type {
  RepositoryKind,
  RepositorySourceEncoding,
  RepositorySourceFile,
  RepositoryTreeEntry,
  RepositoryTreePage,
  RepositoryTreeRequest,
} from '../../shared/contracts/repository';
import type { GitRepositoryClient } from './git-repository-client';
import { RepositoryError, mapFileSystemError } from './repository-errors';

const MAX_DIRECTORY_ENTRIES = 5_000;
const MAX_TREE_PAGE_SIZE = 100;
const MAX_VISIBLE_FILE_SIZE = 5 * 1024 * 1024;
const MAX_SOURCE_FILE_SIZE = 1024 * 1024;
const EXCLUDED_NAMES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.cache',
  '.idea',
  '.git-credentials',
  '.netrc',
  '.next',
  '.npmrc',
  '.nuxt',
  '.pypirc',
  '.pytest_cache',
  '.ruff_cache',
  '.tox',
  '.venv',
  '__pycache__',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'release',
  'target',
  'vendor',
  'venv',
]);
const EXCLUDED_EXTENSIONS = new Set([
  '.7z',
  '.a',
  '.bin',
  '.bmp',
  '.class',
  '.dll',
  '.dylib',
  '.exe',
  '.gif',
  '.gz',
  '.ico',
  '.jar',
  '.jpeg',
  '.jpg',
  '.lockb',
  '.mp3',
  '.mp4',
  '.o',
  '.obj',
  '.pdf',
  '.pem',
  '.pfx',
  '.p12',
  '.png',
  '.pyc',
  '.key',
  '.keystore',
  '.jks',
  '.so',
  '.tar',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
  '.zip',
]);

export class RepositoryFileService {
  public constructor(private readonly git: GitRepositoryClient) {}

  public async listTree(
    repositoryId: string,
    root: string,
    kind: RepositoryKind,
    request: RepositoryTreeRequest,
    signal?: AbortSignal,
  ): Promise<RepositoryTreePage> {
    const directory = normalizeRelativePath(request.relativePath);
    const resolved = await resolveAuthorizedPath(root, directory, 'directory');
    throwIfAborted(signal);
    let dirents: Dirent[];
    try {
      dirents = await readdir(resolved, { encoding: 'utf8', withFileTypes: true });
    } catch (error) {
      throw mapFileSystemError(error, 'The source directory could not be listed.');
    }
    if (dirents.length > MAX_DIRECTORY_ENTRIES) {
      throw new RepositoryError(
        'STORAGE_ERROR',
        `This directory exceeds the ${String(MAX_DIRECTORY_ENTRIES)}-entry safety limit.`,
      );
    }
    const candidates: RepositoryTreeEntry[] = [];
    for (const dirent of dirents) {
      throwIfAborted(signal);
      if (
        !isSafeEntryName(dirent.name) ||
        EXCLUDED_NAMES.has(dirent.name.toLocaleLowerCase()) ||
        isSensitiveFileName(dirent.name)
      )
        continue;
      const relativePath = directory ? `${directory}/${dirent.name}` : dirent.name;
      const absolutePath = path.join(resolved, dirent.name);
      let info: Awaited<ReturnType<typeof lstat>>;
      try {
        info = await lstat(absolutePath);
      } catch (error) {
        throw mapFileSystemError(error, 'A source tree entry could not be inspected.');
      }
      if (info.isSymbolicLink()) {
        candidates.push({
          name: dirent.name,
          relativePath,
          kind: 'symlink',
          byteSize: null,
          modifiedAt: info.mtime.toISOString(),
        });
        continue;
      }
      if (info.isDirectory()) {
        candidates.push({
          name: dirent.name,
          relativePath,
          kind: 'directory',
          byteSize: null,
          modifiedAt: info.mtime.toISOString(),
        });
        continue;
      }
      if (!info.isFile() || info.size > MAX_VISIBLE_FILE_SIZE || isExcludedExtension(dirent.name))
        continue;
      candidates.push({
        name: dirent.name,
        relativePath,
        kind: 'file',
        byteSize: info.size,
        modifiedAt: info.mtime.toISOString(),
      });
    }
    let entries = candidates;
    if (kind === 'git') {
      const ignored = await this.git.ignoredPaths(
        root,
        candidates.map(({ relativePath }) => relativePath),
        signal,
      );
      entries = candidates.filter(({ relativePath }) => !ignored.has(relativePath));
    }
    entries.sort((left, right) => {
      const kindOrder = entryKindOrder(left.kind) - entryKindOrder(right.kind);
      return kindOrder || left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    });
    const start = request.start ?? 0;
    const limit = Math.min(request.limit ?? 50, MAX_TREE_PAGE_SIZE);
    return {
      repositoryId,
      directory,
      entries: entries.slice(start, start + limit),
      start,
      limit,
      total: entries.length,
      hasNext: start + limit < entries.length,
    };
  }

  public async readSource(
    repositoryId: string,
    root: string,
    relativePath: string,
    signal?: AbortSignal,
  ): Promise<RepositorySourceFile> {
    const normalized = normalizeRelativePath(relativePath);
    if (!normalized) throw new RepositoryError('INVALID_INPUT', 'A source file is required.');
    assertViewablePath(normalized);
    const resolved = await resolveAuthorizedPath(root, normalized, 'file');
    let info: Awaited<ReturnType<typeof lstat>>;
    try {
      info = await lstat(resolved);
    } catch (error) {
      throw mapFileSystemError(error, 'The source file could not be inspected.');
    }
    if (info.size > MAX_SOURCE_FILE_SIZE) {
      throw new RepositoryError(
        'REPOSITORY_FILE_TOO_LARGE',
        `Source viewing is limited to ${String(MAX_SOURCE_FILE_SIZE)} bytes.`,
      );
    }
    let bytes: Buffer;
    try {
      bytes = await readFile(resolved, { signal });
    } catch (error) {
      if (signal?.aborted)
        throw new RepositoryError('REPOSITORY_CANCELLED', 'Repository request cancelled.');
      throw mapFileSystemError(error, 'The source file could not be read.');
    }
    if (isBinary(bytes)) {
      throw new RepositoryError(
        'REPOSITORY_BINARY_FILE',
        'Binary files cannot be opened in the source viewer.',
      );
    }
    const decoded = decodeText(bytes);
    return {
      repositoryId,
      relativePath: normalized,
      language: languageForPath(normalized),
      encoding: decoded.encoding,
      byteSize: bytes.byteLength,
      lineCount: decoded.content.length === 0 ? 0 : decoded.content.split(/\r?\n/u).length,
      content: decoded.content,
    };
  }

  public resolveRoot(root: string): Promise<string> {
    return resolveAuthorizedPath(root, '', 'directory');
  }

  public resolveFile(root: string, relativePath: string): Promise<string> {
    const normalized = normalizeRelativePath(relativePath);
    assertViewablePath(normalized);
    return resolveAuthorizedPath(root, normalized, 'file');
  }
}

export function normalizeRelativePath(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length > 4096 ||
    value.includes('\0') ||
    value.includes('\\')
  ) {
    throw new RepositoryError('INVALID_INPUT', 'The repository-relative path is invalid.');
  }
  if (!value) return '';
  if (path.posix.isAbsolute(value)) {
    throw new RepositoryError('REPOSITORY_PATH_OUTSIDE_ROOT', 'Absolute paths are not allowed.');
  }
  const segments = value.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new RepositoryError(
      'REPOSITORY_PATH_OUTSIDE_ROOT',
      'The path leaves the authorized repository.',
    );
  }
  return segments.join('/');
}

async function resolveAuthorizedPath(
  root: string,
  relativePath: string,
  expected: 'directory' | 'file',
): Promise<string> {
  let canonicalRoot: string;
  try {
    canonicalRoot = await realpath(root);
  } catch (error) {
    throw mapFileSystemError(error, 'The repository root could not be resolved.');
  }
  const segments = relativePath ? relativePath.split('/') : [];
  let cursor = canonicalRoot;
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    let info: Awaited<ReturnType<typeof lstat>>;
    try {
      info = await lstat(cursor);
    } catch (error) {
      throw mapFileSystemError(error, 'The requested source path could not be inspected.');
    }
    if (info.isSymbolicLink()) {
      throw new RepositoryError(
        'REPOSITORY_PATH_OUTSIDE_ROOT',
        'Symbolic links and junctions are not followed.',
      );
    }
  }
  let canonicalTarget: string;
  try {
    canonicalTarget = await realpath(cursor);
  } catch (error) {
    throw mapFileSystemError(error, 'The requested source path could not be resolved.');
  }
  if (!isWithin(canonicalRoot, canonicalTarget)) {
    throw new RepositoryError(
      'REPOSITORY_PATH_OUTSIDE_ROOT',
      'The path leaves the authorized repository.',
    );
  }
  let info: Awaited<ReturnType<typeof lstat>>;
  try {
    info = await lstat(canonicalTarget);
  } catch (error) {
    throw mapFileSystemError(error, 'The requested source path could not be inspected.');
  }
  if (expected === 'file' ? !info.isFile() : !info.isDirectory()) {
    throw new RepositoryError('INVALID_INPUT', `The requested source is not a ${expected}.`);
  }
  return canonicalTarget;
}

function assertViewablePath(relativePath: string): void {
  const segments = relativePath.split('/');
  const lowerSegments = segments.map((segment) => segment.toLocaleLowerCase());
  const fileName = lowerSegments.at(-1) ?? '';
  if (
    isSensitiveFileName(fileName) ||
    lowerSegments.some((segment) => EXCLUDED_NAMES.has(segment)) ||
    isExcludedExtension(fileName)
  ) {
    throw new RepositoryError('INVALID_INPUT', 'This path is excluded from source viewing.');
  }
}

function isSensitiveFileName(value: string): boolean {
  const fileName = value.toLocaleLowerCase();
  return fileName === '.env' || (fileName.startsWith('.env.') && fileName !== '.env.example');
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

function isSafeEntryName(name: string): boolean {
  return (
    Boolean(name) &&
    name !== '.' &&
    name !== '..' &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.includes('\0')
  );
}

function isExcludedExtension(name: string): boolean {
  return EXCLUDED_EXTENSIONS.has(path.extname(name).toLocaleLowerCase());
}

function entryKindOrder(kind: RepositoryTreeEntry['kind']): number {
  if (kind === 'directory') return 0;
  if (kind === 'file') return 1;
  return 2;
}

function isBinary(bytes: Buffer): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  if (hasUtf16Bom(sample)) return false;
  if (sample.includes(0)) return true;
  let controls = 0;
  for (const value of sample) {
    if (value < 9 || (value > 13 && value < 32)) controls += 1;
  }
  return sample.length > 0 && controls / sample.length > 0.1;
}

function hasUtf16Bom(bytes: Buffer): boolean {
  return (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
}

function decodeText(bytes: Buffer): {
  readonly content: string;
  readonly encoding: RepositorySourceEncoding;
} {
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return {
        content: new TextDecoder('utf-16le', { fatal: true }).decode(bytes.subarray(2)),
        encoding: 'utf-16le',
      };
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      const swapped = Buffer.from(bytes.subarray(2));
      for (let index = 0; index + 1 < swapped.length; index += 2) {
        const first = swapped[index];
        swapped[index] = swapped[index + 1] ?? 0;
        swapped[index + 1] = first ?? 0;
      }
      return {
        content: new TextDecoder('utf-16le', { fatal: true }).decode(swapped),
        encoding: 'utf-16be',
      };
    }
    const content = new TextDecoder('utf-8', { fatal: true }).decode(
      bytes.subarray(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0),
    );
    return { content, encoding: 'utf-8' };
  } catch (error) {
    throw new RepositoryError(
      'REPOSITORY_UNSUPPORTED_ENCODING',
      'Only UTF-8 and UTF-16 source files are supported.',
      { cause: error },
    );
  }
}

function languageForPath(relativePath: string): string {
  const extension = path.extname(relativePath).toLocaleLowerCase();
  return LANGUAGE_BY_EXTENSION[extension] ?? 'text';
}

const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.c': 'c',
  '.cc': 'cpp',
  '.cpp': 'cpp',
  '.cs': 'csharp',
  '.css': 'css',
  '.go': 'go',
  '.h': 'c',
  '.hpp': 'cpp',
  '.html': 'html',
  '.java': 'java',
  '.js': 'javascript',
  '.json': 'json',
  '.jsx': 'jsx',
  '.kt': 'kotlin',
  '.md': 'markdown',
  '.mjs': 'javascript',
  '.php': 'php',
  '.py': 'python',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.sh': 'shell',
  '.sql': 'sql',
  '.swift': 'swift',
  '.toml': 'toml',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.vue': 'vue',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new RepositoryError('REPOSITORY_CANCELLED', 'Repository request cancelled.');
  }
}
