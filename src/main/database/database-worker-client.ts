import { Worker } from 'node:worker_threads';

import type { AiConversation, AiMessage, AiProviderSettings } from '../../shared/contracts/ai';
import type {
  AiDataGateway,
  CreateAiTurnInput,
  CreateAiTurnResult,
  FinalizeAiMessageInput,
} from '../ai/ai-data-gateway';
import type {
  ApiErrorCode,
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
import type {
  CreateWorkspaceInput,
  SetWorkspaceStatusInput,
  UpdateWorkspaceInput,
  Workspace,
} from '../../shared/contracts/workspace';
import type { ZoteroItemRef } from '../../shared/contracts/zotero';
import { LibraryError } from '../library/errors';
import type {
  CreateImportedPaperResult,
  ImportedPaperRecord,
  ManagedPaperFileRecord,
  PaperTextExtractionRecord,
  PendingPaperTextExtraction,
  PaperDataGateway,
} from '../library/paper-data-gateway';
import type {
  StoredWorkspaceZoteroPaper,
  WorkspaceDataGateway,
} from '../workspace/workspace-data-gateway';
import type {
  RepositoryDataGateway,
  RepositoryObservationInput,
} from '../repository/repository-data-gateway';
import type { RepositoryRef, WorkspaceRepositoryRef } from '../../shared/contracts/repository';
import type {
  DatabaseWorkerData,
  DatabaseWorkerRequest,
  DatabaseWorkerResponse,
} from './worker-protocol';

interface PendingCall {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
}

export class DatabaseWorkerClient implements PaperDataGateway, AiDataGateway {
  public readonly workspace: WorkspaceDataGateway;
  public readonly repository: RepositoryDataGateway;
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingCall>();
  private nextId = 1;
  private closed = false;

  public constructor(workerPath: string, databasePath: string) {
    const workerData: DatabaseWorkerData = { databasePath };
    this.worker = new Worker(workerPath, { workerData });
    this.workspace = new WorkspaceWorkerGateway((method, payload) => this.call(method, payload));
    this.repository = new RepositoryWorkerGateway((method, payload) => this.call(method, payload));
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

  public updatePaperDetails(input: PaperDetailsUpdate): Promise<PaperDetails> {
    return this.call('updatePaperDetails', input);
  }

  public updatePaperMetadata(input: PaperMetadataUpdate): Promise<PaperDetails> {
    return this.call('updatePaperMetadata', input);
  }

  public updatePaperOrganization(input: PaperOrganizationUpdate): Promise<PaperDetails> {
    return this.call('updatePaperOrganization', input);
  }

  public batchUpdatePapers(input: BatchPaperUpdate): Promise<BatchPaperUpdateResult> {
    return this.call('batchUpdatePapers', input);
  }

  public listOrganization(): Promise<LibraryOrganization> {
    return this.call('listOrganization', null);
  }

  public createTag(input: CreateTagInput): Promise<Tag> {
    return this.call('createTag', input);
  }

  public async deleteTag(id: string): Promise<void> {
    await this.call('deleteTag', { id });
  }

  public createCollection(input: CreateCollectionInput): Promise<Collection> {
    return this.call('createCollection', input);
  }

  public async deleteCollection(id: string): Promise<void> {
    await this.call('deleteCollection', { id });
  }

  public listPendingPaperTextExtractions(): Promise<readonly PendingPaperTextExtraction[]> {
    return this.call('listPendingPaperTextExtractions', null);
  }

  public async savePaperTextExtraction(input: PaperTextExtractionRecord): Promise<void> {
    await this.call('savePaperTextExtraction', input);
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

  public getAiSettings(): Promise<AiProviderSettings | null> {
    return this.call('getAiSettings', null);
  }

  public saveAiSettings(settings: AiProviderSettings): Promise<AiProviderSettings> {
    return this.call('saveAiSettings', settings);
  }

  public createAiTurn(input: CreateAiTurnInput): Promise<CreateAiTurnResult> {
    return this.call('createAiTurn', input);
  }

  public finalizeAiMessage(input: FinalizeAiMessageInput): Promise<AiMessage> {
    return this.call('finalizeAiMessage', input);
  }

  public getLatestAiConversation(paperId: string): Promise<AiConversation | null> {
    return this.call('getLatestAiConversation', { paperId });
  }

  public getAiConversation(conversationId: string): Promise<AiConversation | null> {
    return this.call('getAiConversation', { conversationId });
  }

  public markStaleAiMessages(): Promise<number> {
    return this.call('markStaleAiMessages', null);
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

class WorkspaceWorkerGateway implements WorkspaceDataGateway {
  public constructor(
    private readonly call: <T>(
      method: DatabaseWorkerRequest['method'],
      payload: unknown,
    ) => Promise<T>,
  ) {}

  public createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
    return this.call('createWorkspace', input);
  }

  public getWorkspace(id: string): Promise<Workspace | null> {
    return this.call('getWorkspace', { id });
  }

  public listWorkspaces(): Promise<readonly Workspace[]> {
    return this.call('listWorkspaces', null);
  }

  public updateWorkspace(input: UpdateWorkspaceInput): Promise<Workspace> {
    return this.call('updateWorkspace', input);
  }

  public setWorkspaceStatus(input: SetWorkspaceStatusInput): Promise<Workspace> {
    return this.call('setWorkspaceStatus', input);
  }

  public deleteWorkspace(id: string): Promise<boolean> {
    return this.call('deleteWorkspace', { id });
  }

  public getLastActiveWorkspace(): Promise<Workspace | null> {
    return this.call('getLastActiveWorkspace', null);
  }

  public setLastActiveWorkspace(workspaceId: string | null): Promise<Workspace | null> {
    return this.call('setLastActiveWorkspace', { workspaceId });
  }

  public addWorkspaceZoteroPaper(
    workspaceId: string,
    itemRef: ZoteroItemRef,
  ): Promise<StoredWorkspaceZoteroPaper> {
    return this.call('addWorkspaceZoteroPaper', { workspaceId, itemRef });
  }

  public removeWorkspaceZoteroPaper(workspaceId: string, itemRef: ZoteroItemRef): Promise<boolean> {
    return this.call('removeWorkspaceZoteroPaper', { workspaceId, itemRef });
  }

  public listWorkspaceZoteroPapers(
    workspaceId: string,
  ): Promise<readonly StoredWorkspaceZoteroPaper[]> {
    return this.call('listWorkspaceZoteroPapers', { workspaceId });
  }
}

class RepositoryWorkerGateway implements RepositoryDataGateway {
  public constructor(
    private readonly call: <T>(
      method: DatabaseWorkerRequest['method'],
      payload: unknown,
    ) => Promise<T>,
  ) {}

  public createOrUpdateRepository(input: RepositoryObservationInput): Promise<RepositoryRef> {
    return this.call('createOrUpdateRepository', input);
  }

  public getRepository(id: string): Promise<RepositoryRef | null> {
    return this.call('getRepository', { id });
  }

  public updateRepositoryObservation(
    id: string,
    input: Omit<RepositoryObservationInput, 'canonicalKey' | 'canonicalRoot' | 'displayName'>,
  ): Promise<RepositoryRef> {
    return this.call('updateRepositoryObservation', { id, observation: input });
  }

  public addWorkspaceRepository(
    workspaceId: string,
    repositoryId: string,
  ): Promise<WorkspaceRepositoryRef> {
    return this.call('addWorkspaceRepository', { workspaceId, repositoryId });
  }

  public removeWorkspaceRepository(workspaceId: string, repositoryId: string): Promise<boolean> {
    return this.call('removeWorkspaceRepository', { workspaceId, repositoryId });
  }

  public listWorkspaceRepositories(
    workspaceId: string,
  ): Promise<readonly WorkspaceRepositoryRef[]> {
    return this.call('listWorkspaceRepositories', { workspaceId });
  }

  public deleteRepository(id: string): Promise<boolean> {
    return this.call('deleteRepository', { id });
  }
}
