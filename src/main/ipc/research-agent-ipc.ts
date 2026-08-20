import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z, type ZodType } from 'zod';

import { RESEARCH_AGENT_IPC_CHANNELS } from '../../shared/contracts/research-agent';
import type { ApiResult } from '../../shared/contracts/library';
import { createConsoleLogger } from '../../shared/logging';
import { LibraryError, toApiError } from '../library/errors';
import type { ResearchAgentService } from '../research-agent/research-agent-service';
import { ensureTrustedSender } from './library-ipc';
import { openKnowledgeResultOutputSchema } from './knowledge-schemas';
import * as schemas from './research-agent-schemas';

const logger = createConsoleLogger('research-agent-ipc');

export function registerResearchAgentIpcHandlers(service: ResearchAgentService): void {
  ipcMain.handle(RESEARCH_AGENT_IPC_CHANNELS.listRuns, (event, input) =>
    invoke(event, z.array(schemas.researchAgentRunSummarySchema).max(100), () =>
      service.listRuns(z.uuid().parse(input)),
    ),
  );
  ipcMain.handle(RESEARCH_AGENT_IPC_CHANNELS.getRun, (event, input) =>
    invoke(event, schemas.researchAgentRunSchema, () => {
      const value = schemas.researchAgentIdentitySchema.parse(input);
      return service.getRun(value.workspaceId, value.runId);
    }),
  );
  ipcMain.handle(RESEARCH_AGENT_IPC_CHANNELS.startRun, (event, input) =>
    invoke(event, schemas.researchAgentAcceptedSchema, () => {
      const sender = event.sender;
      return service.startRun(
        schemas.startResearchAgentRunSchema.parse(input),
        sender.id,
        (value) => {
          if (!sender.isDestroyed()) sender.send(RESEARCH_AGENT_IPC_CHANNELS.runEvent, value);
        },
      );
    }),
  );
  ipcMain.handle(RESEARCH_AGENT_IPC_CHANNELS.cancelRun, (event, input) =>
    invoke(event, z.object({ requestId: z.uuid() }).strict(), () => {
      const requestId = z.uuid().parse(input);
      service.cancelRun(requestId, event.sender.id);
      return Promise.resolve({ requestId });
    }),
  );
  ipcMain.handle(RESEARCH_AGENT_IPC_CHANNELS.openCitation, (event, input) =>
    invoke(event, openKnowledgeResultOutputSchema, () => {
      const value = schemas.researchAgentCitationIdentitySchema.parse(input);
      return service.openCitation(value.workspaceId, value.runId, value.alias);
    }),
  );
  const review = (status: 'accepted' | 'rejected') => (event: IpcMainInvokeEvent, input: unknown) =>
    invoke(event, schemas.researchAgentProposalSchema, () =>
      service.reviewProposal({ ...schemas.reviewResearchAgentProposalSchema.parse(input), status }),
    );
  ipcMain.handle(RESEARCH_AGENT_IPC_CHANNELS.acceptProposal, review('accepted'));
  ipcMain.handle(RESEARCH_AGENT_IPC_CHANNELS.rejectProposal, review('rejected'));
}

async function invoke<T>(
  event: IpcMainInvokeEvent,
  output: ZodType<T>,
  operation: () => Promise<unknown>,
): Promise<ApiResult<T>> {
  try {
    ensureTrustedSender(event);
    return { ok: true, value: output.parse(await operation()) };
  } catch (error) {
    logger.error('Research Agent IPC request failed', error);
    return {
      ok: false,
      error:
        error instanceof LibraryError
          ? toApiError(error)
          : { code: 'INVALID_INPUT', message: 'The Research Agent request was invalid.' },
    };
  }
}
