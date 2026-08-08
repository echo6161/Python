export const LIBRARY_IPC_CHANNELS = Object.freeze({
  chooseAndImportPdfs: 'dialog:choose-pdfs',
  importDroppedPdfs: 'papers:import-dropped',
  listPapers: 'papers:list',
  getPaper: 'papers:get',
  updatePaperMetadata: 'papers:update-metadata',
  removePaper: 'papers:remove',
});

export type LibraryIpcChannels = typeof LIBRARY_IPC_CHANNELS;

export type PaperStatus = 'importing' | 'ready' | 'failed' | 'trashed';

export interface PaperFileInfo {
  readonly id: string;
  readonly originalFilename: string;
  readonly internalFilename: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly mimeType: 'application/pdf';
  readonly importedAt: string;
}

export interface PaperSummary {
  readonly id: string;
  readonly title: string;
  readonly year: number | null;
  readonly authors: readonly string[];
  readonly status: PaperStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
  readonly file: PaperFileInfo;
}

export interface PaperDetails extends PaperSummary {
  readonly abstract: string | null;
  readonly doi: string | null;
  readonly venue: string | null;
  readonly language: string | null;
  readonly tags: readonly string[];
  readonly collections: readonly string[];
}

export interface PaperListQuery {
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface PaperListResult {
  readonly items: readonly PaperSummary[];
  readonly total: number;
}

export interface PaperMetadataUpdate {
  readonly id: string;
  readonly rowVersion: number;
  readonly title: string;
  readonly abstract: string | null;
  readonly year: number | null;
  readonly doi: string | null;
  readonly venue: string | null;
  readonly language: string | null;
}

export type PaperRemovalMode = 'record-only' | 'record-and-managed-file';

export interface PaperRemovalRequest {
  readonly id: string;
  readonly mode: PaperRemovalMode;
  readonly confirmation: 'REMOVE_PAPER';
}

export interface PaperRemovalResult {
  readonly id: string;
  readonly managedFileDeleted: boolean;
}

export type ImportItemStatus = 'imported' | 'duplicate' | 'failed';

export interface PaperImportItem {
  readonly originalFilename: string;
  readonly status: ImportItemStatus;
  readonly paper: PaperSummary | null;
  readonly error: ApiError | null;
}

export interface PaperImportBatch {
  readonly cancelled: boolean;
  readonly items: readonly PaperImportItem[];
}

export type ApiErrorCode =
  | 'CONFLICT'
  | 'DATABASE_ERROR'
  | 'DUPLICATE_PAPER'
  | 'FILE_NOT_FOUND'
  | 'IMPORT_FAILED'
  | 'INVALID_INPUT'
  | 'INVALID_PDF'
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'STORAGE_ERROR';

export interface ApiError {
  readonly code: ApiErrorCode;
  readonly message: string;
}

export type ApiResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ApiError };

export interface LibraryApi {
  chooseAndImportPdfs(): Promise<ApiResult<PaperImportBatch>>;
  importDroppedPdfs(files: readonly File[]): Promise<ApiResult<PaperImportBatch>>;
  listPapers(query?: PaperListQuery): Promise<ApiResult<PaperListResult>>;
  getPaper(id: string): Promise<ApiResult<PaperDetails>>;
  updatePaperMetadata(input: PaperMetadataUpdate): Promise<ApiResult<PaperDetails>>;
  removePaper(input: PaperRemovalRequest): Promise<ApiResult<PaperRemovalResult>>;
}
