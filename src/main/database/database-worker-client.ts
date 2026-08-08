import { Worker } from 'node:worker_threads';

import type {
  ApiErrorCode,
  PaperDetails,
  PaperListQuery,
  PaperListResult,
  PaperMetadataUpdate,
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
  ManagedPaperFileRecord,
  PaperDataGateway,
} from '../library/paper-data-gateway';
import type {
  DatabaseWorkerData,
  DatabaseWorkerRequest,
  DatabaseWorkerResponse,
} from './worker-protocol';

interface PendingCall {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
}

export class DatabaseWorkerClient implements PaperDataGateway {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingCall>();
  private nextId = 1;
  private closed = false;

  public constructor(workerPath: string, databasePath: string) {
    const workerData: DatabaseWorkerData = { databasePath };
    this.worker = new Worker(workerPath, { workerData });
    this.worker.on('message', (response: DatabaseWorkerResponse) => {
      const call = this.pending.get(response.id);
      if (!call) {
        return;
      }
      this.pending.delete(response.id);
      if (response.ok) {
        call.resolve(response.value);
      } else {
        call.reject(
          new LibraryError(
            (response.error.code as ApiErrorCode | undefined) ?? 'DATABASE_ERROR',
            response.error.message,
          ),
        );
      }
    });
    this.worker.on('error', (error) => {
      this.rejectPending(error);
    });
    this.worker.on('exit', (code) => {
      if (!this.closed && code !== 0) {
        this.rejectPending(new Error(`Database worker exited with code ${String(code)}.`));
      }
    });
  }

  public listPapers(query: PaperListQuery = {}): Promise<PaperListResult> {
    return this.call('listPapers', query);
  }

  public getPaper(id: string): Promise<PaperDetails | null> {
    return this.call('getPaper', { id });
  }

  public findPaperByHash(sha256: string): Promise<PaperDetails | null> {
    return this.call('findPaperByHash', { sha256 });
  }

  public createImportedPaper(input: ImportedPaperRecord): Promise<CreateImportedPaperResult> {
    return this.call('createImportedPaper', input);
  }

  public updatePaperMetadata(input: PaperMetadataUpdate): Promise<PaperDetails> {
    return this.call('updatePaperMetadata', input);
  }

  public removePaperRecord(id: string): Promise<PaperDetails> {
    return this.call('removePaperRecord', { id });
  }

  public getManagedPaperFile(paperId: string): Promise<ManagedPaperFileRecord | null> {
    return this.call('getManagedPaperFile', { paperId });
  }

  public listAnnotations(paperId: string): Promise<readonly Annotation[]> {
    return this.call('listAnnotations', { paperId });
  }

  public createAnnotation(input: CreateAnnotationInput): Promise<Annotation> {
    return this.call('createAnnotation', input);
  }

  public updateAnnotation(input: UpdateAnnotationInput): Promise<Annotation> {
    return this.call('updateAnnotation', input);
  }

  public async deleteAnnotation(id: string, rowVersion: number): Promise<void> {
    await this.call('deleteAnnotation', { id, rowVersion });
  }

  public getReadingState(paperId: string): Promise<ReadingState | null> {
    return this.call('getReadingState', { paperId });
  }

  public saveReadingState(input: SaveReadingStateInput): Promise<ReadingState> {
    return this.call('saveReadingState', input);
  }

  public async backupTo(destinationPath: string): Promise<void> {
    await this.call('backupTo', { destinationPath });
  }

  public async restoreFrom(sourcePath: string): Promise<void> {
    await this.call('restoreFrom', { sourcePath });
  }

  public getMigrationVersions(): Promise<readonly number[]> {
    return this.call('getMigrationVersions', null);
  }

  public async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    await this.call('close', null);
    this.closed = true;
    await this.worker.terminate();
  }

  private call<T>(method: DatabaseWorkerRequest['method'], payload: unknown): Promise<T> {
    if (this.closed) {
      return Promise.reject(new LibraryError('DATABASE_ERROR', 'The database is closed.'));
    }

    const id = this.nextId++;
    const request = { id, method, payload } as DatabaseWorkerRequest;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.worker.postMessage(request);
    });
  }

  private rejectPending(reason: unknown): void {
    for (const call of this.pending.values()) {
      call.reject(reason);
    }
    this.pending.clear();
  }
}
