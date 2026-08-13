import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z, type ZodType } from 'zod';

import { RESEARCH_CHAT_IPC_CHANNELS } from '../../shared/contracts/research-chat';
import type { ApiResult } from '../../shared/contracts/library';
import { createConsoleLogger } from '../../shared/logging';
import type { ResearchChatService } from '../research-chat/research-chat-service';
import { LibraryError, toApiError } from '../library/errors';
import { toZoteroApiError, ZoteroBridgeError } from '../zotero/zotero-errors';
import { ensureTrustedSender } from './library-ipc';
import { openKnowledgeResultOutputSchema } from './knowledge-schemas';
import {
  getResearchChatConversationSchema,
  openResearchChatCitationSchema,
  prepareResearchChatContextSchema,
  researchChatContextPreviewSchema,
  researchChatConversationSchema,
  researchChatRequestIdSchema,
  researchChatTurnAcceptedSchema,
  retryResearchChatTurnSchema,
  startResearchChatTurnSchema,
} from './research-chat-schemas';

const logger = createConsoleLogger('research-chat-ipc');

export function registerResearchChatIpcHandlers(service: ResearchChatService): void {
  ipcMain.handle(RESEARCH_CHAT_IPC_CHANNELS.getLatestConversation, (event, input: unknown) =>
    invokeResearchChatValidated(event, researchChatConversationSchema.nullable(), async () => {
      const parsed = getResearchChatConversationSchema.parse(input);
      return service.getLatestConversation(parsed.workspaceId, parsed.questionId);
    }),
  );
  ipcMain.handle(RESEARCH_CHAT_IPC_CHANNELS.prepareContext, (event, input: unknown) =>
    invokeResearchChatValidated(event, researchChatContextPreviewSchema, () =>
      service.prepareContext(prepareResearchChatContextSchema.parse(input), event.sender.id),
    ),
  );
  ipcMain.handle(RESEARCH_CHAT_IPC_CHANNELS.startTurn, (event, input: unknown) =>
    invokeResearchChatValidated(event, researchChatTurnAcceptedSchema, () => {
      const sender = event.sender;
      return service.startTurn(
        startResearchChatTurnSchema.parse(input),
        sender.id,
        (streamEvent) => {
          if (!sender.isDestroyed())
            sender.send(RESEARCH_CHAT_IPC_CHANNELS.streamEvent, streamEvent);
        },
      );
    }),
  );
  ipcMain.handle(RESEARCH_CHAT_IPC_CHANNELS.retryTurn, (event, input: unknown) =>
    invokeResearchChatValidated(event, researchChatTurnAcceptedSchema, () => {
      const sender = event.sender;
      return service.retryTurn(
        retryResearchChatTurnSchema.parse(input),
        sender.id,
        (streamEvent) => {
          if (!sender.isDestroyed())
            sender.send(RESEARCH_CHAT_IPC_CHANNELS.streamEvent, streamEvent);
        },
      );
    }),
  );
  ipcMain.handle(RESEARCH_CHAT_IPC_CHANNELS.cancelTurn, (event, input: unknown) =>
    invokeResearchChatValidated(event, z.object({ requestId: z.uuid() }).strict(), () => {
      const requestId = researchChatRequestIdSchema.parse(input);
      service.cancelTurn(requestId, event.sender.id);
      return Promise.resolve({ requestId });
    }),
  );
  ipcMain.handle(RESEARCH_CHAT_IPC_CHANNELS.openCitation, (event, input: unknown) =>
    invokeResearchChatValidated(event, openKnowledgeResultOutputSchema, () =>
      service.openCitation(openResearchChatCitationSchema.parse(input)),
    ),
  );
}

export async function invokeResearchChatValidated<T>(
  event: IpcMainInvokeEvent,
  outputSchema: ZodType<T>,
  operation: () => Promise<T>,
): Promise<ApiResult<T>> {
  try {
    ensureTrustedSender(event);
    return { ok: true, value: outputSchema.parse(await operation()) };
  } catch (error) {
    const safe =
      error instanceof ZoteroBridgeError
        ? toZoteroApiError(error)
        : toApiError(
            error instanceof LibraryError || !(error instanceof Error)
              ? error
              : new LibraryError(
                  'INVALID_INPUT',
                  'The Research Chat request could not be completed.',
                  { cause: error },
                ),
          );
    logger.warn('Research Chat request rejected', { code: safe.code });
    return { ok: false, error: safe };
  }
}
