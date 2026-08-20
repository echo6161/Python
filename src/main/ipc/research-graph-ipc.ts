import { ipcMain } from 'electron';
import { z } from 'zod';
import { RESEARCH_GRAPH_IPC_CHANNELS } from '../../shared/contracts/research-graph';
import type { ResearchGraphService } from '../research-graph/research-graph-service';
import { ensureTrustedSender } from './library-ipc';
import { LibraryError, toApiError } from '../library/errors';
const kind = z.enum([
  'workspace',
  'question',
  'paper',
  'repository',
  'memory',
  'plan_task',
  'experiment',
  'hypothesis',
  'run',
  'result',
  'conclusion',
  'link',
]);
const node = z
  .object({
    id: z.string().min(1).max(1000),
    kind,
    label: z.string().max(300),
    subtitle: z.string().max(300),
    status: z.enum(['available', 'stale', 'unavailable']),
    relatedId: z.string().max(1000).nullable(),
    detail: z.string().max(2000),
  })
  .strict();
const projection = z
  .object({
    workspaceId: z.uuid(),
    version: z.literal('research-graph-v1'),
    nodes: z.array(node).max(2000),
    edges: z
      .array(
        z
          .object({
            id: z.string().max(2500),
            source: z.string().max(1000),
            target: z.string().max(1000),
            relation: z.string().max(120),
          })
          .strict(),
      )
      .max(5000),
  })
  .strict();
export function registerResearchGraphIpcHandlers(service: ResearchGraphService) {
  ipcMain.handle(RESEARCH_GRAPH_IPC_CHANNELS.getProjection, async (event, input) => {
    try {
      ensureTrustedSender(event);
      return {
        ok: true,
        value: projection.parse(await service.getProjection(z.uuid().parse(input))),
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof LibraryError
            ? toApiError(error)
            : { code: 'INVALID_INPUT', message: 'The Research Graph request was invalid.' },
      };
    }
  });
}
