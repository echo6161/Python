import { randomUUID } from 'node:crypto';
import { copyFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';

import type {
  BatchPaperUpdate,
  BatchPaperUpdateResult,
  Collection,
  CreateCollectionInput,
  CreateTagInput,
  LibraryOrganization,
  PaperDetails,
  PaperDetailsUpdate,
  PaperListQuery,
  PaperListResult,
  PaperMetadataUpdate,
  PaperOrganizationUpdate,
  Tag,
} from '../../shared/contracts/library';
import type {
  Annotation,
  CreateAnnotationInput,
  ReadingState,
  SaveReadingStateInput,
  UpdateAnnotationInput,
} from '../../shared/contracts/reader';
import { LibraryError } from '../library/errors';
import type {
  CreateImportedPaperResult,
  ImportedPaperRecord,
  PaperTextExtractionRecord,
  PendingPaperTextExtraction,
  PaperDataGateway,
} from '../library/paper-data-gateway';
import { applyMigrations } from './migrations';
import { PaperRepository } from './paper-repository';
import { ReaderRepository } from './reader-repository';

export class LibraryDatabase implements PaperDataGateway {
  private database: BetterSqlite3.Database;
  private repository: PaperRepository;
  private readerRepository: ReaderRepository;

  public constructor(private readonly databasePath: string) {
    this.database = this.openDatabase(databasePath);
    this.repository = new PaperRepository(this.database);
    this.readerRepository = new ReaderRepository(this.database);
  }

  public listPapers(query?: PaperListQuery): Promise<PaperListResult> {
    return this.run(() => this.repository.list(query));
  }

  public getPaper(id: string): Promise<PaperDetails | null> {
    return this.run(() => this.repository.getById(id));
  }

  public findPaperByHash(sha256: string): Promise<PaperDetails | null> {
    return this.run(() => this.repository.findByHash(sha256));
  }

  public createImportedPaper(input: ImportedPaperRecord): Promise<CreateImportedPaperResult> {
    return this.run(() => this.repository.createImported(input));
  }

  public updatePaperDetails(input: PaperDetailsUpdate): Promise<PaperDetails> {
    return this.run(() => this.repository.updateDetails(input));
  }

  public updatePaperMetadata(input: PaperMetadataUpdate): Promise<PaperDetails> {
    return this.run(() => this.repository.updateMetadata(input));
  }

  public updatePaperOrganization(input: PaperOrganizationUpdate): Promise<PaperDetails> {
    return this.run(() => this.repository.updateOrganization(input));
  }

  public batchUpdatePapers(input: BatchPaperUpdate): Promise<BatchPaperUpdateResult> {
    return this.run(() => this.repository.batchUpdate(input));
  }

  public listOrganization(): Promise<LibraryOrganization> {
    return this.run(() => this.repository.listOrganization());
  }

  public createTag(input: CreateTagInput): Promise<Tag> {
    return this.run(() => this.repository.createTag(input));
  }

  public deleteTag(id: string): Promise<void> {
    return this.run(() => this.repository.deleteTag(id));
  }

  public createCollection(input: CreateCollectionInput): Promise<Collection> {
    return this.run(() => this.repository.createCollection(input));
  }

  public deleteCollection(id: string): Promise<void> {
    return this.run(() => this.repository.deleteCollection(id));
  }

  public listPendingPaperTextExtractions(): Promise<readonly PendingPaperTextExtraction[]> {
    return this.run(() => this.repository.listPendingTextExtractions());
  }

  public savePaperTextExtraction(input: PaperTextExtractionRecord): Promise<void> {
    return this.run(() => this.repository.saveTextExtraction(input));
  }

  public removePaperRecord(id: string): Promise<PaperDetails> {
    return this.run(() => this.repository.remove(id));
  }

  public getManagedPaperFile(paperId: string) {
    return this.run(() => this.readerRepository.getManagedPaperFile(paperId));
  }

  public listAnnotations(paperId: string): Promise<readonly Annotation[]> {
    return this.run(() => this.readerRepository.listAnnotations(paperId));
  }

  public createAnnotation(input: CreateAnnotationInput): Promise<Annotation> {
    return this.run(() => this.readerRepository.createAnnotation(input));
  }

  public updateAnnotation(input: UpdateAnnotationInput): Promise<Annotation> {
    return this.run(() => this.readerRepository.updateAnnotation(input));
  }

  public deleteAnnotation(id: string, rowVersion: number): Promise<void> {
    return this.run(() => this.readerRepository.deleteAnnotation(id, rowVersion));
  }

  public getReadingState(paperId: string): Promise<ReadingState | null> {
    return this.run(() => this.readerRepository.getReadingState(paperId));
  }

  public saveReadingState(input: SaveReadingStateInput): Promise<ReadingState> {
    return this.run(() => this.readerRepository.saveReadingState(input));
  }

  public async backupTo(destinationPath: string): Promise<void> {
    await this.database.backup(destinationPath);
  }

  public async restoreFrom(sourcePath: string): Promise<void> {
    if (path.resolve(sourcePath) === path.resolve(this.databasePath)) {
      throw new LibraryError('INVALID_INPUT', 'The active database cannot restore itself.');
    }

    const suffix = randomUUID();
    const stagedPath = `${this.databasePath}.restore-${suffix}`;
    const previousPath = `${this.databasePath}.previous-${suffix}`;
    await copyFile(sourcePath, stagedPath);

    try {
      const candidate = this.openDatabase(stagedPath);
      try {
        const integrity = candidate.pragma('integrity_check', { simple: true }) as string;
        if (integrity !== 'ok') {
          throw new LibraryError('DATABASE_ERROR', 'The selected backup failed integrity checks.');
        }
        const foreignKeyErrors = candidate.pragma('foreign_key_check') as readonly unknown[];
        if (foreignKeyErrors.length > 0) {
          throw new LibraryError('DATABASE_ERROR', 'The selected backup has broken relationships.');
        }
      } finally {
        candidate.close();
      }

      this.database.pragma('wal_checkpoint(TRUNCATE)');
      this.database.close();
      await rename(this.databasePath, previousPath);
      await rename(stagedPath, this.databasePath);

      try {
        this.database = this.openDatabase(this.databasePath);
        this.repository = new PaperRepository(this.database);
        this.readerRepository = new ReaderRepository(this.database);
      } catch (error) {
        await rm(this.databasePath, { force: true });
        await rename(previousPath, this.databasePath);
        this.database = this.openDatabase(this.databasePath);
        this.repository = new PaperRepository(this.database);
        this.readerRepository = new ReaderRepository(this.database);
        throw error;
      }

      await rm(previousPath, { force: true });
    } finally {
      await rm(stagedPath, { force: true });
    }
  }

  public getMigrationVersions(): Promise<readonly number[]> {
    return this.run(() =>
      (
        this.database.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as {
          readonly version: number;
        }[]
      ).map(({ version }) => version),
    );
  }

  public close(): Promise<void> {
    return this.run(() => {
      if (this.database.open) this.database.close();
    });
  }

  private openDatabase(databasePath: string): BetterSqlite3.Database {
    const database = new BetterSqlite3(databasePath);
    database.pragma('foreign_keys = ON');
    database.pragma('busy_timeout = 5000');
    database.pragma('journal_mode = WAL');
    database.pragma('synchronous = NORMAL');
    applyMigrations(database);
    return database;
  }

  private run<T>(operation: () => T): Promise<T> {
    return Promise.resolve().then(operation);
  }
}
