import { createHash } from 'node:crypto';

import type { CodeLanguage } from '../../shared/contracts/code-intelligence';
import type { RepositoryRef } from '../../shared/contracts/repository';
import { RepositoryError } from '../repository/repository-errors';
import type { GitRepositoryClient } from '../repository/git-repository-client';
import type { RepositoryFileService } from '../repository/repository-file-service';
import { languageForCodePath, type CodeParserInput } from './code-parser';

const MAX_INDEX_FILES = 2_000;
const MAX_INDEX_DIRECTORIES = 2_000;
const MAX_INDEX_BYTES = 25 * 1024 * 1024;

export interface CodeIndexManifest {
  readonly snapshotIdentity: string;
  readonly dirty: boolean;
  readonly files: readonly CodeParserInput[];
  readonly totalBytes: number;
}

export class CodeIndexScanner {
  public constructor(
    private readonly files: Pick<RepositoryFileService, 'listTree' | 'readSource'>,
    private readonly git: Pick<
      GitRepositoryClient,
      'hasWorkingTreeChanges' | 'inspectExistingRoot'
    >,
  ) {}

  public async scan(
    repository: RepositoryRef,
    signal?: AbortSignal,
    onFile?: (processed: number, relativePath: string) => void,
  ): Promise<CodeIndexManifest> {
    const directories = [''];
    const discovered: { readonly relativePath: string; readonly language: CodeLanguage }[] = [];
    for (const directory of directories) {
      throwIfAborted(signal);
      if (directories.length > MAX_INDEX_DIRECTORIES)
        throw limit('directory', MAX_INDEX_DIRECTORIES);
      let start = 0;
      for (;;) {
        const page = await this.files.listTree(
          repository.id,
          repository.canonicalRoot,
          repository.kind,
          {
            repositoryId: repository.id,
            requestId: crypto.randomUUID(),
            relativePath: directory,
            start,
            limit: 100,
          },
          signal,
        );
        for (const entry of page.entries) {
          if (entry.kind === 'directory') directories.push(entry.relativePath);
          else if (entry.kind === 'file') {
            const language = languageForCodePath(entry.relativePath);
            if (language) discovered.push({ relativePath: entry.relativePath, language });
          }
        }
        if (discovered.length > MAX_INDEX_FILES) throw limit('file', MAX_INDEX_FILES);
        if (!page.hasNext) break;
        start += page.limit;
      }
    }
    const manifestFiles: CodeParserInput[] = [];
    let totalBytes = 0;
    for (const [index, item] of discovered
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
      .entries()) {
      throwIfAborted(signal);
      try {
        const source = await this.files.readSource(
          repository.id,
          repository.canonicalRoot,
          item.relativePath,
          signal,
        );
        totalBytes += source.byteSize;
        if (totalBytes > MAX_INDEX_BYTES) throw limit('byte', MAX_INDEX_BYTES);
        const contentHash = createHash('sha256')
          .update(source.encoding, 'utf8')
          .update('\0', 'utf8')
          .update(source.content, 'utf8')
          .digest('hex');
        manifestFiles.push({
          relativePath: item.relativePath,
          language: item.language,
          content: source.content,
          contentHash,
          byteSize: source.byteSize,
        });
        onFile?.(index + 1, item.relativePath);
      } catch (error) {
        if (error instanceof RepositoryError && skippable(error.code)) continue;
        throw error;
      }
    }
    const manifestHash = createHash('sha256');
    for (const file of manifestFiles) {
      manifestHash
        .update(file.relativePath, 'utf8')
        .update('\0')
        .update(file.contentHash, 'ascii')
        .update('\0');
    }
    const inspection = await this.git.inspectExistingRoot(repository.canonicalRoot, signal);
    const dirty =
      inspection.kind === 'git'
        ? await this.git.hasWorkingTreeChanges(inspection.canonicalRoot, signal)
        : true;
    const digest = manifestHash.digest('hex');
    const snapshotIdentity =
      inspection.kind === 'git' && inspection.headCommit && !dirty
        ? `git:${inspection.headCommit}`
        : inspection.kind === 'git'
          ? `dirty:${inspection.headCommit ?? 'unborn'}:${digest}`
          : `content:${digest}`;
    return { snapshotIdentity, dirty, files: manifestFiles, totalBytes };
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new RepositoryError('CODE_INDEX_CANCELLED', 'Code indexing was cancelled.');
}

function limit(kind: string, value: number): RepositoryError {
  return new RepositoryError(
    'CODE_INDEX_LIMIT_EXCEEDED',
    `Code indexing exceeded the ${String(value)}-${kind} safety limit.`,
  );
}

function skippable(code: string): boolean {
  return [
    'REPOSITORY_BINARY_FILE',
    'REPOSITORY_FILE_TOO_LARGE',
    'REPOSITORY_UNSUPPORTED_ENCODING',
    'INVALID_INPUT',
  ].includes(code);
}
