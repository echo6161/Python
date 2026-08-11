import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { ZodType } from 'zod';

import type { ApiResult } from '../../shared/contracts/library';
import {
  WORKSPACE_IPC_CHANNELS,
  type Workspace,
  type WorkspaceZoteroPaper,
} from '../../shared/contracts/workspace';
import { createConsoleLogger } from '../../shared/logging';
import { LibraryError, toApiError } from '../library/errors';
import type { WorkspaceService } from '../workspace/workspace-service';
import { ensureTrustedSender } from './library-ipc';
import {
  createWorkspaceSchema,
  deletedWorkspaceSchema,
  deleteWorkspaceSchema,
  removedWorkspacePaperSchema,
  setLastActiveWorkspaceSchema,
  setWorkspaceStatusSchema,
  updateWorkspaceSchema,
  workspaceIdSchema,
  workspaceListSchema,
  workspaceSchema,
  workspaceZoteroPaperInputSchema,
  workspaceZoteroPaperListSchema,
  workspaceZoteroPaperSchema,
} from './workspace-schemas';

const logger = createConsoleLogger('workspace-ipc');

export function registerWorkspaceIpcHandlers(service: WorkspaceService): void {
  ipcMain.handle(WORKSPACE_IPC_CHANNELS.create, (event, input: unknown) =>
    invokeWorkspaceValidated(event, workspaceSchema, () =>
      service.create(createWorkspaceSchema.parse(input)),
    ),
  );
  ipcMain.handle(WORKSPACE_IPC_CHANNELS.get, (event, input: unknown) =>
    invokeWorkspaceValidated(event, workspaceSchema, () =>
      service.get(workspaceIdSchema.parse(input)),
    ),
  );
  ipcMain.handle(WORKSPACE_IPC_CHANNELS.list, (event) =>
    invokeWorkspaceValidated<readonly Workspace[]>(event, workspaceListSchema, () =>
      service.list(),
    ),
  );
  ipcMain.handle(WORKSPACE_IPC_CHANNELS.update, (event, input: unknown) =>
    invokeWorkspaceValidated(event, workspaceSchema, () =>
      service.update(updateWorkspaceSchema.parse(input)),
    ),
  );
  ipcMain.handle(WORKSPACE_IPC_CHANNELS.setStatus, (event, input: unknown) =>
    invokeWorkspaceValidated(event, workspaceSchema, () =>
      service.setStatus(setWorkspaceStatusSchema.parse(input)),
    ),
  );
  ipcMain.handle(WORKSPACE_IPC_CHANNELS.delete, (event, input: unknown) =>
    invokeWorkspaceValidated(event, deletedWorkspaceSchema, () =>
      service.delete(deleteWorkspaceSchema.parse(input)),
    ),
  );
  ipcMain.handle(WORKSPACE_IPC_CHANNELS.getLastActive, (event) =>
    invokeWorkspaceValidated(event, workspaceSchema.nullable(), () => service.getLastActive()),
  );
  ipcMain.handle(WORKSPACE_IPC_CHANNELS.setLastActive, (event, input: unknown) =>
    invokeWorkspaceValidated(event, workspaceSchema.nullable(), () =>
      service.setLastActive(setLastActiveWorkspaceSchema.parse(input)),
    ),
  );
  ipcMain.handle(WORKSPACE_IPC_CHANNELS.addPaper, (event, input: unknown) =>
    invokeWorkspaceValidated<WorkspaceZoteroPaper>(event, workspaceZoteroPaperSchema, () =>
      service.addPaper(workspaceZoteroPaperInputSchema.parse(input)),
    ),
  );
  ipcMain.handle(WORKSPACE_IPC_CHANNELS.removePaper, (event, input: unknown) =>
    invokeWorkspaceValidated(event, removedWorkspacePaperSchema, () =>
      service.removePaper(workspaceZoteroPaperInputSchema.parse(input)),
    ),
  );
  ipcMain.handle(WORKSPACE_IPC_CHANNELS.listPapers, (event, input: unknown) =>
    invokeWorkspaceValidated<readonly WorkspaceZoteroPaper[]>(
      event,
      workspaceZoteroPaperListSchema,
      () => service.listPapers(workspaceIdSchema.parse(input)),
    ),
  );
}

export async function invokeWorkspaceValidated<T>(
  event: IpcMainInvokeEvent,
  outputSchema: ZodType<T>,
  operation: () => Promise<T>,
): Promise<ApiResult<T>> {
  try {
    ensureTrustedSender(event);
    return { ok: true, value: outputSchema.parse(await operation()) };
  } catch (error) {
    const safeError = toApiError(
      error instanceof LibraryError || !(error instanceof Error)
        ? error
        : new LibraryError('INVALID_INPUT', 'The Workspace request was invalid.', {
            cause: error,
          }),
    );
    logger.warn('Workspace request rejected', { code: safeError.code });
    return { ok: false, error: safeError };
  }
}
