import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type {
  PaperDetails,
  PaperImportBatch,
  PaperImportItem,
  PaperListQuery,
  PaperListResult,
  PaperMetadataUpdate,
  PaperRemovalRequest,
  PaperRemovalResult,
} from '../../shared/contracts/library';
import { LibraryError, toApiError } from './errors';
import type { CommittedPdf, PaperFileStorage, StagedPdf } from './file-storage';
import type { LibraryPaths } from './library-paths';
import type { PaperDataGateway } from './paper-data-gateway';

export class PaperLibraryService {
  private importQueue = Promise.resolve();

  public constructor(
    private readonly database: PaperDataGateway,
    private readonly storage: PaperFileStorage,
    private readonly paths: LibraryPaths,
  ) {}

  public listPapers(query?: PaperListQuery): Promise<PaperListResult> {
    return this.database.listPapers(query);
  }

  public async getPaper(id: string): Promise<PaperDetails> {
    const paper = await this.database.getPaper(id);
    if (!paper) {
      throw new LibraryError('NOT_FOUND', 'The paper no longer exists.');
    }
    return paper;
  }

  public updatePaperMetadata(input: PaperMetadataUpdate): Promise<PaperDetails> {
    return this.database.updatePaperMetadata(input);
  }

  public importPdfPaths(sourcePaths: readonly string[]): Promise<PaperImportBatch> {
    return this.runImportExclusive(async () => {
      const items: PaperImportItem[] = [];
      for (const sourcePath of sourcePaths) {
        items.push(await this.importOne(sourcePath));
      }
      return { cancelled: false, items };
    });
  }

  public async removePaper(input: PaperRemovalRequest): Promise<PaperRemovalResult> {
    const paper = await this.getPaper(input.id);
    if (input.mode === 'record-only') {
      await this.database.removePaperRecord(input.id);
      return { id: input.id, managedFileDeleted: false };
    }

    const relativePath = path.posix.join(
      'papers',
      paper.file.sha256.slice(0, 2),
      paper.file.internalFilename,
    );
    const staged = await this.storage.stageDeletion(relativePath, paper.id);
    try {
      await this.database.removePaperRecord(input.id);
    } catch (error) {
      await this.storage.restoreDeletion(staged);
      throw error;
    }
    await this.storage.finalizeDeletion(staged);
    return { id: input.id, managedFileDeleted: true };
  }

  public async createDatabaseBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const destination = path.join(this.paths.backups, `library-${timestamp}.sqlite3`);
    await this.database.backupTo(destination);
    return destination;
  }

  public async restoreDatabaseBackup(sourcePath: string): Promise<void> {
    await this.createDatabaseBackup();
    await this.database.restoreFrom(sourcePath);
  }

  private async importOne(sourcePath: string): Promise<PaperImportItem> {
    const originalFilename = path.basename(sourcePath) || 'Unknown PDF';
    let staged: StagedPdf | null = null;
    let committed: CommittedPdf | null = null;
    try {
      staged = await this.storage.stagePdf(sourcePath);
      const duplicate = await this.database.findPaperByHash(staged.sha256);
      if (duplicate) {
        await this.storage.discardStaged(staged);
        return {
          originalFilename: staged.originalFilename,
          status: 'duplicate',
          paper: duplicate,
          error: null,
        };
      }

      committed = await this.storage.commitStaged(staged);
      const importedAt = new Date().toISOString();
      const result = await this.database.createImportedPaper({
        paperId: randomUUID(),
        paperFileId: randomUUID(),
        title: this.titleFromFilename(committed.originalFilename),
        sha256: committed.sha256,
        relativePath: committed.relativePath,
        internalFilename: committed.internalFilename,
        originalFilename: committed.originalFilename,
        byteSize: committed.byteSize,
        importedAt,
      });
      return {
        originalFilename: committed.originalFilename,
        status: result.status === 'created' ? 'imported' : 'duplicate',
        paper: result.paper,
        error: null,
      };
    } catch (error) {
      if (committed) {
        try {
          await this.storage.rollbackCommitted(committed);
        } catch {
          // The original error is more actionable; orphan cleanup can be retried on startup.
        }
      } else if (staged) {
        await this.storage.discardStaged(staged);
      }
      return {
        originalFilename,
        status: 'failed',
        paper: null,
        error: toApiError(error),
      };
    }
  }

  private titleFromFilename(filename: string): string {
    const parsed = path.parse(filename).name.trim();
    return (parsed.length > 0 ? parsed : 'Untitled paper').slice(0, 500);
  }

  private runImportExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.importQueue.then(operation, operation);
    this.importQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
