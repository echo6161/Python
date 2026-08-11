import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { ZodType } from 'zod';

import {
  CODE_INTELLIGENCE_IPC_CHANNELS,
  type CodeFileSearchResult,
  type CodeIndexStatus,
  type CodeSearchPage,
  type CodeSymbolSearchResult,
  type CodeTextSearchResult,
} from '../../shared/contracts/code-intelligence';
import type { ApiResult } from '../../shared/contracts/library';
import { createConsoleLogger } from '../../shared/logging';
import type { CodeIntelligenceService } from '../code-intelligence/code-intelligence-service';
import { LibraryError, toApiError } from '../library/errors';
import { RepositoryError, toRepositoryApiError } from '../repository/repository-errors';
import { ensureTrustedSender } from './library-ipc';
import {
  codeFileSearchPageSchema,
  codeIndexCancelSchema,
  codeIndexProgressSchema,
  codeIndexStatusSchema,
  codeRepositoryIdSchema,
  codeSearchInputSchema,
  codeSymbolSearchPageSchema,
  codeTextSearchPageSchema,
  runCodeIndexSchema,
} from './code-intelligence-schemas';

const logger = createConsoleLogger('code-intelligence-ipc');
const requests = new Map<string, AbortController>();

export function registerCodeIntelligenceIpcHandlers(service: CodeIntelligenceService): void {
  ipcMain.handle(CODE_INTELLIGENCE_IPC_CHANNELS.getStatus, (event, input: unknown) =>
    invokeCodeValidated(event, codeIndexStatusSchema, () =>
      service.getStatus(codeRepositoryIdSchema.parse(input)),
    ),
  );
  ipcMain.handle(CODE_INTELLIGENCE_IPC_CHANNELS.runIndex, (event, input: unknown) =>
    invokeCodeValidated<CodeIndexStatus>(event, codeIndexStatusSchema, async () => {
      const request = runCodeIndexSchema.parse(input);
      const key = requestKey(event.sender.id, request.requestId);
      if (requests.has(key)) throw new LibraryError('CONFLICT', 'Request ID is already active.');
      const controller = new AbortController();
      requests.set(key, controller);
      try {
        return await service.runIndex(request, controller.signal, (progress) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(
              CODE_INTELLIGENCE_IPC_CHANNELS.progress,
              codeIndexProgressSchema.parse(progress),
            );
          }
        });
      } finally {
        requests.delete(key);
      }
    }),
  );
  ipcMain.handle(CODE_INTELLIGENCE_IPC_CHANNELS.cancelIndex, (event, input: unknown) =>
    invokeCodeValidated(event, codeIndexCancelSchema, () => {
      const requestId = runCodeIndexSchema.shape.requestId.parse(input);
      const controller = requests.get(requestKey(event.sender.id, requestId));
      controller?.abort();
      return Promise.resolve({ requestId, cancelled: Boolean(controller) });
    }),
  );
  ipcMain.handle(CODE_INTELLIGENCE_IPC_CHANNELS.searchFiles, (event, input: unknown) =>
    invokeCodeValidated<CodeSearchPage<CodeFileSearchResult>>(event, codeFileSearchPageSchema, () =>
      service.searchFiles(codeSearchInputSchema.parse(input)),
    ),
  );
  ipcMain.handle(CODE_INTELLIGENCE_IPC_CHANNELS.searchSymbols, (event, input: unknown) =>
    invokeCodeValidated<CodeSearchPage<CodeSymbolSearchResult>>(
      event,
      codeSymbolSearchPageSchema,
      () => service.searchSymbols(codeSearchInputSchema.parse(input)),
    ),
  );
  ipcMain.handle(CODE_INTELLIGENCE_IPC_CHANNELS.searchText, (event, input: unknown) =>
    invokeCodeValidated<CodeSearchPage<CodeTextSearchResult>>(event, codeTextSearchPageSchema, () =>
      service.searchText(codeSearchInputSchema.parse(input)),
    ),
  );
}

async function invokeCodeValidated<T>(
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
              : new LibraryError('INVALID_INPUT', 'The Code Intelligence request was invalid.', {
                  cause: error,
                }),
          );
    logger.warn('Code Intelligence request rejected', { code: safeError.code });
    return { ok: false, error: safeError };
  }
}

function requestKey(ownerId: number, requestId: string): string {
  return `${String(ownerId)}:${requestId}`;
}
