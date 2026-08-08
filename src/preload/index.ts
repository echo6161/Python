import { contextBridge, ipcRenderer, webUtils } from 'electron';

import type { AppGetInfoChannel, AppInfo, PaperMindApi } from '../shared/contracts/app';
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
});

contextBridge.exposeInMainWorld('paperMind', api);
