import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { ZodType } from 'zod';

import type { ApiResult } from '../../shared/contracts/library';
import {
  REPOSITORY_IPC_CHANNELS,
  type RepositorySourceFile,
  type RepositoryTreePage,
  type WorkspaceRepositoryRef,
} from '../../shared/contracts/repository';
import { createConsoleLogger } from '../../shared/logging';
import { LibraryError, toApiError } from '../library/errors';
import { RepositoryError, toRepositoryApiError } from '../repository/repository-errors';
import type { RepositoryService } from '../repository/repository-service';
import { ensureTrustedSender } from './library-ipc';
import {
  cancelledRepositorySchema,
  deletedRepositorySchema,
  deleteRepositoryRefSchema,
  openedRepositorySchema,
  openRepositoryInVscodeSchema,
  removedRepositorySchema,
  repositoryIdSchema,
  repositoryRequestSchema,
  repositorySchema,
  repositorySourceFileSchema,
  repositorySourceRequestSchema,
  repositoryTreePageSchema,
  repositoryTreeRequestSchema,
  workspaceRepositoryInputSchema,
  workspaceRepositoryListSchema,
  workspaceRepositorySchema,
} from './repository-schemas';

const logger = createConsoleLogger('repository-ipc');
const requests = new Map<string, AbortController>();

export function registerRepositoryIpcHandlers(service: RepositoryService): void {
  ipcMain.handle(REPOSITORY_IPC_CHANNELS.chooseAndLink, (event, input: unknown) =>
    invokeRepositoryValidated(event, workspaceRepositorySchema.nullable(), () =>
      service.chooseAndLink(repositoryIdSchema.parse(input)),
    ),
  );
  ipcMain.handle(REPOSITORY_IPC_CHANNELS.listForWorkspace, (event, input: unknown) =>
    invokeRepositoryValidated<readonly WorkspaceRepositoryRef[]>(
      event,
      workspaceRepositoryListSchema,
      () => service.listForWorkspace(repositoryIdSchema.parse(input)),
    ),
  );
  ipcMain.handle(REPOSITORY_IPC_CHANNELS.removeFromWorkspace, (event, input: unknown) =>
    invokeRepositoryValidated(event, removedRepositorySchema, () =>
      service.removeFromWorkspace(workspaceRepositoryInputSchema.parse(input)),
    ),
  );
  ipcMain.handle(REPOSITORY_IPC_CHANNELS.deleteReference, (event, input: unknown) =>
    invokeRepositoryValidated(event, deletedRepositorySchema, () =>
      service.deleteReference(deleteRepositoryRefSchema.parse(input)),
    ),
  );
  ipcMain.handle(REPOSITORY_IPC_CHANNELS.refresh, (event, input: unknown) =>
    invokeRepositoryValidated(event, repositorySchema, async () => {
      const request = repositoryRequestSchema.parse(input);
      return runCancellable(event, request.requestId, (signal) =>
        service.refresh(request.repositoryId, signal),
      );
    }),
  );
  ipcMain.handle(REPOSITORY_IPC_CHANNELS.listTree, (event, input: unknown) =>
    invokeRepositoryValidated<RepositoryTreePage>(event, repositoryTreePageSchema, async () => {
      const parsed = repositoryTreeRequestSchema.parse(input);
      const request = {
        repositoryId: parsed.repositoryId,
        requestId: parsed.requestId,
        relativePath: parsed.relativePath,
        ...(parsed.start === undefined ? {} : { start: parsed.start }),
        ...(parsed.limit === undefined ? {} : { limit: parsed.limit }),
      };
      return runCancellable(event, request.requestId, (signal) =>
        service.listTree(request, signal),
      );
    }),
  );
  ipcMain.handle(REPOSITORY_IPC_CHANNELS.readSource, (event, input: unknown) =>
    invokeRepositoryValidated<RepositorySourceFile>(event, repositorySourceFileSchema, async () => {
      const request = repositorySourceRequestSchema.parse(input);
      return runCancellable(event, request.requestId, (signal) =>
        service.readSource(request, signal),
      );
    }),
  );
  ipcMain.handle(REPOSITORY_IPC_CHANNELS.openInVscode, (event, input: unknown) =>
    invokeRepositoryValidated(event, openedRepositorySchema, () => {
      const parsed = openRepositoryInVscodeSchema.parse(input);
      return service.openInVscode({
        repositoryId: parsed.repositoryId,
        ...(parsed.relativePath === undefined ? {} : { relativePath: parsed.relativePath }),
        ...(parsed.line === undefined ? {} : { line: parsed.line }),
        ...(parsed.column === undefined ? {} : { column: parsed.column }),
      });
    }),
  );
  ipcMain.handle(REPOSITORY_IPC_CHANNELS.cancelRequest, (event, input: unknown) =>
    invokeRepositoryValidated(event, cancelledRepositorySchema, () => {
      const requestId = zRequestId(input);
      const key = requestKey(event.sender.id, requestId);
      const controller = requests.get(key);
      controller?.abort();
      return Promise.resolve({ requestId, cancelled: Boolean(controller) });
    }),
  );
}

async function runCancellable<T>(
  event: IpcMainInvokeEvent,
  requestId: string,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const key = requestKey(event.sender.id, requestId);
  if (requests.has(key)) {
    throw new LibraryError('CONFLICT', 'Request ID is already active.');
  }
  const controller = new AbortController();
  requests.set(key, controller);
  try {
    return await operation(controller.signal);
  } finally {
    requests.delete(key);
  }
}

export async function invokeRepositoryValidated<T>(
  event: IpcMainInvokeEvent,
  outputSchema: ZodType<T>,
  operation: () => Promise<T>,
): Promise<ApiResult<T>> {
  try {
    ensureTrustedSender(event);
    return { ok: true, value: outputSchema.parse(await operation()) };
  } catch (error) {
    const safeError =
      error instanceof RepositoryError
        ? toRepositoryApiError(error)
        : toApiError(
            error instanceof LibraryError || !(error instanceof Error)
              ? error
              : new LibraryError('INVALID_INPUT', 'The Repository request was invalid.', {
                  cause: error,
                }),
          );
    logger.warn('Repository request rejected', { code: safeError.code });
    return { ok: false, error: safeError };
  }
}

function zRequestId(value: unknown): string {
  return repositoryRequestSchema.shape.requestId.parse(value);
}

function requestKey(ownerId: number, requestId: string): string {
  return `${String(ownerId)}:${requestId}`;
}
