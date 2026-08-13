import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z, type ZodType } from 'zod';

import { RESEARCH_PLAN_IPC_CHANNELS } from '../../shared/contracts/research-plan';
import type { ApiResult } from '../../shared/contracts/library';
import { createConsoleLogger } from '../../shared/logging';
import { LibraryError, toApiError } from '../library/errors';
import type { ResearchPlanService } from '../research-plan/research-plan-service';
import { ensureTrustedSender } from './library-ipc';
import * as schemas from './research-plan-schemas';

const logger = createConsoleLogger('research-plan-ipc');

export function registerResearchPlanIpcHandlers(service: ResearchPlanService): void {
  const plan = (
    channel: string,
    inputSchema: ZodType,
    operation: (value: never) => Promise<unknown>,
  ) =>
    ipcMain.handle(channel, (event, input) =>
      invoke(event, schemas.researchPlanSchema, () => operation(inputSchema.parse(input) as never)),
    );
  ipcMain.handle(RESEARCH_PLAN_IPC_CHANNELS.getActive, (event, input) =>
    invoke(event, schemas.researchPlanSchema.nullable(), () =>
      service.getActive(z.uuid().parse(input)),
    ),
  );
  plan(RESEARCH_PLAN_IPC_CHANNELS.create, schemas.createResearchPlanSchema, (input) =>
    service.create(input),
  );
  plan(RESEARCH_PLAN_IPC_CHANNELS.update, schemas.updateResearchPlanSchema, (input) =>
    service.update(input),
  );
  plan(RESEARCH_PLAN_IPC_CHANNELS.retire, schemas.retireResearchPlanSchema, (input) =>
    service.retire(input),
  );
  ipcMain.handle(RESEARCH_PLAN_IPC_CHANNELS.delete, (event, input) =>
    invoke(event, z.object({ id: z.uuid() }).strict(), () => {
      const value = schemas.deleteResearchPlanSchema.parse(input);
      return service.delete(value.workspaceId, value.planId);
    }),
  );
  plan(RESEARCH_PLAN_IPC_CHANNELS.createTask, schemas.createPlanTaskSchema, (input) =>
    service.createTask(input),
  );
  plan(RESEARCH_PLAN_IPC_CHANNELS.updateTask, schemas.updatePlanTaskSchema, (input) =>
    service.updateTask(input),
  );
  plan(RESEARCH_PLAN_IPC_CHANNELS.deleteTask, schemas.deletePlanTaskSchema, (input) =>
    service.deleteTask(input),
  );
  plan(RESEARCH_PLAN_IPC_CHANNELS.reorderTasks, schemas.reorderPlanTasksSchema, (input) =>
    service.reorderTasks(input),
  );
  ipcMain.handle(RESEARCH_PLAN_IPC_CHANNELS.setTaskStatus, (event, input) =>
    invoke(event, schemas.researchPlanSchema, () => {
      const value = schemas.setPlanTaskStatusSchema.parse(input);
      return service.setTaskStatus({ ...value, blockedReason: value.blockedReason ?? null });
    }),
  );
  plan(RESEARCH_PLAN_IPC_CHANNELS.completeTask, schemas.completePlanTaskSchema, (input) =>
    service.completeTask(input),
  );
  plan(RESEARCH_PLAN_IPC_CHANNELS.setDependencies, schemas.setPlanDependenciesSchema, (input) =>
    service.setDependencies(input),
  );
  ipcMain.handle(RESEARCH_PLAN_IPC_CHANNELS.listReferenceCandidates, (event, input) =>
    invoke(event, schemas.referenceCandidateListSchema, () =>
      service.listReferenceCandidates(z.uuid().parse(input)),
    ),
  );
  plan(RESEARCH_PLAN_IPC_CHANNELS.addReference, schemas.addPlanReferenceSchema, (input) =>
    service.addReference(input),
  );
  plan(RESEARCH_PLAN_IPC_CHANNELS.removeReference, schemas.removePlanReferenceSchema, (input) =>
    service.removeReference(input),
  );
  ipcMain.handle(RESEARCH_PLAN_IPC_CHANNELS.listHistory, (event, input) =>
    invoke(event, z.array(schemas.researchPlanHistorySchema), () => {
      const value = schemas.planIdentitySchema.parse(input);
      return service.listHistory(value.workspaceId, value.planId);
    }),
  );
  ipcMain.handle(RESEARCH_PLAN_IPC_CHANNELS.generateProposal, (event, input) =>
    invoke(event, schemas.researchPlanProposalSchema, () =>
      service.generateProposal(schemas.generateResearchPlanProposalSchema.parse(input)),
    ),
  );
  ipcMain.handle(RESEARCH_PLAN_IPC_CHANNELS.updateProposal, (event, input) =>
    invoke(event, schemas.researchPlanProposalSchema, () =>
      service.updateProposal(schemas.updateResearchPlanProposalSchema.parse(input)),
    ),
  );
  plan(
    RESEARCH_PLAN_IPC_CHANNELS.confirmProposal,
    schemas.reviewResearchPlanProposalSchema,
    (input) => service.confirmProposal(input),
  );
  ipcMain.handle(RESEARCH_PLAN_IPC_CHANNELS.rejectProposal, (event, input) =>
    invoke(event, schemas.researchPlanProposalSchema, () =>
      service.rejectProposal(schemas.reviewResearchPlanProposalSchema.parse(input)),
    ),
  );
}

async function invoke<T>(
  event: IpcMainInvokeEvent,
  schema: ZodType<T>,
  operation: () => Promise<unknown>,
): Promise<ApiResult<T>> {
  try {
    ensureTrustedSender(event);
    return { ok: true, value: schema.parse(await operation()) };
  } catch (error) {
    const safe = toApiError(
      error instanceof LibraryError || !(error instanceof Error)
        ? error
        : new LibraryError('INVALID_INPUT', 'The Research Plan request could not be completed.', {
            cause: error,
          }),
    );
    logger.warn('Research Plan request rejected', { code: safe.code });
    return { ok: false, error: safe };
  }
}
