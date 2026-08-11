import type { KnowledgeProvenance, KnowledgeSourceType } from '../../shared/contracts/knowledge';

export interface ExtractedKnowledgeChunk {
  readonly content: string;
  readonly citation: string;
  readonly provenance: KnowledgeProvenance;
}

export interface ExtractedKnowledgeSource {
  readonly unavailableReason: string | null;
  readonly chunks: readonly ExtractedKnowledgeChunk[];
}

export interface KnowledgeSourceDescriptor {
  readonly sourceType: KnowledgeSourceType;
  readonly sourceIdentity: string;
  readonly snapshotIdentity: string;
  readonly title: string;
  readonly fingerprint: string;
  readonly sourceProvenance: Readonly<Record<string, unknown>>;
  readonly transientUnavailable?: boolean;
  extract(signal: AbortSignal): Promise<ExtractedKnowledgeSource>;
}

export interface KnowledgeSourceProvider {
  discover(workspaceId: string, signal: AbortSignal): Promise<readonly KnowledgeSourceDescriptor[]>;
}
