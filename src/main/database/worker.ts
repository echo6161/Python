import { parentPort, workerData } from 'node:worker_threads';

import { LibraryError } from '../library/errors';
import { LibraryDatabase } from './library-database';
import type {
  DatabaseWorkerData,
  DatabaseWorkerRequest,
  DatabaseWorkerResponse,
} from './worker-protocol';

const port = parentPort;
if (!port) {
  throw new Error('Database worker must run inside a worker thread.');
}

const data = workerData as DatabaseWorkerData;
const database = new LibraryDatabase(data.databasePath);
let queue = Promise.resolve();

async function execute(request: DatabaseWorkerRequest): Promise<unknown> {
  switch (request.method) {
    case 'listPapers':
      return database.listPapers(request.payload);
    case 'getPaper':
      return database.getPaper(request.payload.id);
    case 'findPaperByHash':
      return database.findPaperByHash(request.payload.sha256);
    case 'createImportedPaper':
      return database.createImportedPaper(request.payload);
    case 'updatePaperDetails':
      return database.updatePaperDetails(request.payload);
    case 'updatePaperMetadata':
      return database.updatePaperMetadata(request.payload);
    case 'updatePaperOrganization':
      return database.updatePaperOrganization(request.payload);
    case 'batchUpdatePapers':
      return database.batchUpdatePapers(request.payload);
    case 'listOrganization':
      return database.listOrganization();
    case 'createTag':
      return database.createTag(request.payload);
    case 'deleteTag':
      return database.deleteTag(request.payload.id);
    case 'createCollection':
      return database.createCollection(request.payload);
    case 'deleteCollection':
      return database.deleteCollection(request.payload.id);
    case 'listPendingPaperTextExtractions':
      return database.listPendingPaperTextExtractions();
    case 'savePaperTextExtraction':
      return database.savePaperTextExtraction(request.payload);
    case 'removePaperRecord':
      return database.removePaperRecord(request.payload.id);
    case 'getManagedPaperFile':
      return database.getManagedPaperFile(request.payload.paperId);
    case 'listAnnotations':
      return database.listAnnotations(request.payload.paperId);
    case 'createAnnotation':
      return database.createAnnotation(request.payload);
    case 'updateAnnotation':
      return database.updateAnnotation(request.payload);
    case 'deleteAnnotation':
      return database.deleteAnnotation(request.payload.id, request.payload.rowVersion);
    case 'getReadingState':
      return database.getReadingState(request.payload.paperId);
    case 'saveReadingState':
      return database.saveReadingState(request.payload);
    case 'getAiSettings':
      return database.getAiSettings();
    case 'saveAiSettings':
      return database.saveAiSettings(request.payload);
    case 'createAiTurn':
      return database.createAiTurn(request.payload);
    case 'finalizeAiMessage':
      return database.finalizeAiMessage(request.payload);
    case 'getLatestAiConversation':
      return database.getLatestAiConversation(request.payload.paperId);
    case 'getAiConversation':
      return database.getAiConversation(request.payload.conversationId);
    case 'markStaleAiMessages':
      return database.markStaleAiMessages();
    case 'createWorkspace':
      return database.createWorkspace(request.payload);
    case 'getWorkspace':
      return database.getWorkspace(request.payload.id);
    case 'listWorkspaces':
      return database.listWorkspaces();
    case 'updateWorkspace':
      return database.updateWorkspace(request.payload);
    case 'setWorkspaceStatus':
      return database.setWorkspaceStatus(request.payload);
    case 'deleteWorkspace':
      return database.deleteWorkspace(request.payload.id);
    case 'getLastActiveWorkspace':
      return database.getLastActiveWorkspace();
    case 'setLastActiveWorkspace':
      return database.setLastActiveWorkspace(request.payload.workspaceId);
    case 'addWorkspaceZoteroPaper':
      return database.addWorkspaceZoteroPaper(request.payload.workspaceId, request.payload.itemRef);
    case 'removeWorkspaceZoteroPaper':
      return database.removeWorkspaceZoteroPaper(
        request.payload.workspaceId,
        request.payload.itemRef,
      );
    case 'listWorkspaceZoteroPapers':
      return database.listWorkspaceZoteroPapers(request.payload.workspaceId);
    case 'createOrUpdateRepository':
      return database.createOrUpdateRepository(request.payload);
    case 'getRepository':
      return database.getRepository(request.payload.id);
    case 'updateRepositoryObservation':
      return database.updateRepositoryObservation(request.payload.id, request.payload.observation);
    case 'addWorkspaceRepository':
      return database.addWorkspaceRepository(
        request.payload.workspaceId,
        request.payload.repositoryId,
      );
    case 'removeWorkspaceRepository':
      return database.removeWorkspaceRepository(
        request.payload.workspaceId,
        request.payload.repositoryId,
      );
    case 'listWorkspaceRepositories':
      return database.listWorkspaceRepositories(request.payload.workspaceId);
    case 'deleteRepository':
      return database.deleteRepository(request.payload.id);
    case 'backupTo':
      return database.backupTo(request.payload.destinationPath);
    case 'restoreFrom':
      return database.restoreFrom(request.payload.sourcePath);
    case 'getMigrationVersions':
      return database.getMigrationVersions();
    case 'close':
      return database.close();
  }
}

port.on('message', (request: DatabaseWorkerRequest) => {
  queue = queue.then(async () => {
    try {
      const value = await execute(request);
      const response: DatabaseWorkerResponse = { id: request.id, ok: true, value };
      port.postMessage(response);
    } catch (error) {
      const code = error instanceof LibraryError ? error.code : undefined;
      const response: DatabaseWorkerResponse = {
        id: request.id,
        ok: false,
        error: {
          ...(code ? { code } : {}),
          message:
            error instanceof LibraryError
              ? error.message
              : 'The database worker could not complete the operation.',
        },
      };
      port.postMessage(response);
    }
  });
});
