import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

import type {
  BatchPaperUpdate,
  BatchPaperUpdateResult,
  Collection,
  CreateCollectionInput,
  CreateTagInput,
  LibraryOrganization,
  PaperDetails,
  PaperDetailsUpdate,
  PaperImportBatch,
  PaperImportItem,
  PaperListQuery,
  PaperListResult,
  PaperMetadataUpdate,
  PaperOrganizationUpdate,
  PaperRemovalRequest,
  PaperRemovalResult,
  Tag,
} from '../../shared/contracts/library';
import { type ExtractedPaperData, PdfMetadataExtractor } from '../metadata/pdf-metadata-extractor';
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
    private readonly metadataExtractor: Pick<
      PdfMetadataExtractor,
      'extract'
    > = new PdfMetadataExtractor(),
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

  public updatePaperDetails(input: PaperDetailsUpdate): Promise<PaperDetails> {
    return this.database.updatePaperDetails(input);
  }

  public updatePaperOrganization(input: PaperOrganizationUpdate): Promise<PaperDetails> {
    return this.database.updatePaperOrganization(input);
  }

  public batchUpdatePapers(input: BatchPaperUpdate): Promise<BatchPaperUpdateResult> {
    return this.database.batchUpdatePapers(input);
  }

  public listOrganization(): Promise<LibraryOrganization> {
    return this.database.listOrganization();
  }

  public createTag(input: CreateTagInput): Promise<Tag> {
    return this.database.createTag(input);
  }

  public deleteTag(id: string): Promise<void> {
    return this.database.deleteTag(id);
  }

  public createCollection(input: CreateCollectionInput): Promise<Collection> {
    return this.database.createCollection(input);
  }

  public deleteCollection(id: string): Promise<void> {
    return this.database.deleteCollection(id);
  }

  public async backfillPendingPaperTextExtractions(): Promise<void> {
    const pending = await this.database.listPendingPaperTextExtractions();
    for (const file of pending) {
      try {
        const extracted = await this.metadataExtractor.extract(
          this.storage.resolveManagedPath(file.relativePath),
        );
        if (this.extractionWasCancelled(extracted)) return;
        await this.database.savePaperTextExtraction({
          paperId: file.paperId,
          paperFileId: file.paperFileId,
          pages: this.toDocumentPages(extracted),
          pageCount: extracted.pageCount,
          textExtractionStatus: this.textExtractionStatus(extracted),
          extractionErrorCode: extracted.issues[0]?.code ?? null,
          extractedAt: new Date().toISOString(),
        });
      } catch (error) {
        if (error instanceof LibraryError && error.code === 'NOT_FOUND') continue;
        throw error;
      }
    }
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
          warning: null,
          error: null,
        };
      }

      const extracted = await this.metadataExtractor.extract(staged.temporaryPath);
      if (this.extractionWasCancelled(extracted)) {
        throw new LibraryError(
          'IMPORT_FAILED',
          'PDF import was interrupted before local metadata extraction completed.',
        );
      }
      committed = await this.storage.commitStaged(staged);
      const importedAt = new Date().toISOString();
      const fallbackTitle = this.titleFromFilename(committed.originalFilename);
      const result = await this.database.createImportedPaper({
        paperId: randomUUID(),
        paperFileId: randomUUID(),
        fallbackTitle,
        metadata: [
          {
            field: 'title',
            value: extracted.title.value ?? fallbackTitle,
            source: extracted.title.value ? extracted.title.source : 'filename',
            confidence: extracted.title.value ? extracted.title.confidence : 'unconfirmed',
          },
          {
            field: 'authors',
            value: extracted.authors.value ?? [],
            source: extracted.authors.source,
            confidence: extracted.authors.confidence,
          },
          {
            field: 'abstract',
            value: extracted.abstract.value,
            source: extracted.abstract.source,
            confidence: extracted.abstract.confidence,
          },
          {
            field: 'year',
            value: null,
            source: 'none',
            confidence: 'unconfirmed',
          },
          {
            field: 'doi',
            value: extracted.doi.value,
            source: extracted.doi.source,
            confidence: extracted.doi.confidence,
          },
        ],
        pages: this.toDocumentPages(extracted),
        pageCount: extracted.pageCount,
        textExtractionStatus: this.textExtractionStatus(extracted),
        extractionErrorCode: extracted.issues[0]?.code ?? null,
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
        warning:
          extracted.issues.length > 0
            ? (extracted.issues[0]?.message ?? 'Some PDF metadata could not be extracted.')
            : null,
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
        warning: null,
        error: toApiError(error),
      };
    }
  }

  private titleFromFilename(filename: string): string {
    const parsed = path.parse(filename).name.trim();
    return (parsed.length > 0 ? parsed : 'Untitled paper').slice(0, 500);
  }

  private toDocumentPages(extracted: ExtractedPaperData) {
    return extracted.pages.map(({ pageNumber, text }) => ({
      pageNumber,
      normalizedText: text,
      textHash: createHash('sha256').update(text, 'utf8').digest('hex'),
    }));
  }

  private textExtractionStatus(extracted: ExtractedPaperData): 'succeeded' | 'partial' | 'failed' {
    if (extracted.status === 'complete') return 'succeeded';
    return extracted.status;
  }

  private extractionWasCancelled(extracted: ExtractedPaperData): boolean {
    return extracted.issues.some(({ code }) => code === 'EXTRACTION_CANCELLED');
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
