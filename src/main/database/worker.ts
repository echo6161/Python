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
    case 'updatePaperMetadata':
      return database.updatePaperMetadata(request.payload);
    case 'removePaperRecord':
      return database.removePaperRecord(request.payload.id);
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
