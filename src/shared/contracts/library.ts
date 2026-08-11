export const LIBRARY_IPC_CHANNELS = Object.freeze({
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
});

export type LibraryIpcChannels = typeof LIBRARY_IPC_CHANNELS;

export type PaperStatus = 'importing' | 'ready' | 'failed' | 'trashed';
export type ReadingStatus = 'unread' | 'reading' | 'completed' | 'shelved';
export type MetadataReviewStatus = 'pending' | 'confirmed';
export type MetadataFieldName = 'title' | 'authors' | 'abstract' | 'year' | 'doi';
export type MetadataSource =
  'manual' | 'pdf_metadata' | 'first_page' | 'filename' | 'legacy' | 'none';
export type MetadataConfidence = 'confirmed' | 'high' | 'medium' | 'low' | 'unconfirmed';
export type PaperSortField = 'updatedAt' | 'importedAt' | 'title' | 'year' | 'author';
export type SortDirection = 'asc' | 'desc';

export interface MetadataEvidence {
  readonly field: MetadataFieldName;
  readonly source: MetadataSource;
  readonly confidence: MetadataConfidence;
  readonly userEdited: boolean;
}

export interface Tag {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
}

export interface Collection {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly sortOrder: number;
}

export interface LibraryOrganization {
  readonly tags: readonly Tag[];
  readonly collections: readonly Collection[];
}

export interface PaperFileInfo {
  readonly id: string;
  readonly originalFilename: string;
  readonly internalFilename: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly mimeType: 'application/pdf';
  readonly pageCount: number | null;
  readonly textExtractionStatus: 'pending' | 'succeeded' | 'partial' | 'failed';
  readonly importedAt: string;
}

export interface PaperSummary {
  readonly id: string;
  readonly title: string;
  readonly year: number | null;
  readonly authors: readonly string[];
  readonly status: PaperStatus;
  readonly readingStatus: ReadingStatus;
  readonly isFavorite: boolean;
  readonly metadataReviewStatus: MetadataReviewStatus;
  readonly tags: readonly Tag[];
  readonly collections: readonly Collection[];
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
  readonly metadataEvidence: readonly MetadataEvidence[];
}

export interface PaperListQuery {
  readonly search?: string;
  readonly title?: string;
  readonly author?: string;
  readonly year?: number;
  readonly tagIds?: readonly string[];
  readonly collectionId?: string;
  readonly readingStatuses?: readonly ReadingStatus[];
  readonly favorite?: boolean;
  readonly fullText?: string;
  readonly sortBy?: PaperSortField;
  readonly sortDirection?: SortDirection;
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
  readonly authors: readonly string[];
  readonly abstract: string | null;
  readonly year: number | null;
  readonly doi: string | null;
  readonly venue: string | null;
  readonly language: string | null;
}

export interface PaperOrganizationUpdate {
  readonly id: string;
  readonly rowVersion: number;
  readonly readingStatus: ReadingStatus;
  readonly isFavorite: boolean;
  readonly tagIds: readonly string[];
  readonly collectionIds: readonly string[];
}

export interface PaperDetailsUpdate {
  readonly metadata: PaperMetadataUpdate;
  readonly organization: Omit<PaperOrganizationUpdate, 'id' | 'rowVersion'>;
}

export interface BatchPaperUpdate {
  readonly ids: readonly string[];
  readonly addTagIds: readonly string[];
  readonly readingStatus?: ReadingStatus;
}

export interface BatchPaperUpdateResult {
  readonly updatedIds: readonly string[];
}

export interface CreateTagInput {
  readonly name: string;
  readonly color: string | null;
}

export interface CreateCollectionInput {
  readonly name: string;
  readonly description: string | null;
}

export interface DeleteOrganizationItemInput {
  readonly id: string;
  readonly confirmation: 'REMOVE_ORGANIZATION_ITEM';
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
  readonly paper: PaperDetails | null;
  readonly warning: string | null;
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
  | 'STORAGE_ERROR'
  | 'ZOTERO_API_DISABLED'
  | 'ZOTERO_CANCELLED'
  | 'ZOTERO_IDENTITY_CHANGED'
  | 'ZOTERO_INVALID_RESPONSE'
  | 'ZOTERO_NOT_RUNNING'
  | 'ZOTERO_SERVER_ERROR'
  | 'ZOTERO_TIMEOUT'
  | 'ZOTERO_UNSUPPORTED_VERSION';

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
  updatePaperDetails(input: PaperDetailsUpdate): Promise<ApiResult<PaperDetails>>;
  updatePaperMetadata(input: PaperMetadataUpdate): Promise<ApiResult<PaperDetails>>;
  updatePaperOrganization(input: PaperOrganizationUpdate): Promise<ApiResult<PaperDetails>>;
  batchUpdatePapers(input: BatchPaperUpdate): Promise<ApiResult<BatchPaperUpdateResult>>;
  listOrganization(): Promise<ApiResult<LibraryOrganization>>;
  createTag(input: CreateTagInput): Promise<ApiResult<Tag>>;
  deleteTag(input: DeleteOrganizationItemInput): Promise<ApiResult<{ readonly id: string }>>;
  createCollection(input: CreateCollectionInput): Promise<ApiResult<Collection>>;
  deleteCollection(input: DeleteOrganizationItemInput): Promise<ApiResult<{ readonly id: string }>>;
  removePaper(input: PaperRemovalRequest): Promise<ApiResult<PaperRemovalResult>>;
}
