import { contextBridge, ipcRenderer, webUtils } from 'electron';

import type { AppGetInfoChannel, AppInfo, PaperMindApi } from '../shared/contracts/app';
import type {
  ApiResult,
  LibraryIpcChannels,
  PaperDetails,
  PaperImportBatch,
  PaperListQuery,
  PaperListResult,
  PaperMetadataUpdate,
  PaperRemovalRequest,
  PaperRemovalResult,
} from '../shared/contracts/library';

// Sandboxed preloads cannot load arbitrary local modules at runtime.
const APP_GET_INFO_CHANNEL: AppGetInfoChannel = 'app:get-info';
const LIBRARY_CHANNELS = {
  chooseAndImportPdfs: 'dialog:choose-pdfs',
  importDroppedPdfs: 'papers:import-dropped',
  listPapers: 'papers:list',
  getPaper: 'papers:get',
  updatePaperMetadata: 'papers:update-metadata',
  removePaper: 'papers:remove',
} satisfies LibraryIpcChannels;

const api: PaperMindApi = Object.freeze({
  app: Object.freeze({
    getInfo: () => ipcRenderer.invoke(APP_GET_INFO_CHANNEL) as Promise<AppInfo>,
  }),
  library: Object.freeze({
    chooseAndImportPdfs: () =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.chooseAndImportPdfs) as Promise<
        ApiResult<PaperImportBatch>
      >,
    importDroppedPdfs: (files: readonly File[]) => {
      const filePaths = files.map((file) => webUtils.getPathForFile(file)).filter(Boolean);
      return ipcRenderer.invoke(LIBRARY_CHANNELS.importDroppedPdfs, { filePaths }) as Promise<
        ApiResult<PaperImportBatch>
      >;
    },
    listPapers: (query: PaperListQuery = {}) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.listPapers, query) as Promise<ApiResult<PaperListResult>>,
    getPaper: (id: string) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.getPaper, id) as Promise<ApiResult<PaperDetails>>,
    updatePaperMetadata: (input: PaperMetadataUpdate) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.updatePaperMetadata, input) as Promise<
        ApiResult<PaperDetails>
      >,
    removePaper: (input: PaperRemovalRequest) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.removePaper, input) as Promise<
        ApiResult<PaperRemovalResult>
      >,
  }),
});

contextBridge.exposeInMainWorld('paperMind', api);
