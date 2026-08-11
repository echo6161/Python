import type { CodeLanguage } from './code-intelligence';
import type { ApiResult } from './library';
import type { ZoteroItemRef } from './zotero';

export const KNOWLEDGE_IPC_CHANNELS = Object.freeze({
  getStatus: 'knowledge:get-status',
  runIndex: 'knowledge:run-index',
  cancelIndex: 'knowledge:cancel-index',
  removeIndex: 'knowledge:remove-index',
  search: 'knowledge:search',
  openResult: 'knowledge:open-result',
  progress: 'knowledge:index-progress',
});

export type KnowledgeIpcChannels = typeof KNOWLEDGE_IPC_CHANNELS;
export type KnowledgeSourceType = 'code' | 'link' | 'paper' | 'question';
export type KnowledgeIndexLifecycle =
  'cancelled' | 'failed' | 'indexing' | 'ready' | 'stale' | 'unindexed';
export type KnowledgeIndexMode = 'incremental' | 'rebuild';
export type KnowledgeSearchMode = 'hybrid' | 'keyword';

export interface KnowledgeIndexStatus {
  readonly workspaceId: string;
  readonly status: KnowledgeIndexLifecycle;
  readonly indexVersion: string;
  readonly embeddingProvider: string | null;
  readonly sourceCount: number;
  readonly chunkCount: number;
  readonly processedSources: number;
  readonly totalSources: number;
  readonly activeRequestId: string | null;
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly updatedAt: string | null;
}

export interface RunKnowledgeIndexInput {
  readonly workspaceId: string;
  readonly requestId: string;
  readonly mode: KnowledgeIndexMode;
}

export interface KnowledgeIndexProgress {
  readonly workspaceId: string;
  readonly requestId: string;
  readonly phase: 'discovering' | 'embedding' | 'extracting' | 'saving';
  readonly processedSources: number;
  readonly totalSources: number;
  readonly currentSource: string | null;
}

export interface KnowledgeIndexCancelResult {
  readonly requestId: string;
  readonly cancelled: boolean;
}

export interface RemoveKnowledgeIndexInput {
  readonly workspaceId: string;
  readonly confirmation: 'REMOVE_KNOWLEDGE_INDEX';
}

export interface KnowledgeSearchInput {
  readonly workspaceId: string;
  readonly query: string;
  readonly sourceTypes?: readonly KnowledgeSourceType[];
  readonly offset?: number;
  readonly limit?: number;
}

interface KnowledgeProvenanceBase {
  readonly sourceIdentity: string;
  readonly snapshotIdentity: string;
  readonly indexedAt: string;
}

export interface PaperKnowledgeProvenance extends KnowledgeProvenanceBase {
  readonly sourceType: 'paper';
  readonly itemRef: ZoteroItemRef;
  readonly attachmentKey: string;
  readonly pageNumber: number;
}

export interface CodeKnowledgeProvenance extends KnowledgeProvenanceBase {
  readonly sourceType: 'code';
  readonly repositoryId: string;
  readonly repositoryName: string;
  readonly language: CodeLanguage;
  readonly relativePath: string;
  readonly startLine: number;
  readonly endLine: number;
}

export interface QuestionKnowledgeProvenance extends KnowledgeProvenanceBase {
  readonly sourceType: 'question';
  readonly questionId: string;
  readonly status: string;
}

export interface LinkKnowledgeProvenance extends KnowledgeProvenanceBase {
  readonly sourceType: 'link';
  readonly linkId: string;
  readonly itemRef: ZoteroItemRef;
  readonly repositoryId: string;
  readonly relativePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly pageNumber: number | null;
}

export type KnowledgeProvenance =
  | CodeKnowledgeProvenance
  | LinkKnowledgeProvenance
  | PaperKnowledgeProvenance
  | QuestionKnowledgeProvenance;

export interface KnowledgeSearchResult {
  readonly chunkId: string;
  readonly sourceType: KnowledgeSourceType;
  readonly title: string;
  readonly snippet: string;
  readonly citation: string;
  readonly score: number;
  readonly keywordScore: number;
  readonly semanticScore: number | null;
  readonly stale: boolean;
  readonly unavailableReason: string | null;
  readonly provenance: KnowledgeProvenance;
}

export interface KnowledgeSearchPage {
  readonly results: readonly KnowledgeSearchResult[];
  readonly mode: KnowledgeSearchMode;
  readonly offset: number;
  readonly limit: number;
  readonly total: number;
}

export interface OpenKnowledgeResultInput {
  readonly workspaceId: string;
  readonly chunkId: string;
}

export interface OpenKnowledgeResult {
  readonly opened: boolean;
  readonly target: 'code' | 'link' | 'paper' | 'question';
  readonly relatedId: string | null;
  readonly reason: string | null;
}

export interface KnowledgeApi {
  getStatus(workspaceId: string): Promise<ApiResult<KnowledgeIndexStatus>>;
  runIndex(input: RunKnowledgeIndexInput): Promise<ApiResult<KnowledgeIndexStatus>>;
  cancelIndex(requestId: string): Promise<ApiResult<KnowledgeIndexCancelResult>>;
  removeIndex(input: RemoveKnowledgeIndexInput): Promise<ApiResult<{ readonly removed: boolean }>>;
  search(input: KnowledgeSearchInput): Promise<ApiResult<KnowledgeSearchPage>>;
  openResult(input: OpenKnowledgeResultInput): Promise<ApiResult<OpenKnowledgeResult>>;
  onProgress(listener: (progress: KnowledgeIndexProgress) => void): () => void;
}
