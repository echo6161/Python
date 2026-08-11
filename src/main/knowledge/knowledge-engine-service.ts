import { randomUUID } from 'node:crypto';

import type {
  KnowledgeIndexProgress,
  KnowledgeIndexStatus,
  KnowledgeProvenance,
  KnowledgeSearchInput,
  KnowledgeSearchPage,
  RunKnowledgeIndexInput,
  OpenKnowledgeResult,
} from '../../shared/contracts/knowledge';
import { sha256 } from './deterministic-chunker';
import { type EmbeddingProvider, validateEmbedding } from './embedding-provider';
import type {
  KnowledgeDataGateway,
  KnowledgeSourceFingerprint,
  StoredKnowledgeSourceInput,
} from './knowledge-data-gateway';
import { KnowledgeRetriever } from './knowledge-retriever';
import type { KnowledgeSourceDescriptor, KnowledgeSourceProvider } from './knowledge-source';

export const KNOWLEDGE_INDEX_VERSION = 'papermind-knowledge-v1';

export interface KnowledgeResultNavigator {
  openPaper(
    itemRef: KnowledgeProvenancePaper['itemRef'],
    attachmentKey: string,
    page: number,
  ): Promise<void>;
  openCode(
    repositoryId: string,
    relativePath: string,
    line: number,
    snapshotIdentity: string,
  ): Promise<{ readonly opened: boolean; readonly reason: string | null }>;
}

type KnowledgeProvenancePaper = Extract<KnowledgeProvenance, { readonly sourceType: 'paper' }>;

interface ActiveIndex {
  readonly workspaceId: string;
  readonly controller: AbortController;
}

export class KnowledgeEngineService {
  private readonly active = new Map<string, ActiveIndex>();
  private readonly retriever: KnowledgeRetriever;

  public constructor(
    private readonly data: KnowledgeDataGateway,
    private readonly sources: KnowledgeSourceProvider,
    private readonly embeddingProvider?: EmbeddingProvider,
    private readonly onProgress: (progress: KnowledgeIndexProgress) => void = () => undefined,
    private readonly navigator?: KnowledgeResultNavigator,
  ) {
    this.retriever = new KnowledgeRetriever(data, embeddingProvider);
  }

  public async initialize(): Promise<void> {
    await this.data.recoverInterruptedKnowledgeIndexes(new Date().toISOString());
  }

  public async getStatus(workspaceId: string): Promise<KnowledgeIndexStatus> {
    const status = await this.data.getKnowledgeIndexStatus(workspaceId);
    if (!status) return emptyStatus(workspaceId);
    return status.status === 'ready' && status.indexVersion !== KNOWLEDGE_INDEX_VERSION
      ? { ...status, status: 'stale' }
      : status;
  }

  public async runIndex(input: RunKnowledgeIndexInput): Promise<KnowledgeIndexStatus> {
    if (
      this.active.has(input.requestId) ||
      [...this.active.values()].some((active) => active.workspaceId === input.workspaceId)
    ) {
      throw new Error('This Workspace is already being indexed.');
    }
    const controller = new AbortController();
    this.active.set(input.requestId, { workspaceId: input.workspaceId, controller });
    this.emit(input, 'discovering', 0, 0, null);
    try {
      const discovered = await this.sources.discover(input.workspaceId, controller.signal);
      const current = await this.data.listKnowledgeSourceFingerprints(input.workspaceId);
      const { changed, removed } = diffSources(discovered, current, input.mode === 'rebuild');
      const status = await this.data.beginKnowledgeIndex({
        workspaceId: input.workspaceId,
        requestId: input.requestId,
        indexVersion: KNOWLEDGE_INDEX_VERSION,
        embeddingProvider: this.embeddingProvider?.id ?? null,
        totalSources: changed.length,
        startedAt: new Date().toISOString(),
      });
      void this.process(input, changed, removed, controller).catch(() => undefined);
      return status;
    } catch (error) {
      this.active.delete(input.requestId);
      if (controller.signal.aborted)
        throw new Error('Knowledge indexing was cancelled.', { cause: error });
      throw error;
    }
  }

  public cancelIndex(requestId: string): Promise<boolean> {
    const active = this.active.get(requestId);
    if (!active) return Promise.resolve(false);
    active.controller.abort();
    return Promise.resolve(true);
  }

  public async removeIndex(workspaceId: string): Promise<boolean> {
    for (const active of this.active.values()) {
      if (active.workspaceId === workspaceId) active.controller.abort();
    }
    return this.data.removeKnowledgeIndex(workspaceId);
  }

  public search(input: KnowledgeSearchInput): Promise<KnowledgeSearchPage> {
    return this.retriever.search(input);
  }

  public getChunk(workspaceId: string, chunkId: string) {
    return this.data.getKnowledgeChunk(workspaceId, chunkId);
  }

  public async openResult(workspaceId: string, chunkId: string): Promise<OpenKnowledgeResult> {
    const chunk = await this.data.getKnowledgeChunk(workspaceId, chunkId);
    if (!chunk) throw new Error('Knowledge result was not found in this Workspace.');
    const provenance = JSON.parse(chunk.provenanceJson) as KnowledgeProvenance;
    if (provenance.sourceType === 'paper') {
      if (!this.navigator) return unavailableNavigation('paper');
      await this.navigator.openPaper(
        provenance.itemRef,
        provenance.attachmentKey,
        provenance.pageNumber,
      );
      return { opened: true, target: 'paper', relatedId: provenance.itemRef.itemKey, reason: null };
    }
    if (provenance.sourceType === 'code') {
      if (!this.navigator) return unavailableNavigation('code');
      const navigation = await this.navigator.openCode(
        provenance.repositoryId,
        provenance.relativePath,
        provenance.startLine,
        provenance.snapshotIdentity,
      );
      return {
        opened: navigation.opened,
        target: 'code',
        relatedId: provenance.repositoryId,
        reason: navigation.reason,
      };
    }
    return {
      opened: true,
      target: provenance.sourceType,
      relatedId: provenance.sourceType === 'question' ? provenance.questionId : provenance.linkId,
      reason: null,
    };
  }

  private async process(
    input: RunKnowledgeIndexInput,
    changed: readonly KnowledgeSourceDescriptor[],
    removed: readonly KnowledgeSourceFingerprint[],
    controller: AbortController,
  ): Promise<void> {
    const extracted: StoredKnowledgeSourceInput[] = [];
    try {
      for (const [index, descriptor] of changed.entries()) {
        throwIfAborted(controller.signal);
        this.emit(input, 'extracting', index, changed.length, descriptor.title);
        const source = await descriptor.extract(controller.signal);
        throwIfAborted(controller.signal);
        const indexedAt = new Date().toISOString();
        const embeddings = this.embeddingProvider
          ? await this.embedChunks(
              source.chunks.map((chunk) => chunk.content),
              controller.signal,
              input,
              index,
              changed.length,
              descriptor.title,
            )
          : source.chunks.map(() => null);
        const sourceId = randomUUID();
        extracted.push({
          id: sourceId,
          workspaceId: input.workspaceId,
          sourceType: descriptor.sourceType,
          sourceIdentity: descriptor.sourceIdentity,
          snapshotIdentity: descriptor.snapshotIdentity,
          title: descriptor.title.slice(0, 1_000),
          fingerprint: descriptor.fingerprint,
          provenanceJson: JSON.stringify(descriptor.sourceProvenance),
          unavailableReason: source.unavailableReason,
          indexedAt,
          chunks: source.chunks.map((chunk, ordinal) => {
            const provenance = { ...chunk.provenance, indexedAt };
            return {
              id: randomUUID(),
              ordinal,
              contentHash: sha256(chunk.content),
              content: chunk.content.slice(0, 8_000),
              citation: chunk.citation.slice(0, 500),
              provenanceJson: JSON.stringify(provenance),
              embeddingJson: embeddings[ordinal] ? JSON.stringify(embeddings[ordinal]) : null,
            };
          }),
        });
        await this.data.updateKnowledgeIndexProgress({
          workspaceId: input.workspaceId,
          requestId: input.requestId,
          processedSources: index + 1,
          totalSources: changed.length,
          updatedAt: new Date().toISOString(),
        });
      }
      throwIfAborted(controller.signal);
      this.emit(input, 'saving', changed.length, changed.length, null);
      await this.data.completeKnowledgeIndex({
        workspaceId: input.workspaceId,
        requestId: input.requestId,
        indexVersion: KNOWLEDGE_INDEX_VERSION,
        embeddingProvider: this.embeddingProvider?.id ?? null,
        removed,
        changed: extracted,
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      const cancelled = controller.signal.aborted;
      const failure = {
        workspaceId: input.workspaceId,
        requestId: input.requestId,
        errorCode: cancelled ? 'CANCELLED' : 'INDEX_FAILED',
        errorMessage: cancelled ? 'Indexing was cancelled.' : safeErrorMessage(error),
        updatedAt: new Date().toISOString(),
      };
      if (cancelled) await this.data.cancelKnowledgeIndex(failure);
      else await this.data.failKnowledgeIndex(failure);
    } finally {
      this.active.delete(input.requestId);
    }
  }

  private async embedChunks(
    texts: readonly string[],
    signal: AbortSignal,
    input: RunKnowledgeIndexInput,
    processed: number,
    total: number,
    currentSource: string,
  ): Promise<readonly (readonly number[] | null)[]> {
    const provider = this.embeddingProvider;
    if (!provider || texts.length === 0) return texts.map(() => null);
    this.emit(input, 'embedding', processed, total, currentSource);
    const vectors = await provider.embed(texts, signal);
    if (vectors.length !== texts.length)
      throw new Error('Embedding provider result count mismatch.');
    return vectors.map((vector) => validateEmbedding(vector, provider.dimensions));
  }

  private emit(
    input: RunKnowledgeIndexInput,
    phase: KnowledgeIndexProgress['phase'],
    processedSources: number,
    totalSources: number,
    currentSource: string | null,
  ): void {
    this.onProgress({
      workspaceId: input.workspaceId,
      requestId: input.requestId,
      phase,
      processedSources,
      totalSources,
      currentSource,
    });
  }
}

function diffSources(
  discovered: readonly KnowledgeSourceDescriptor[],
  current: readonly KnowledgeSourceFingerprint[],
  rebuild: boolean,
): {
  readonly changed: readonly KnowledgeSourceDescriptor[];
  readonly removed: readonly KnowledgeSourceFingerprint[];
} {
  const currentByIdentity = new Map(
    current.map((source) => [`${source.sourceType}:${source.sourceIdentity}`, source]),
  );
  const discoveredKeys = new Set(
    discovered.map((source) => `${source.sourceType}:${source.sourceIdentity}`),
  );
  return {
    changed: rebuild
      ? discovered
      : discovered.filter((source) => {
          const stored = currentByIdentity.get(`${source.sourceType}:${source.sourceIdentity}`);
          if (stored && source.transientUnavailable) return false;
          return stored?.fingerprint !== source.fingerprint;
        }),
    removed: current.filter(
      (source) => rebuild || !discoveredKeys.has(`${source.sourceType}:${source.sourceIdentity}`),
    ),
  };
}

function emptyStatus(workspaceId: string): KnowledgeIndexStatus {
  return {
    workspaceId,
    status: 'unindexed',
    indexVersion: KNOWLEDGE_INDEX_VERSION,
    embeddingProvider: null,
    sourceCount: 0,
    chunkCount: 0,
    processedSources: 0,
    totalSources: 0,
    activeRequestId: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    startedAt: null,
    completedAt: null,
    updatedAt: null,
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('Knowledge indexing was cancelled.');
}

function safeErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : 'Knowledge indexing failed.').slice(0, 500);
}

function unavailableNavigation(target: 'code' | 'paper'): OpenKnowledgeResult {
  return { opened: false, target, relatedId: null, reason: 'Source navigation is unavailable.' };
}
