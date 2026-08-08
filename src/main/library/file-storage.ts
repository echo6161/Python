import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, link, lstat, mkdir, open, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { LibraryError } from './errors';
import { isNodeError, type LibraryPaths } from './library-paths';

const PDF_HEADER = Buffer.from('%PDF-', 'ascii');
const MAX_PDF_BYTES = 1024 * 1024 * 1024;
const COPY_BUFFER_BYTES = 1024 * 1024;

export interface StagedPdf {
  readonly temporaryPath: string;
  readonly originalFilename: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly relativePath: string;
  readonly internalFilename: string;
}

export interface CommittedPdf extends StagedPdf {
  readonly absolutePath: string;
  readonly createdManagedFile: boolean;
}

export interface StagedDeletion {
  readonly originalPath: string;
  readonly trashPath: string;
}

export class PaperFileStorage {
  public constructor(private readonly paths: LibraryPaths) {}

  public async stagePdf(sourcePath: string): Promise<StagedPdf> {
    const resolvedSource = path.resolve(sourcePath);
    const originalFilename = path.basename(resolvedSource);
    if (path.extname(originalFilename).toLowerCase() !== '.pdf') {
      throw new LibraryError('INVALID_PDF', 'Only files with a .pdf extension can be imported.');
    }

    let sourceStat;
    try {
      sourceStat = await lstat(resolvedSource);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        throw new LibraryError('FILE_NOT_FOUND', 'The selected PDF no longer exists.', {
          cause: error,
        });
      }
      throw new LibraryError('PERMISSION_DENIED', 'The selected PDF could not be read.', {
        cause: error,
      });
    }

    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
      throw new LibraryError('INVALID_PDF', 'The selected item must be a regular PDF file.');
    }
    if (sourceStat.size <= 0 || sourceStat.size > MAX_PDF_BYTES) {
      throw new LibraryError('INVALID_PDF', 'The PDF is empty or exceeds the 1 GB import limit.');
    }

    const temporaryPath = path.join(this.paths.temporary, `${randomUUID()}.pdf.partial`);
    const source = await open(resolvedSource, 'r');
    const destination = await open(temporaryPath, 'wx', 0o600).catch(async (error: unknown) => {
      await source.close();
      throw new LibraryError('STORAGE_ERROR', 'A temporary import file could not be created.', {
        cause: error,
      });
    });
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
    let position = 0;
    let header = Buffer.alloc(0);
    let copyError: unknown;

    try {
      let hasMoreData = true;
      while (hasMoreData) {
        const { bytesRead } = await source.read(buffer, 0, buffer.length, position);
        if (bytesRead === 0) {
          hasMoreData = false;
          continue;
        }
        const chunk = buffer.subarray(0, bytesRead);
        if (position === 0) {
          header = Buffer.from(chunk.subarray(0, PDF_HEADER.length));
        }
        hash.update(chunk);
        let bytesWritten = 0;
        while (bytesWritten < bytesRead) {
          const result = await destination.write(
            chunk,
            bytesWritten,
            bytesRead - bytesWritten,
            position + bytesWritten,
          );
          if (result.bytesWritten === 0) {
            throw new Error('The destination stopped accepting PDF bytes.');
          }
          bytesWritten += result.bytesWritten;
        }
        position += bytesRead;
      }
      await destination.sync();
    } catch (error) {
      copyError = error;
    } finally {
      await source.close();
      await destination.close();
    }

    if (copyError) {
      await rm(temporaryPath, { force: true });
      throw new LibraryError('STORAGE_ERROR', 'The PDF could not be copied into staging.', {
        cause: copyError,
      });
    }

    try {
      if (!header.equals(PDF_HEADER)) {
        throw new LibraryError(
          'INVALID_PDF',
          'The selected file does not have a valid PDF header.',
        );
      }
      const afterCopy = await stat(resolvedSource);
      if (afterCopy.size !== sourceStat.size || afterCopy.mtimeMs !== sourceStat.mtimeMs) {
        throw new LibraryError(
          'IMPORT_FAILED',
          'The source PDF changed while it was being imported.',
        );
      }

      const sha256 = hash.digest('hex');
      const internalFilename = `${sha256}.pdf`;
      return {
        temporaryPath,
        originalFilename,
        byteSize: position,
        sha256,
        relativePath: path.posix.join('papers', sha256.slice(0, 2), internalFilename),
        internalFilename,
      };
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  public async discardStaged(staged: StagedPdf): Promise<void> {
    await rm(staged.temporaryPath, { force: true });
  }

  public async commitStaged(staged: StagedPdf): Promise<CommittedPdf> {
    const absolutePath = this.resolveManagedPath(staged.relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });

    try {
      await link(staged.temporaryPath, absolutePath);
      await this.discardStaged(staged);
      return { ...staged, absolutePath, createdManagedFile: true };
    } catch (error) {
      if (!isNodeError(error) || (error.code !== 'EEXIST' && error.code !== 'EPERM')) {
        throw new LibraryError('STORAGE_ERROR', 'The managed PDF could not be finalized.', {
          cause: error,
        });
      }

      const existingHash = await this.hashFile(absolutePath);
      if (existingHash !== staged.sha256) {
        throw new LibraryError('STORAGE_ERROR', 'A conflicting managed file already exists.');
      }
      await this.discardStaged(staged);
      return { ...staged, absolutePath, createdManagedFile: false };
    }
  }

  public async rollbackCommitted(file: CommittedPdf): Promise<void> {
    if (file.createdManagedFile) {
      await rm(file.absolutePath, { force: true });
    }
    await this.discardStaged(file);
  }

  public async stageDeletion(relativePath: string, paperId: string): Promise<StagedDeletion> {
    const originalPath = this.resolveManagedPath(relativePath);
    try {
      await access(originalPath, constants.R_OK);
    } catch (error) {
      throw new LibraryError('FILE_NOT_FOUND', 'The managed PDF is already missing.', {
        cause: error,
      });
    }

    const trashDirectory = path.join(this.paths.trash, paperId);
    await mkdir(trashDirectory, { recursive: true });
    const trashPath = path.join(trashDirectory, `${randomUUID()}-${path.basename(originalPath)}`);
    await rename(originalPath, trashPath);
    return { originalPath, trashPath };
  }

  public async restoreDeletion(staged: StagedDeletion): Promise<void> {
    await mkdir(path.dirname(staged.originalPath), { recursive: true });
    await rename(staged.trashPath, staged.originalPath);
  }

  public async finalizeDeletion(staged: StagedDeletion): Promise<void> {
    await rm(staged.trashPath, { force: true });
  }

  public resolveManagedPath(relativePath: string): string {
    if (path.isAbsolute(relativePath)) {
      throw new LibraryError('STORAGE_ERROR', 'Managed file paths must be relative.');
    }
    const resolved = path.resolve(this.paths.root, ...relativePath.split('/'));
    const relative = path.relative(this.paths.root, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new LibraryError('STORAGE_ERROR', 'Managed file path escaped the library root.');
    }
    return resolved;
  }

  private async hashFile(filePath: string): Promise<string> {
    const handle = await open(filePath, 'r');
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
    let position = 0;
    try {
      let hasMoreData = true;
      while (hasMoreData) {
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
        if (bytesRead === 0) {
          hasMoreData = false;
          continue;
        }
        hash.update(buffer.subarray(0, bytesRead));
        position += bytesRead;
      }
      return hash.digest('hex');
    } finally {
      await handle.close();
    }
  }
}
