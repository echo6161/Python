import { randomUUID } from 'node:crypto';
import { copyFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';

import type {
  PaperDetails,
  PaperListQuery,
  PaperListResult,
  PaperMetadataUpdate,
} from '../../shared/contracts/library';
import { LibraryError } from '../library/errors';
import type {
  CreateImportedPaperResult,
  ImportedPaperRecord,
  PaperDataGateway,
} from '../library/paper-data-gateway';
import { applyMigrations } from './migrations';
import { PaperRepository } from './paper-repository';

export class LibraryDatabase implements PaperDataGateway {
  private database: BetterSqlite3.Database;
  private repository: PaperRepository;

  public constructor(private readonly databasePath: string) {
    this.database = this.openDatabase(databasePath);
    this.repository = new PaperRepository(this.database);
  }

  public listPapers(query?: PaperListQuery): Promise<PaperListResult> {
    return Promise.resolve(this.repository.list(query));
  }

  public getPaper(id: string): Promise<PaperDetails | null> {
    return Promise.resolve(this.repository.getById(id));
  }

  public findPaperByHash(sha256: string): Promise<PaperDetails | null> {
    return Promise.resolve(this.repository.findByHash(sha256));
  }

  public createImportedPaper(input: ImportedPaperRecord): Promise<CreateImportedPaperResult> {
    return Promise.resolve(this.repository.createImported(input));
  }

  public updatePaperMetadata(input: PaperMetadataUpdate): Promise<PaperDetails> {
    return Promise.resolve(this.repository.updateMetadata(input));
  }

  public removePaperRecord(id: string): Promise<PaperDetails> {
    return Promise.resolve(this.repository.remove(id));
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
      } catch (error) {
        await rm(this.databasePath, { force: true });
        await rename(previousPath, this.databasePath);
        this.database = this.openDatabase(this.databasePath);
        this.repository = new PaperRepository(this.database);
        throw error;
      }

      await rm(previousPath, { force: true });
    } finally {
      await rm(stagedPath, { force: true });
    }
  }

  public getMigrationVersions(): Promise<readonly number[]> {
    const versions = (
      this.database.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as {
        readonly version: number;
      }[]
    ).map(({ version }) => version);
    return Promise.resolve(versions);
  }

  public close(): Promise<void> {
    if (this.database.open) {
      this.database.close();
    }
    return Promise.resolve();
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
}
