import type { ApiResult } from './library';

export const ZOTERO_IPC_CHANNELS = Object.freeze({
  detect: 'zotero:detect',
  listItems: 'zotero:list-items',
  searchItems: 'zotero:search-items',
  cancelRequest: 'zotero:cancel-request',
  getItem: 'zotero:get-item',
  listCollections: 'zotero:list-collections',
  listCollectionItems: 'zotero:list-collection-items',
  listAttachments: 'zotero:list-attachments',
  findPrimaryPdf: 'zotero:find-primary-pdf',
  resolvePdfAvailability: 'zotero:resolve-pdf-availability',
});

export type ZoteroIpcChannels = typeof ZOTERO_IPC_CHANNELS;

export type ZoteroConnectionErrorCode =
  | 'api_disabled'
  | 'invalid_response'
  | 'not_running'
  | 'server_error'
  | 'timeout'
  | 'unsupported_version';

export interface ZoteroConnectionError {
  readonly code: ZoteroConnectionErrorCode;
  readonly message: string;
}

export interface ZoteroServerIdentity {
  readonly serverId: string;
  readonly schemaVersion: number | null;
  readonly kind: 'library_fallback' | 'server';
}

export interface ZoteroConnectionStatus {
  readonly available: boolean;
  readonly apiVersion: number | null;
  readonly serverIdentity: ZoteroServerIdentity | null;
  readonly error: ZoteroConnectionError | null;
}

export interface ZoteroLibraryRef {
  readonly type: 'group' | 'user';
  readonly id: string;
}

export interface ZoteroItemRef {
  readonly serverId: string;
  readonly library: ZoteroLibraryRef;
  readonly itemKey: string;
}

export interface ZoteroCollectionRef {
  readonly serverId: string;
  readonly library: ZoteroLibraryRef;
  readonly collectionKey: string;
}

export interface ZoteroCreator {
  readonly creatorType: string;
  readonly name: string;
}

export type ZoteroPdfStorageMode = 'linked' | 'stored';
export type ZoteroPdfState = 'available' | 'missing' | 'none' | 'not_local';

export interface ZoteroPdfAvailability {
  readonly hasPdf: boolean;
  readonly state: ZoteroPdfState;
  readonly storageMode: ZoteroPdfStorageMode | null;
}

export interface ZoteroItemSummary {
  readonly ref: ZoteroItemRef;
  readonly itemType: string;
  readonly title: string;
  readonly creators: readonly ZoteroCreator[];
  readonly date: string | null;
  readonly year: number | null;
  readonly publication: string | null;
  readonly pdf: ZoteroPdfAvailability;
  readonly version: number;
}

export interface ZoteroItemDetails extends ZoteroItemSummary {
  readonly doi: string | null;
  readonly abstract: string | null;
  readonly url: string | null;
  readonly tags: readonly string[];
  readonly collections: readonly ZoteroCollectionRef[];
}

export interface ZoteroPageRequest {
  readonly requestId: string;
  readonly start: number;
  readonly limit: number;
}

export interface ZoteroSearchRequest extends ZoteroPageRequest {
  readonly query: string;
}

export interface ZoteroItemPage {
  readonly items: readonly ZoteroItemSummary[];
  readonly start: number;
  readonly limit: number;
  readonly total: number | null;
  readonly hasNext: boolean;
}

export interface ZoteroCancelResult {
  readonly cancelled: boolean;
}

export interface ZoteroCollection {
  readonly ref: ZoteroCollectionRef;
  readonly name: string;
  readonly parent: ZoteroCollectionRef | null;
  readonly version: number;
}

export type ZoteroAttachmentLinkMode =
  'imported_file' | 'imported_url' | 'linked_file' | 'linked_url' | 'unknown';

export interface ZoteroAttachment {
  readonly ref: ZoteroItemRef;
  readonly parentItemRef: ZoteroItemRef;
  readonly title: string;
  readonly filename: string | null;
  readonly contentType: string | null;
  readonly linkMode: ZoteroAttachmentLinkMode;
  readonly isPdf: boolean;
  readonly pdf: ZoteroPdfAvailability;
  readonly version: number;
}

export interface ZoteroApi {
  detectZotero(): Promise<ApiResult<ZoteroConnectionStatus>>;
  listItems(input: ZoteroPageRequest): Promise<ApiResult<ZoteroItemPage>>;
  searchItems(input: ZoteroSearchRequest): Promise<ApiResult<ZoteroItemPage>>;
  cancelRequest(requestId: string): Promise<ApiResult<ZoteroCancelResult>>;
  getItem(ref: ZoteroItemRef): Promise<ApiResult<ZoteroItemDetails>>;
  listCollections(): Promise<ApiResult<readonly ZoteroCollection[]>>;
  listCollectionItems(ref: ZoteroCollectionRef): Promise<ApiResult<readonly ZoteroItemSummary[]>>;
  listAttachments(ref: ZoteroItemRef): Promise<ApiResult<readonly ZoteroAttachment[]>>;
  findPrimaryPdf(ref: ZoteroItemRef): Promise<ApiResult<ZoteroAttachment | null>>;
  resolvePdfAvailability(ref: ZoteroItemRef): Promise<ApiResult<ZoteroPdfAvailability>>;
}
