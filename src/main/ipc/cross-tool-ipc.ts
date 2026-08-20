import { ipcMain } from 'electron';
import { z } from 'zod';
import { CROSS_TOOL_IPC_CHANNELS } from '../../shared/contracts/cross-tool';
import type { CrossToolLinkService } from '../cross-tool/cross-tool-link-service';
import { ensureTrustedSender } from './library-ipc';
import { LibraryError, toApiError } from '../library/errors';
const input = z
    .object({
      workspaceId: z.uuid(),
      nodeId: z.string().min(1).max(1000),
      action: z.enum(['primary', 'github']),
    })
    .strict(),
  output = z
    .object({
      opened: z.boolean(),
      target: z.enum(['zotero', 'vscode', 'github', 'obsidian']),
      reason: z.string().max(500).nullable(),
      fallback: z.string().max(500).nullable(),
    })
    .strict();
export function registerCrossToolIpcHandlers(service: CrossToolLinkService) {
  ipcMain.handle(CROSS_TOOL_IPC_CHANNELS.open, async (event, value) => {
    try {
      ensureTrustedSender(event);
      return { ok: true, value: output.parse(await service.open(input.parse(value))) };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof LibraryError
            ? toApiError(error)
            : { code: 'INVALID_INPUT', message: 'The outbound action was invalid.' },
      };
    }
  });
}
