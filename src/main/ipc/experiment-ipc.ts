import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z, type ZodType } from 'zod';
import { EXPERIMENT_IPC_CHANNELS } from '../../shared/contracts/experiment';
import type { ApiResult } from '../../shared/contracts/library';
import type { ExperimentService } from '../experiment/experiment-service';
import { LibraryError, toApiError } from '../library/errors';
import { ensureTrustedSender } from './library-ipc';
import * as s from './experiment-schemas';
export function registerExperimentIpcHandlers(service: ExperimentService) {
  const invoke = <T>(
    event: IpcMainInvokeEvent,
    out: ZodType<T>,
    op: () => Promise<unknown>,
  ): Promise<ApiResult<T>> => invokeExperiment(event, out, op);
  ipcMain.handle(EXPERIMENT_IPC_CHANNELS.list, (e, i) =>
    invoke(e, z.array(s.experimentSchema), () => service.list(z.uuid().parse(i))),
  );
  ipcMain.handle(EXPERIMENT_IPC_CHANNELS.get, (e, i) =>
    invoke(e, s.experimentSchema, () => {
      const v = s.experimentIdentitySchema.parse(i);
      return service.get(v.workspaceId, v.experimentId);
    }),
  );
  const bind = (channel: string, schema: ZodType, op: (v: never) => Promise<unknown>) =>
    ipcMain.handle(channel, (e, i) =>
      invoke(e, s.experimentSchema, () => op(schema.parse(i) as never)),
    );
  bind(EXPERIMENT_IPC_CHANNELS.create, s.createExperimentSchema, (v) => service.create(v));
  bind(EXPERIMENT_IPC_CHANNELS.update, s.updateExperimentSchema, (v) => service.update(v));
  bind(EXPERIMENT_IPC_CHANNELS.setStatus, s.setExperimentStatusSchema, (v) => service.setStatus(v));
  ipcMain.handle(EXPERIMENT_IPC_CHANNELS.delete, (e, i) =>
    invoke(e, z.object({ id: z.uuid() }).strict(), async () => {
      const v = s.deleteExperimentSchema.parse(i);
      return service.delete(v.workspaceId, v.experimentId);
    }),
  );
  bind(EXPERIMENT_IPC_CHANNELS.addRun, s.addRunSchema, (v) => service.addRun(v));
  bind(EXPERIMENT_IPC_CHANNELS.updateRun, s.updateRunSchema, (v) => service.updateRun(v));
  bind(EXPERIMENT_IPC_CHANNELS.deleteRun, s.deleteRunSchema, (v) => service.deleteRun(v));
  bind(EXPERIMENT_IPC_CHANNELS.recordResult, s.recordResultSchema, (v) => service.recordResult(v));
  bind(EXPERIMENT_IPC_CHANNELS.createConclusion, s.createConclusionSchema, (v) =>
    service.createConclusion(v),
  );
  bind(EXPERIMENT_IPC_CHANNELS.updateConclusion, s.updateConclusionSchema, (v) =>
    service.updateConclusion(v),
  );
  ipcMain.handle(EXPERIMENT_IPC_CHANNELS.generateProposal, (e, i) =>
    invoke(e, s.conclusionProposalSchema, () =>
      service.generateProposal(s.generateProposalSchema.parse(i)),
    ),
  );
  bind(EXPERIMENT_IPC_CHANNELS.confirmProposal, s.confirmProposalSchema, (v) =>
    service.confirmProposal(v),
  );
  ipcMain.handle(EXPERIMENT_IPC_CHANNELS.rejectProposal, (e, i) =>
    invoke(e, s.conclusionProposalSchema, () =>
      service.rejectProposal(s.rejectProposalSchema.parse(i)),
    ),
  );
}
async function invokeExperiment<T>(
  event: IpcMainInvokeEvent,
  out: ZodType<T>,
  op: () => Promise<unknown>,
): Promise<ApiResult<T>> {
  try {
    ensureTrustedSender(event);
    return { ok: true, value: out.parse(await op()) };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof LibraryError
          ? toApiError(error)
          : { code: 'INVALID_INPUT', message: 'The Experiment request was invalid.' },
    };
  }
}
