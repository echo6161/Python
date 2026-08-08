import {
  dialog,
  ipcMain,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
} from 'electron';
import type { ZodType } from 'zod';

import {
  LIBRARY_IPC_CHANNELS,
  type ApiResult,
  type PaperDetails,
  type PaperImportBatch,
  type PaperListResult,
  type PaperRemovalResult,
} from '../../shared/contracts/library';
import { createConsoleLogger } from '../../shared/logging';
import { LibraryError, toApiError } from '../library/errors';
import type { PaperLibraryService } from '../library/paper-library-service';
import {
  droppedPdfPathsSchema,
  paperDetailsSchema,
  paperIdSchema,
  paperImportBatchSchema,
  paperListQuerySchema,
  paperListResultSchema,
  paperMetadataUpdateSchema,
  paperRemovalResultSchema,
  paperRemovalSchema,
} from './library-schemas';

const logger = createConsoleLogger('library-ipc');

export function registerLibraryIpcHandlers(
  library: PaperLibraryService,
  getMainWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(
    LIBRARY_IPC_CHANNELS.chooseAndImportPdfs,
    async (event): Promise<ApiResult<PaperImportBatch>> => {
      return invokeValidated(event, paperImportBatchSchema, async () => {
        const owner = getMainWindow();
        const options: OpenDialogOptions = {
          title: 'Import PDF papers',
          buttonLabel: 'Import',
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'PDF documents', extensions: ['pdf'] }],
        };
        const selection = owner
          ? await dialog.showOpenDialog(owner, options)
          : await dialog.showOpenDialog(options);
        if (selection.canceled) {
          return { cancelled: true, items: [] };
        }
        return library.importPdfPaths(selection.filePaths);
      });
    },
  );

  ipcMain.handle(
    LIBRARY_IPC_CHANNELS.importDroppedPdfs,
    async (event, input: unknown): Promise<ApiResult<PaperImportBatch>> => {
      return invokeValidated(event, paperImportBatchSchema, async () => {
        const { filePaths } = droppedPdfPathsSchema.parse(input);
        return library.importPdfPaths(filePaths);
      });
    },
  );

  ipcMain.handle(
    LIBRARY_IPC_CHANNELS.listPapers,
    async (event, input: unknown): Promise<ApiResult<PaperListResult>> => {
      return invokeValidated(event, paperListResultSchema, async () => {
        const query = paperListQuerySchema.parse(input);
        return library.listPapers({
          ...(query.search === undefined ? {} : { search: query.search }),
          ...(query.limit === undefined ? {} : { limit: query.limit }),
          ...(query.offset === undefined ? {} : { offset: query.offset }),
        });
      });
    },
  );

  ipcMain.handle(
    LIBRARY_IPC_CHANNELS.getPaper,
    async (event, input: unknown): Promise<ApiResult<PaperDetails>> => {
      return invokeValidated(event, paperDetailsSchema, async () => {
        const id = paperIdSchema.parse(input);
        return library.getPaper(id);
      });
    },
  );

  ipcMain.handle(
    LIBRARY_IPC_CHANNELS.updatePaperMetadata,
    async (event, input: unknown): Promise<ApiResult<PaperDetails>> => {
      return invokeValidated(event, paperDetailsSchema, async () => {
        const metadata = paperMetadataUpdateSchema.parse(input);
        return library.updatePaperMetadata(metadata);
      });
    },
  );

  ipcMain.handle(
    LIBRARY_IPC_CHANNELS.removePaper,
    async (event, input: unknown): Promise<ApiResult<PaperRemovalResult>> => {
      return invokeValidated(event, paperRemovalResultSchema, async () => {
        const removal = paperRemovalSchema.parse(input);
        return library.removePaper(removal);
      });
    },
  );
}

function ensureTrustedSender(event: IpcMainInvokeEvent): void {
  if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame) {
    throw new LibraryError(
      'PERMISSION_DENIED',
      'This operation is only available to the main window.',
    );
  }
}

async function invokeValidated<T>(
  event: IpcMainInvokeEvent,
  outputSchema: ZodType<T>,
  operation: () => Promise<T>,
): Promise<ApiResult<T>> {
  try {
    ensureTrustedSender(event);
    const value = await operation();
    return { ok: true, value: outputSchema.parse(value) };
  } catch (error) {
    const safeError = toApiError(
      error instanceof LibraryError || !(error instanceof Error)
        ? error
        : new LibraryError('INVALID_INPUT', 'The library request was invalid.', { cause: error }),
    );
    logger.warn('Library request rejected', { code: safeError.code });
    return { ok: false, error: safeError };
  }
}
