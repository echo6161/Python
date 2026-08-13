import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z, type ZodType } from 'zod';

import { RESEARCH_MEMORY_IPC_CHANNELS } from '../../shared/contracts/research-memory';
import type { ApiResult } from '../../shared/contracts/library';
import { createConsoleLogger } from '../../shared/logging';
import { LibraryError, toApiError } from '../library/errors';
import type { ResearchMemoryService } from '../research-memory/research-memory-service';
import { ensureTrustedSender } from './library-ipc';
import {
  addResearchReferenceSchema,
  confirmResearchMemoryExportSchema,
  createResearchContentSchema,
  createResearchMemoryProposalSchema,
  deleteResearchContentSchema,
  listResearchContentInputSchema,
  openKnowledgeResultOutputSchema,
  rejectResearchMemoryProposalSchema,
  researchContentIdentitySchema,
  researchContentItemSchema,
  researchContentSummarySchema,
  researchMemoryEntrySchema,
  researchMemoryExportPreviewSchema,
  researchMemoryExportResultSchema,
  researchMemoryProposalSchema,
  researchReferenceIdentitySchema,
  researchSourceSearchResultSchema,
  reviewResearchMemoryProposalSchema,
  searchResearchSourcesSchema,
  updateResearchContentSchema,
} from './research-memory-schemas';

const logger = createConsoleLogger('research-memory-ipc');

export function registerResearchMemoryIpcHandlers(service: ResearchMemoryService): void {
  ipcMain.handle(RESEARCH_MEMORY_IPC_CHANNELS.list, (event, input) =>
    invoke(event, z.array(researchContentSummarySchema), () => {
      const parsed = listResearchContentInputSchema.parse(input);
      return service.list({
        workspaceId: parsed.workspaceId,
        ...(parsed.query !== undefined ? { query: parsed.query } : {}),
        ...(parsed.types !== undefined ? { types: parsed.types } : {}),
        ...(parsed.statuses !== undefined ? { statuses: parsed.statuses } : {}),
      });
    }),
  );
  ipcMain.handle(RESEARCH_MEMORY_IPC_CHANNELS.get, (event, input) =>
    invoke(event, researchContentItemSchema, () =>
      service.get(researchContentIdentitySchema.parse(input)),
    ),
  );
  ipcMain.handle(RESEARCH_MEMORY_IPC_CHANNELS.create, (event, input) =>
    invoke(event, researchContentItemSchema, () =>
      service.create(createResearchContentSchema.parse(input)),
    ),
  );
  ipcMain.handle(RESEARCH_MEMORY_IPC_CHANNELS.update, (event, input) =>
    invoke(event, researchContentItemSchema, () =>
      service.update(updateResearchContentSchema.parse(input)),
    ),
  );
  ipcMain.handle(RESEARCH_MEMORY_IPC_CHANNELS.delete, (event, input) =>
    invoke(event, z.object({ id: z.uuid() }).strict(), () => {
      const parsed = deleteResearchContentSchema.parse(input);
      return service.delete(parsed);
    }),
  );
  ipcMain.handle(RESEARCH_MEMORY_IPC_CHANNELS.searchSources, (event, input) =>
    invoke(event, z.array(researchSourceSearchResultSchema), () => {
      const parsed = searchResearchSourcesSchema.parse(input);
      return service.searchSources(parsed.workspaceId, parsed.query);
    }),
  );
  ipcMain.handle(RESEARCH_MEMORY_IPC_CHANNELS.addReference, (event, input) =>
    invoke(event, researchContentItemSchema, () =>
      service.addReference(addResearchReferenceSchema.parse(input)),
    ),
  );
  ipcMain.handle(RESEARCH_MEMORY_IPC_CHANNELS.removeReference, (event, input) =>
    invoke(event, researchContentItemSchema, () =>
      service.removeReference(researchReferenceIdentitySchema.parse(input)),
    ),
  );
  ipcMain.handle(RESEARCH_MEMORY_IPC_CHANNELS.openReference, (event, input) =>
    invoke(event, openKnowledgeResultOutputSchema, () =>
      service.openReference(researchReferenceIdentitySchema.parse(input)),
    ),
  );
  ipcMain.handle(RESEARCH_MEMORY_IPC_CHANNELS.createProposal, (event, input) =>
    invoke(event, researchMemoryProposalSchema, () =>
      service.createProposal(createResearchMemoryProposalSchema.parse(input)),
    ),
  );
  ipcMain.handle(RESEARCH_MEMORY_IPC_CHANNELS.listProposals, (event, input) =>
    invoke(event, z.array(researchMemoryProposalSchema), () =>
      service.listProposals(z.uuid().parse(input)),
    ),
  );
  ipcMain.handle(RESEARCH_MEMORY_IPC_CHANNELS.confirmProposal, (event, input) =>
    invoke(event, researchMemoryEntrySchema, () =>
      service.confirmProposal(reviewResearchMemoryProposalSchema.parse(input)),
    ),
  );
  ipcMain.handle(RESEARCH_MEMORY_IPC_CHANNELS.rejectProposal, (event, input) =>
    invoke(event, researchMemoryProposalSchema, () =>
      service.rejectProposal(rejectResearchMemoryProposalSchema.parse(input)),
    ),
  );
  ipcMain.handle(RESEARCH_MEMORY_IPC_CHANNELS.prepareExport, (event, input) =>
    invoke(event, researchMemoryExportPreviewSchema.nullable(), () =>
      service.prepareExport(researchContentIdentitySchema.parse(input), event.sender.id),
    ),
  );
  ipcMain.handle(RESEARCH_MEMORY_IPC_CHANNELS.confirmExport, (event, input) =>
    invoke(event, researchMemoryExportResultSchema, () => {
      const parsed = confirmResearchMemoryExportSchema.parse(input);
      return service.confirmExport(parsed.previewId, event.sender.id);
    }),
  );
}

async function invoke<T>(
  event: IpcMainInvokeEvent,
  schema: ZodType<T>,
  operation: () => Promise<T>,
): Promise<ApiResult<T>> {
  try {
    ensureTrustedSender(event);
    return { ok: true, value: schema.parse(await operation()) };
  } catch (error) {
    const safe = toApiError(
      error instanceof LibraryError || !(error instanceof Error)
        ? error
        : new LibraryError(
            'INVALID_INPUT',
            'The Notes and Memory request could not be completed.',
            { cause: error },
          ),
    );
    logger.warn('Notes and Memory request rejected', { code: safe.code });
    return { ok: false, error: safe };
  }
}
