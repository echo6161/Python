import type { KnowledgeIndexStatus, KnowledgeSourceType } from '../../shared/contracts/knowledge';

export interface KnowledgeSourceFingerprint {
  readonly sourceType: KnowledgeSourceType;
  readonly sourceIdentity: string;
  readonly fingerprint: string;
}

export interface StoredKnowledgeSourceInput extends KnowledgeSourceFingerprint {
  readonly id: string;
  readonly workspaceId: string;
  readonly snapshotIdentity: string;
  readonly title: string;
  readonly provenanceJson: string;
  readonly unavailableReason: string | null;
  readonly indexedAt: string;
  readonly chunks: readonly {
    readonly id: string;
    readonly ordinal: number;
    readonly contentHash: string;
    readonly content: string;
    readonly citation: string;
    readonly provenanceJson: string;
    readonly embeddingJson: string | null;
  }[];
}

export interface BeginKnowledgeIndexInput {
  readonly workspaceId: string;
  readonly requestId: string;
  readonly indexVersion: string;
  readonly embeddingProvider: string | null;
  readonly totalSources: number;
  readonly startedAt: string;
}

export interface UpdateKnowledgeIndexProgressInput {
  readonly workspaceId: string;
  readonly requestId: string;
  readonly processedSources: number;
  readonly totalSources: number;
  readonly updatedAt: string;
}

export interface CompleteKnowledgeIndexInput {
  readonly workspaceId: string;
  readonly requestId: string;
  readonly indexVersion: string;
  readonly embeddingProvider: string | null;
  readonly removed: readonly KnowledgeSourceFingerprint[];
  readonly changed: readonly StoredKnowledgeSourceInput[];
  readonly completedAt: string;
}

export interface KnowledgeIndexFailureInput {
  readonly workspaceId: string;
  readonly requestId: string;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly updatedAt: string;
}

export interface StoredKnowledgeChunk {
  readonly id: string;
  readonly workspaceId: string;
  readonly sourceType: KnowledgeSourceType;
  readonly sourceIdentity: string;
  readonly snapshotIdentity: string;
  readonly title: string;
  readonly provenanceJson: string;
  readonly citation: string;
  readonly unavailableReason: string | null;
  readonly indexedAt: string;
  readonly content: string;
  readonly embeddingJson: string | null;
  readonly keywordScore: number;
}

export interface KnowledgeKeywordSearchInput {
  readonly workspaceId: string;
  readonly query: string;
  readonly sourceTypes: readonly KnowledgeSourceType[];
  readonly limit: number;
}

export interface KnowledgeDataGateway {
  recoverInterruptedKnowledgeIndexes(updatedAt: string): Promise<number>;
  getKnowledgeIndexStatus(workspaceId: string): Promise<KnowledgeIndexStatus | null>;
  listKnowledgeSourceFingerprints(
    workspaceId: string,
  ): Promise<readonly KnowledgeSourceFingerprint[]>;
  beginKnowledgeIndex(input: BeginKnowledgeIndexInput): Promise<KnowledgeIndexStatus>;
  updateKnowledgeIndexProgress(
    input: UpdateKnowledgeIndexProgressInput,
  ): Promise<KnowledgeIndexStatus>;
  completeKnowledgeIndex(input: CompleteKnowledgeIndexInput): Promise<KnowledgeIndexStatus>;
  cancelKnowledgeIndex(input: KnowledgeIndexFailureInput): Promise<KnowledgeIndexStatus>;
  failKnowledgeIndex(input: KnowledgeIndexFailureInput): Promise<KnowledgeIndexStatus>;
  removeKnowledgeIndex(workspaceId: string): Promise<boolean>;
  searchKnowledgeKeyword(
    input: KnowledgeKeywordSearchInput,
  ): Promise<readonly StoredKnowledgeChunk[]>;
  listKnowledgeSemanticCandidates(
    workspaceId: string,
    sourceTypes: readonly KnowledgeSourceType[],
    limit: number,
  ): Promise<readonly StoredKnowledgeChunk[]>;
  getKnowledgeChunk(workspaceId: string, chunkId: string): Promise<StoredKnowledgeChunk | null>;
}
