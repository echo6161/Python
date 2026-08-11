import type { ApiResult } from './library';

export const CODE_INTELLIGENCE_IPC_CHANNELS = Object.freeze({
  getStatus: 'code-intelligence:get-status',
  runIndex: 'code-intelligence:run-index',
  cancelIndex: 'code-intelligence:cancel-index',
  searchFiles: 'code-intelligence:search-files',
  searchSymbols: 'code-intelligence:search-symbols',
  searchText: 'code-intelligence:search-text',
  progress: 'events:code-intelligence-progress',
});

export type CodeIntelligenceIpcChannels = typeof CODE_INTELLIGENCE_IPC_CHANNELS;
export type CodeLanguage = 'javascript' | 'python' | 'typescript' | 'unsupported';
export type CodeParseMode = 'structured' | 'fallback';
export type CodeSymbolKind =
  'class' | 'export' | 'function' | 'import' | 'interface' | 'method' | 'module' | 'type';
export type CodeIndexLifecycle =
  'cancelled' | 'failed' | 'indexing' | 'ready' | 'stale' | 'unindexed';

export interface CodeIndexStatus {
  readonly repositoryId: string;
  readonly status: CodeIndexLifecycle;
  readonly snapshotIdentity: string | null;
  readonly currentSnapshotIdentity: string | null;
  readonly dirty: boolean;
  readonly parserVersion: string;
  readonly fileCount: number;
  readonly symbolCount: number;
  readonly chunkCount: number;
  readonly processedFiles: number;
  readonly totalFiles: number;
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly updatedAt: string | null;
}

export interface RunCodeIndexInput {
  readonly repositoryId: string;
  readonly requestId: string;
  readonly mode: 'incremental' | 'rebuild';
}

export interface CodeIndexProgress {
  readonly requestId: string;
  readonly repositoryId: string;
  readonly phase: 'discovering' | 'parsing' | 'saving';
  readonly processedFiles: number;
  readonly totalFiles: number;
  readonly currentFile: string | null;
}

export interface CodeIndexCancelResult {
  readonly requestId: string;
  readonly cancelled: boolean;
}

export interface CodeSearchInput {
  readonly repositoryId: string;
  readonly query: string;
  readonly offset?: number;
  readonly limit?: number;
}

interface CodeSearchResultBase {
  readonly repositoryId: string;
  readonly relativePath: string;
  readonly language: CodeLanguage;
  readonly snapshotIdentity: string;
  readonly currentSnapshotIdentity: string | null;
  readonly stale: boolean;
  readonly contentHash: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly snippet: string;
}

export interface CodeFileSearchResult extends CodeSearchResultBase {
  readonly parseMode: CodeParseMode;
}

export interface CodeSymbolSearchResult extends CodeSearchResultBase {
  readonly symbolKind: CodeSymbolKind;
  readonly symbolName: string;
  readonly qualifiedName: string;
}

export interface CodeTextSearchResult extends CodeSearchResultBase {
  readonly symbolKind: CodeSymbolKind | null;
  readonly symbolName: string | null;
}

export interface CodeSearchPage<T> {
  readonly results: readonly T[];
  readonly offset: number;
  readonly limit: number;
  readonly total: number;
}

export interface CodeIntelligenceApi {
  getStatus(repositoryId: string): Promise<ApiResult<CodeIndexStatus>>;
  runIndex(input: RunCodeIndexInput): Promise<ApiResult<CodeIndexStatus>>;
  cancelIndex(requestId: string): Promise<ApiResult<CodeIndexCancelResult>>;
  searchFiles(input: CodeSearchInput): Promise<ApiResult<CodeSearchPage<CodeFileSearchResult>>>;
  searchSymbols(input: CodeSearchInput): Promise<ApiResult<CodeSearchPage<CodeSymbolSearchResult>>>;
  searchText(input: CodeSearchInput): Promise<ApiResult<CodeSearchPage<CodeTextSearchResult>>>;
  onProgress(listener: (progress: CodeIndexProgress) => void): () => void;
}
