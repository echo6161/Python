import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z, type ZodType } from 'zod';

import { KNOWLEDGE_IPC_CHANNELS } from '../../shared/contracts/knowledge';
import type { ApiResult } from '../../shared/contracts/library';
import { createConsoleLogger } from '../../shared/logging';
import type { KnowledgeEngineService } from '../knowledge/knowledge-engine-service';
import { LibraryError, toApiError } from '../library/errors';
import { ensureTrustedSender } from './library-ipc';
import {
  knowledgeCancelSchema,
  knowledgeIndexStatusSchema,
  knowledgeSearchInputSchema,
  knowledgeSearchPageSchema,
  knowledgeWorkspaceIdSchema,
  openKnowledgeResultOutputSchema,
  openKnowledgeResultSchema,
  removeKnowledgeIndexSchema,
  runKnowledgeIndexSchema,
} from './knowledge-schemas';

const logger = createConsoleLogger('knowledge-ipc');

export function registerKnowledgeIpcHandlers(service: KnowledgeEngineService): void {
  ipcMain.handle(KNOWLEDGE_IPC_CHANNELS.getStatus, (event, input: unknown) =>
    invokeKnowledge(event, knowledgeIndexStatusSchema, () =>
      service.getStatus(knowledgeWorkspaceIdSchema.parse(input)),
    ),
  );
  ipcMain.handle(KNOWLEDGE_IPC_CHANNELS.runIndex, (event, input: unknown) =>
    invokeKnowledge(event, knowledgeIndexStatusSchema, () =>
      service.runIndex(runKnowledgeIndexSchema.parse(input)),
    ),
  );
  ipcMain.handle(KNOWLEDGE_IPC_CHANNELS.cancelIndex, (event, input: unknown) =>
    invokeKnowledge(event, knowledgeCancelSchema, async () => {
      const requestId = runKnowledgeIndexSchema.shape.requestId.parse(input);
      return { requestId, cancelled: await service.cancelIndex(requestId) };
    }),
  );
  ipcMain.handle(KNOWLEDGE_IPC_CHANNELS.removeIndex, (event, input: unknown) =>
    invokeKnowledge(event, zRemoved, async () => {
      const parsed = removeKnowledgeIndexSchema.parse(input);
      return { removed: await service.removeIndex(parsed.workspaceId) };
    }),
  );
  ipcMain.handle(KNOWLEDGE_IPC_CHANNELS.search, (event, input: unknown) =>
    invokeKnowledge(event, knowledgeSearchPageSchema, () => {
      const parsed = knowledgeSearchInputSchema.parse(input);
      return service.search({
        workspaceId: parsed.workspaceId,
        query: parsed.query,
        ...(parsed.sourceTypes ? { sourceTypes: parsed.sourceTypes } : {}),
        ...(parsed.offset === undefined ? {} : { offset: parsed.offset }),
        ...(parsed.limit === undefined ? {} : { limit: parsed.limit }),
      });
    }),
  );
  ipcMain.handle(KNOWLEDGE_IPC_CHANNELS.openResult, (event, input: unknown) =>
    invokeKnowledge(event, openKnowledgeResultOutputSchema, () => {
      const parsed = openKnowledgeResultSchema.parse(input);
      return service.openResult(parsed.workspaceId, parsed.chunkId);
    }),
  );
}

const zRemoved = z.object({ removed: z.boolean() }).strict();

async function invokeKnowledge<T>(
  event: IpcMainInvokeEvent,
  outputSchema: ZodType<T>,
  operation: () => Promise<T>,
): Promise<ApiResult<T>> {
  try {
    ensureTrustedSender(event);
    return { ok: true, value: outputSchema.parse(await operation()) };
  } catch (error) {
    const safe = toApiError(
      error instanceof LibraryError || !(error instanceof Error)
        ? error
        : new LibraryError('INVALID_INPUT', 'The Knowledge request could not be completed.', {
            cause: error,
          }),
    );
    logger.warn('Knowledge request rejected', { code: safe.code });
    return { ok: false, error: safe };
  }
}
