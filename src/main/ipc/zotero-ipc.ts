import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { ZodType } from 'zod';

import type { ApiResult } from '../../shared/contracts/library';
import {
  ZOTERO_IPC_CHANNELS,
  type ZoteroAttachment,
  type ZoteroCancelResult,
  type ZoteroCollection,
  type ZoteroConnectionStatus,
  type ZoteroItemDetails,
  type ZoteroPageRequest,
  type ZoteroItemSummary,
  type ZoteroPdfAvailability,
} from '../../shared/contracts/zotero';
import { createConsoleLogger } from '../../shared/logging';
import { LibraryError, toApiError } from '../library/errors';
import type { ZoteroBridgeService } from '../zotero/zotero-bridge-service';
import { toZoteroApiError, ZoteroBridgeError } from '../zotero/zotero-errors';
import { ensureTrustedSender } from './library-ipc';
import {
  zoteroAttachmentListSchema,
  zoteroAttachmentSchema,
  zoteroCancelResultSchema,
  zoteroCollectionListSchema,
  zoteroCollectionRefSchema,
  zoteroConnectionStatusSchema,
  zoteroItemDetailsSchema,
  zoteroItemPageSchema,
  zoteroItemListSchema,
  zoteroItemRefSchema,
  zoteroPageRequestSchema,
  zoteroPdfAvailabilitySchema,
  zoteroRequestIdSchema,
  zoteroSearchRequestSchema,
} from './zotero-schemas';

const logger = createConsoleLogger('zotero-ipc');

export function registerZoteroIpcHandlers(service: ZoteroBridgeService): void {
  const activeRequests = new Map<string, AbortController>();
  ipcMain.handle(ZOTERO_IPC_CHANNELS.detect, (event) =>
    invokeZoteroValidated<ZoteroConnectionStatus>(event, zoteroConnectionStatusSchema, () =>
      service.detectZotero(),
    ),
  );
  ipcMain.handle(ZOTERO_IPC_CHANNELS.listItems, (event, input: unknown) =>
    invokeCancellableZotero(
      event,
      input,
      zoteroPageRequestSchema,
      zoteroItemPageSchema,
      activeRequests,
      (request, signal) => service.listItems(request, signal),
    ),
  );
  ipcMain.handle(ZOTERO_IPC_CHANNELS.searchItems, (event, input: unknown) =>
    invokeCancellableZotero(
      event,
      input,
      zoteroSearchRequestSchema,
      zoteroItemPageSchema,
      activeRequests,
      (request, signal) => service.searchItems(request, signal),
    ),
  );
  ipcMain.handle(ZOTERO_IPC_CHANNELS.cancelRequest, (event, input: unknown) =>
    invokeZoteroValidated<ZoteroCancelResult>(event, zoteroCancelResultSchema, () => {
      const requestId = zoteroRequestIdSchema.parse(input);
      const controller = activeRequests.get(requestKey(event, requestId));
      controller?.abort();
      return Promise.resolve({ cancelled: controller !== undefined });
    }),
  );
  ipcMain.handle(ZOTERO_IPC_CHANNELS.getItem, (event, input: unknown) =>
    invokeZoteroValidated<ZoteroItemDetails>(event, zoteroItemDetailsSchema, () =>
      service.getItem(zoteroItemRefSchema.parse(input)),
    ),
  );
  ipcMain.handle(ZOTERO_IPC_CHANNELS.listCollections, (event) =>
    invokeZoteroValidated<readonly ZoteroCollection[]>(event, zoteroCollectionListSchema, () =>
      service.listCollections(),
    ),
  );
  ipcMain.handle(ZOTERO_IPC_CHANNELS.listCollectionItems, (event, input: unknown) =>
    invokeZoteroValidated<readonly ZoteroItemSummary[]>(event, zoteroItemListSchema, () =>
      service.listCollectionItems(zoteroCollectionRefSchema.parse(input)),
    ),
  );
  ipcMain.handle(ZOTERO_IPC_CHANNELS.listAttachments, (event, input: unknown) =>
    invokeZoteroValidated<readonly ZoteroAttachment[]>(event, zoteroAttachmentListSchema, () =>
      service.listAttachments(zoteroItemRefSchema.parse(input)),
    ),
  );
  ipcMain.handle(ZOTERO_IPC_CHANNELS.findPrimaryPdf, (event, input: unknown) =>
    invokeZoteroValidated<ZoteroAttachment | null>(event, zoteroAttachmentSchema.nullable(), () =>
      service.findPrimaryPdf(zoteroItemRefSchema.parse(input)),
    ),
  );
  ipcMain.handle(ZOTERO_IPC_CHANNELS.resolvePdfAvailability, (event, input: unknown) =>
    invokeZoteroValidated<ZoteroPdfAvailability>(event, zoteroPdfAvailabilitySchema, () =>
      service.resolvePdfAvailability(zoteroItemRefSchema.parse(input)),
    ),
  );
}

async function invokeCancellableZotero<TInput extends ZoteroPageRequest, TOutput>(
  event: IpcMainInvokeEvent,
  input: unknown,
  inputSchema: ZodType<TInput>,
  outputSchema: ZodType<TOutput>,
  activeRequests: Map<string, AbortController>,
  operation: (input: TInput, signal: AbortSignal) => Promise<TOutput>,
): Promise<ApiResult<TOutput>> {
  return invokeZoteroValidated(event, outputSchema, async () => {
    const parsed = inputSchema.parse(input);
    const key = requestKey(event, parsed.requestId);
    if (activeRequests.has(key)) {
      throw new LibraryError('INVALID_INPUT', 'The Zotero request ID is already active.');
    }
    const controller = new AbortController();
    activeRequests.set(key, controller);
    try {
      return await operation(parsed, controller.signal);
    } finally {
      if (activeRequests.get(key) === controller) {
        activeRequests.delete(key);
      }
    }
  });
}

function requestKey(event: IpcMainInvokeEvent, requestId: string): string {
  return `${String(event.sender.id)}:${requestId}`;
}

export async function invokeZoteroValidated<T>(
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
        : error instanceof LibraryError
          ? toApiError(error)
          : toApiError(
              new LibraryError('INVALID_INPUT', 'The Zotero request was invalid.', {
                cause: error,
              }),
            );
    logger.warn('Zotero request rejected', { code: safeError.code });
    return { ok: false, error: safeError };
  }
}
