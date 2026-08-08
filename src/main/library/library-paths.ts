import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { LibraryError } from './errors';

const LIBRARY_FORMAT_VERSION = 1;

export interface LibraryPaths {
  readonly root: string;
  readonly database: string;
  readonly papers: string;
  readonly temporary: string;
  readonly backups: string;
  readonly trash: string;
  readonly manifest: string;
}

interface LibraryManifest {
  readonly formatVersion: number;
  readonly libraryId: string;
  readonly createdAt: string;
}

export function getDefaultLibraryRoot(documentsPath: string): string {
  return path.join(documentsPath, 'PaperMind Library');
}

export async function initializeLibraryPaths(rootPath: string): Promise<LibraryPaths> {
  const root = path.resolve(rootPath);
  const paths: LibraryPaths = {
    root,
    database: path.join(root, 'library.sqlite3'),
    papers: path.join(root, 'papers'),
    temporary: path.join(root, '.tmp'),
    backups: path.join(root, 'backups'),
    trash: path.join(root, 'trash'),
    manifest: path.join(root, '.papermind-library.json'),
  };

  await Promise.all([
    mkdir(paths.papers, { recursive: true }),
    mkdir(paths.temporary, { recursive: true }),
    mkdir(paths.backups, { recursive: true }),
    mkdir(paths.trash, { recursive: true }),
  ]);

  await ensureManifest(paths.manifest);
  return paths;
}

async function ensureManifest(manifestPath: string): Promise<void> {
  try {
    const content = await readFile(manifestPath, 'utf8');
    const value = JSON.parse(content) as Partial<LibraryManifest>;
    if (
      value.formatVersion !== LIBRARY_FORMAT_VERSION ||
      typeof value.libraryId !== 'string' ||
      value.libraryId.length === 0 ||
      typeof value.createdAt !== 'string'
    ) {
      throw new LibraryError('STORAGE_ERROR', 'The PaperMind library manifest is invalid.');
    }
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      const manifest: LibraryManifest = {
        formatVersion: LIBRARY_FORMAT_VERSION,
        libraryId: randomUUID(),
        createdAt: new Date().toISOString(),
      };
      try {
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
          encoding: 'utf8',
          flag: 'wx',
          mode: 0o600,
        });
      } catch (writeError) {
        if (!isNodeError(writeError) || writeError.code !== 'EEXIST') {
          throw writeError;
        }
      }
      return;
    }
    if (error instanceof SyntaxError) {
      throw new LibraryError('STORAGE_ERROR', 'The PaperMind library manifest is invalid.', {
        cause: error,
      });
    }
    throw error;
  }
}

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
