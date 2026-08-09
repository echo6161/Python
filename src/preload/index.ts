import { contextBridge, ipcRenderer, webUtils } from 'electron';

import type { AppGetInfoChannel, AppInfo, PaperMindApi } from '../shared/contracts/app';
import type {
  AiCapabilities,
  AiConversation,
  AiCredentialState,
  AiIpcChannels,
  AiStreamEvent,
  AiTaskAccepted,
  AiTaskInput,
  AiProviderSettings,
} from '../shared/contracts/ai';
import type {
  ApiResult,
  BatchPaperUpdate,
  BatchPaperUpdateResult,
  Collection,
  CreateCollectionInput,
  CreateTagInput,
  DeleteOrganizationItemInput,
  LibraryIpcChannels,
  LibraryOrganization,
  PaperDetails,
  PaperDetailsUpdate,
  PaperImportBatch,
  PaperListQuery,
  PaperListResult,
  PaperMetadataUpdate,
  PaperOrganizationUpdate,
  PaperRemovalRequest,
  PaperRemovalResult,
  Tag,
} from '../shared/contracts/library';
import type {
  Annotation,
  AnnotationExportRequest,
  AnnotationExportResult,
  CreateAnnotationInput,
  DeleteAnnotationInput,
  PdfAccess,
  ReaderIpcChannels,
  ReadingState,
  SaveReadingStateInput,
  UpdateAnnotationInput,
} from '../shared/contracts/reader';

// Sandboxed preloads cannot load arbitrary local modules at runtime.
const APP_GET_INFO_CHANNEL: AppGetInfoChannel = 'app:get-info';
const LIBRARY_CHANNELS = {
  chooseAndImportPdfs: 'dialog:choose-pdfs',
  importDroppedPdfs: 'papers:import-dropped',
  listPapers: 'papers:list',
  getPaper: 'papers:get',
  updatePaperDetails: 'papers:update-details',
  updatePaperMetadata: 'papers:update-metadata',
  updatePaperOrganization: 'papers:update-organization',
  batchUpdatePapers: 'papers:batch-update',
  listOrganization: 'library:list-organization',
  createTag: 'tags:create',
  deleteTag: 'tags:delete',
  createCollection: 'collections:create',
  deleteCollection: 'collections:delete',
  removePaper: 'papers:remove',
} satisfies LibraryIpcChannels;
const READER_CHANNELS = {
  getPdfAccess: 'papers:get-pdf-access',
  getReadingState: 'reader:get-state',
  saveReadingState: 'reader:save-state',
  listAnnotations: 'annotations:list',
  createAnnotation: 'annotations:create',
  updateAnnotation: 'annotations:update',
  deleteAnnotation: 'annotations:delete',
  exportAnnotations: 'annotations:export',
} satisfies ReaderIpcChannels;
const AI_CHANNELS = {
  getCapabilities: 'ai:get-capabilities',
  updateSettings: 'settings:update-ai',
  setApiKey: 'secrets:set-provider-key',
  deleteApiKey: 'secrets:delete-provider-key',
  getConversation: 'ai:get-conversation',
  startTask: 'ai:start-task',
  cancelTask: 'ai:cancel-task',
  streamEvent: 'events:ai-stream',
} satisfies AiIpcChannels;

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
    updatePaperDetails: (input: PaperDetailsUpdate) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.updatePaperDetails, input) as Promise<
        ApiResult<PaperDetails>
      >,
    updatePaperMetadata: (input: PaperMetadataUpdate) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.updatePaperMetadata, input) as Promise<
        ApiResult<PaperDetails>
      >,
    updatePaperOrganization: (input: PaperOrganizationUpdate) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.updatePaperOrganization, input) as Promise<
        ApiResult<PaperDetails>
      >,
    batchUpdatePapers: (input: BatchPaperUpdate) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.batchUpdatePapers, input) as Promise<
        ApiResult<BatchPaperUpdateResult>
      >,
    listOrganization: () =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.listOrganization) as Promise<
        ApiResult<LibraryOrganization>
      >,
    createTag: (input: CreateTagInput) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.createTag, input) as Promise<ApiResult<Tag>>,
    deleteTag: (input: DeleteOrganizationItemInput) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.deleteTag, input) as Promise<
        ApiResult<{ readonly id: string }>
      >,
    createCollection: (input: CreateCollectionInput) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.createCollection, input) as Promise<
        ApiResult<Collection>
      >,
    deleteCollection: (input: DeleteOrganizationItemInput) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.deleteCollection, input) as Promise<
        ApiResult<{ readonly id: string }>
      >,
    removePaper: (input: PaperRemovalRequest) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.removePaper, input) as Promise<
        ApiResult<PaperRemovalResult>
      >,
  }),
  reader: Object.freeze({
    getPdfAccess: (paperId: string) =>
      ipcRenderer.invoke(READER_CHANNELS.getPdfAccess, paperId) as Promise<ApiResult<PdfAccess>>,
    getReadingState: (paperId: string) =>
      ipcRenderer.invoke(READER_CHANNELS.getReadingState, paperId) as Promise<
        ApiResult<ReadingState | null>
      >,
    saveReadingState: (input: SaveReadingStateInput) =>
      ipcRenderer.invoke(READER_CHANNELS.saveReadingState, input) as Promise<
        ApiResult<ReadingState>
      >,
    listAnnotations: (paperId: string) =>
      ipcRenderer.invoke(READER_CHANNELS.listAnnotations, paperId) as Promise<
        ApiResult<readonly Annotation[]>
      >,
    createAnnotation: (input: CreateAnnotationInput) =>
      ipcRenderer.invoke(READER_CHANNELS.createAnnotation, input) as Promise<ApiResult<Annotation>>,
    updateAnnotation: (input: UpdateAnnotationInput) =>
      ipcRenderer.invoke(READER_CHANNELS.updateAnnotation, input) as Promise<ApiResult<Annotation>>,
    deleteAnnotation: (input: DeleteAnnotationInput) =>
      ipcRenderer.invoke(READER_CHANNELS.deleteAnnotation, input) as Promise<
        ApiResult<{ readonly id: string }>
      >,
    exportAnnotations: (input: AnnotationExportRequest) =>
      ipcRenderer.invoke(READER_CHANNELS.exportAnnotations, input) as Promise<
        ApiResult<AnnotationExportResult>
      >,
  }),
  ai: Object.freeze({
    getCapabilities: () =>
      ipcRenderer.invoke(AI_CHANNELS.getCapabilities) as Promise<ApiResult<AiCapabilities>>,
    updateSettings: (settings: AiProviderSettings) =>
      ipcRenderer.invoke(AI_CHANNELS.updateSettings, settings) as Promise<
        ApiResult<AiCapabilities>
      >,
    setApiKey: (apiKey: string) =>
      ipcRenderer.invoke(AI_CHANNELS.setApiKey, apiKey) as Promise<ApiResult<AiCredentialState>>,
    deleteApiKey: () =>
      ipcRenderer.invoke(AI_CHANNELS.deleteApiKey) as Promise<ApiResult<AiCredentialState>>,
    getConversation: (paperId: string) =>
      ipcRenderer.invoke(AI_CHANNELS.getConversation, paperId) as Promise<
        ApiResult<AiConversation | null>
      >,
    startTask: (input: AiTaskInput) =>
      ipcRenderer.invoke(AI_CHANNELS.startTask, input) as Promise<ApiResult<AiTaskAccepted>>,
    cancelTask: (requestId: string) =>
      ipcRenderer.invoke(AI_CHANNELS.cancelTask, requestId) as Promise<
        ApiResult<{ readonly requestId: string }>
      >,
    onStreamEvent: (listener: (event: AiStreamEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, streamEvent: AiStreamEvent) =>
        listener(streamEvent);
      ipcRenderer.on(AI_CHANNELS.streamEvent, handler);
      return () => ipcRenderer.removeListener(AI_CHANNELS.streamEvent, handler);
    },
  }),
});

contextBridge.exposeInMainWorld('paperMind', api);
