import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { ZodType } from 'zod';

import type { ApiResult } from '../../shared/contracts/library';
import {
  PAPER_CODE_LINK_IPC_CHANNELS,
  type PaperCodeLink,
} from '../../shared/contracts/paper-code-link';
import { createConsoleLogger } from '../../shared/logging';
import { LibraryError, toApiError } from '../library/errors';
import type { PaperCodeLinkService } from '../paper-code-link/paper-code-link-service';
import { RepositoryError, toRepositoryApiError } from '../repository/repository-errors';
import { ZoteroBridgeError, toZoteroApiError } from '../zotero/zotero-errors';
import { ensureTrustedSender } from './library-ipc';
import {
  createPaperCodeLinkSchema,
  deletedPaperCodeLinkSchema,
  deletePaperCodeLinkSchema,
  listPaperCodeLinksForCodeSchema,
  listPaperCodeLinksForPaperSchema,
  listPaperCodeLinksSchema,
  paperCodeLinkIdentitySchema,
  paperCodeLinkListSchema,
  paperCodeLinkNavigationResultSchema,
  paperCodeLinkSchema,
  updatePaperCodeLinkSchema,
} from './paper-code-link-schemas';

const logger = createConsoleLogger('paper-code-link-ipc');

export function registerPaperCodeLinkIpcHandlers(service: PaperCodeLinkService): void {
  ipcMain.handle(PAPER_CODE_LINK_IPC_CHANNELS.create, (event, input: unknown) =>
    invokePaperCodeLinkValidated(event, paperCodeLinkSchema, () => {
      const parsed = createPaperCodeLinkSchema.parse(input);
      const { pageNumber, textAnchor, ...required } = parsed;
      return service.create({
        ...required,
        ...(pageNumber === undefined ? {} : { pageNumber }),
        ...(textAnchor === undefined ? {} : { textAnchor }),
      });
    }),
  );
  ipcMain.handle(PAPER_CODE_LINK_IPC_CHANNELS.get, (event, input: unknown) =>
    invokePaperCodeLinkValidated(event, paperCodeLinkSchema, () => {
      const parsed = paperCodeLinkIdentitySchema.parse(input);
      return service.get(parsed.workspaceId, parsed.id);
    }),
  );
  ipcMain.handle(PAPER_CODE_LINK_IPC_CHANNELS.listForWorkspace, (event, input: unknown) =>
    invokePaperCodeLinkValidated<readonly PaperCodeLink[]>(event, paperCodeLinkListSchema, () =>
      service.listForWorkspace(listPaperCodeLinksSchema.parse(input)),
    ),
  );
  ipcMain.handle(PAPER_CODE_LINK_IPC_CHANNELS.listForPaper, (event, input: unknown) =>
    invokePaperCodeLinkValidated<readonly PaperCodeLink[]>(event, paperCodeLinkListSchema, () =>
      service.listForPaper(listPaperCodeLinksForPaperSchema.parse(input)),
    ),
  );
  ipcMain.handle(PAPER_CODE_LINK_IPC_CHANNELS.listForCode, (event, input: unknown) =>
    invokePaperCodeLinkValidated<readonly PaperCodeLink[]>(event, paperCodeLinkListSchema, () => {
      const parsed = listPaperCodeLinksForCodeSchema.parse(input);
      return service.listForCode({
        workspaceId: parsed.workspaceId,
        repositoryId: parsed.repositoryId,
        ...(parsed.relativePath === undefined ? {} : { relativePath: parsed.relativePath }),
      });
    }),
  );
  ipcMain.handle(PAPER_CODE_LINK_IPC_CHANNELS.update, (event, input: unknown) =>
    invokePaperCodeLinkValidated(event, paperCodeLinkSchema, () =>
      service.update(updatePaperCodeLinkSchema.parse(input)),
    ),
  );
  ipcMain.handle(PAPER_CODE_LINK_IPC_CHANNELS.delete, (event, input: unknown) =>
    invokePaperCodeLinkValidated(event, deletedPaperCodeLinkSchema, () => {
      const parsed = deletePaperCodeLinkSchema.parse(input);
      return service.delete(parsed.workspaceId, parsed.id);
    }),
  );
  ipcMain.handle(PAPER_CODE_LINK_IPC_CHANNELS.openPaper, (event, input: unknown) =>
    invokePaperCodeLinkValidated(event, paperCodeLinkNavigationResultSchema, () => {
      const parsed = paperCodeLinkIdentitySchema.parse(input);
      return service.openPaper(parsed.workspaceId, parsed.id);
    }),
  );
  ipcMain.handle(PAPER_CODE_LINK_IPC_CHANNELS.openCode, (event, input: unknown) =>
    invokePaperCodeLinkValidated(event, paperCodeLinkNavigationResultSchema, () => {
      const parsed = paperCodeLinkIdentitySchema.parse(input);
      return service.openCode(parsed.workspaceId, parsed.id);
    }),
  );
}

export async function invokePaperCodeLinkValidated<T>(
  event: IpcMainInvokeEvent,
  outputSchema: ZodType<T>,
  operation: () => Promise<T>,
): Promise<ApiResult<T>> {
  try {
    ensureTrustedSender(event);
    return { ok: true, value: outputSchema.parse(await operation()) };
  } catch (error) {
    const safeError =
      error instanceof ZoteroBridgeError
        ? toZoteroApiError(error)
        : error instanceof RepositoryError
          ? toRepositoryApiError(error)
          : toApiError(
              error instanceof LibraryError || !(error instanceof Error)
                ? error
                : new LibraryError('INVALID_INPUT', 'The Paper-Code Link request was invalid.', {
                    cause: error,
                  }),
            );
    logger.warn('Paper-Code Link request rejected', { code: safeError.code });
    return { ok: false, error: safeError };
  }
}
