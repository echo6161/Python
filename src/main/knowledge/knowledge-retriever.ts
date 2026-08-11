import type {
  KnowledgeProvenance,
  KnowledgeSearchInput,
  KnowledgeSearchPage,
  KnowledgeSearchResult,
} from '../../shared/contracts/knowledge';
import type { KnowledgeDataGateway, StoredKnowledgeChunk } from './knowledge-data-gateway';
import { cosineSimilarity, type EmbeddingProvider, validateEmbedding } from './embedding-provider';

const MAX_RESULTS = 50;
const MAX_CANDIDATES = 5_000;
const MAX_SNIPPET_CHARACTERS = 520;

export class KnowledgeRetriever {
  public constructor(
    private readonly data: KnowledgeDataGateway,
    private readonly embeddingProvider?: EmbeddingProvider,
  ) {}

  public async search(input: KnowledgeSearchInput): Promise<KnowledgeSearchPage> {
    const offset = input.offset ?? 0;
    const limit = Math.min(input.limit ?? 20, MAX_RESULTS);
    const sourceTypes = input.sourceTypes ?? [];
    if (input.sourceTypes?.length === 0) {
      return { results: [], mode: 'keyword', offset, limit, total: 0 };
    }
    const keyword = await this.data.searchKnowledgeKeyword({
      workspaceId: input.workspaceId,
      query: input.query,
      sourceTypes,
      limit: Math.min(offset + limit + 100, 500),
    });
    const combined = new Map<string, KnowledgeSearchResult>();
    for (const chunk of keyword) combined.set(chunk.id, mapResult(chunk, chunk.keywordScore, null));

    let mode: KnowledgeSearchPage['mode'] = 'keyword';
    if (this.embeddingProvider) {
      const [queryVector] = await this.embeddingProvider.embed(
        [input.query],
        new AbortController().signal,
      );
      if (queryVector) {
        mode = 'hybrid';
        const validatedQuery = validateEmbedding(queryVector, this.embeddingProvider.dimensions);
        const semanticCandidates = await this.data.listKnowledgeSemanticCandidates(
          input.workspaceId,
          sourceTypes,
          MAX_CANDIDATES,
        );
        for (const candidate of semanticCandidates) {
          const vector = parseEmbedding(candidate.embeddingJson, this.embeddingProvider.dimensions);
          if (!vector) continue;
          const semanticScore = Math.max(0, cosineSimilarity(validatedQuery, vector));
          const previous = combined.get(candidate.id);
          combined.set(
            candidate.id,
            mapResult(candidate, previous?.keywordScore ?? 0, semanticScore),
          );
        }
      }
    }

    const ranked = [...combined.values()]
      .map((result) => ({
        ...result,
        score:
          result.semanticScore === null
            ? result.keywordScore
            : result.keywordScore * 0.55 + result.semanticScore * 0.45,
      }))
      .filter((result) => result.score > 0)
      .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
    return {
      results: ranked.slice(offset, offset + limit),
      mode,
      offset,
      limit,
      total: ranked.length,
    };
  }
}

function mapResult(
  chunk: StoredKnowledgeChunk,
  keywordScore: number,
  semanticScore: number | null,
): KnowledgeSearchResult {
  return {
    chunkId: chunk.id,
    sourceType: chunk.sourceType,
    title: chunk.title,
    snippet: boundedSnippet(chunk.content),
    citation: chunk.citation,
    score: keywordScore,
    keywordScore,
    semanticScore,
    stale: false,
    unavailableReason: chunk.unavailableReason,
    provenance: parseProvenance(chunk.provenanceJson),
  };
}

function boundedSnippet(content: string): string {
  const normalized = content.replace(/\s+/gu, ' ').trim();
  return normalized.length <= MAX_SNIPPET_CHARACTERS
    ? normalized
    : `${normalized.slice(0, MAX_SNIPPET_CHARACTERS - 3).trimEnd()}...`;
}

function parseEmbedding(value: string | null, dimensions: number): readonly number[] | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? validateEmbedding(
          parsed.filter((item): item is number => typeof item === 'number'),
          dimensions,
        )
      : null;
  } catch {
    return null;
  }
}

function parseProvenance(value: string): KnowledgeProvenance {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed) || !isSourceType(parsed.sourceType)) {
    throw new Error('Knowledge index contains invalid provenance.');
  }
  return parsed as unknown as KnowledgeProvenance;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function isSourceType(value: unknown): value is KnowledgeProvenance['sourceType'] {
  return value === 'paper' || value === 'code' || value === 'question' || value === 'link';
}
