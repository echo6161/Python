import { randomUUID } from 'node:crypto';

import type { KnowledgeEngineService } from '../knowledge/knowledge-engine-service';
import type {
  PrepareResearchChatContextInput,
  ResearchChatContextPreview,
} from '../../shared/contracts/research-chat';

export const RESEARCH_CHAT_CONTEXT_VERSION = 'papermind-research-chat-context-v1';
export const RESEARCH_CHAT_MAX_SOURCES = 12;
export const RESEARCH_CHAT_MAX_CONTEXT_CHARACTERS = 12_000;
const PREVIEW_TTL_MS = 10 * 60 * 1_000;
const CANDIDATE_LIMIT = 40;

export class ResearchChatContextBuilder {
  public constructor(private readonly knowledge: KnowledgeEngineService) {}

  public async build(input: PrepareResearchChatContextInput): Promise<ResearchChatContextPreview> {
    const [status, page] = await Promise.all([
      this.knowledge.getStatus(input.workspaceId),
      this.knowledge.search({
        workspaceId: input.workspaceId,
        query: input.query.slice(0, 300),
        sourceTypes: input.sourceTypes,
        limit: CANDIDATE_LIMIT,
      }),
    ]);
    const seen = new Set<string>();
    const unique = page.results.filter((result) => {
      const key = `${result.provenance.sourceIdentity}\u0000${normalize(result.snippet)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const sources: ResearchChatContextPreview['sources'][number][] = [];
    let usedCharacters = 0;
    for (const result of unique) {
      if (sources.length >= RESEARCH_CHAT_MAX_SOURCES) break;
      const cost = result.snippet.length + result.citation.length;
      if (usedCharacters + cost > RESEARCH_CHAT_MAX_CONTEXT_CHARACTERS) break;
      sources.push({
        alias: `S${String(sources.length + 1)}`,
        chunkId: result.chunkId,
        sourceType: result.sourceType,
        title: result.title,
        snippet: result.snippet,
        citation: result.citation,
        score: result.score,
        stale: result.stale,
        unavailableReason: result.unavailableReason,
        provenance: result.provenance,
      });
      usedCharacters += cost;
    }
    const created = new Date();
    return {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      questionId: input.questionId,
      query: input.query,
      sourceTypes: input.sourceTypes,
      retrievalVersion: [
        RESEARCH_CHAT_CONTEXT_VERSION,
        status.indexVersion,
        status.completedAt ?? status.updatedAt ?? 'unindexed',
      ].join(':'),
      searchMode: page.mode,
      sources,
      budget: {
        maximumCharacters: RESEARCH_CHAT_MAX_CONTEXT_CHARACTERS,
        usedCharacters,
        maximumSources: RESEARCH_CHAT_MAX_SOURCES,
        candidateSources: page.results.length,
        includedSources: sources.length,
        deduplicatedSources: page.results.length - unique.length,
        truncatedSources: Math.max(0, unique.length - sources.length),
      },
      createdAt: created.toISOString(),
      expiresAt: new Date(created.getTime() + PREVIEW_TTL_MS).toISOString(),
    };
  }
}

export function selectResearchChatSources(
  preview: ResearchChatContextPreview,
  selectedAliases: readonly string[],
): ResearchChatContextPreview {
  const selected = new Set(selectedAliases);
  const sources = preview.sources.filter(({ alias }) => selected.has(alias));
  if (sources.length !== selected.size)
    throw new Error('The context selection contains an unknown source.');
  return {
    ...preview,
    sources,
    budget: {
      ...preview.budget,
      usedCharacters: sources.reduce(
        (sum, source) => sum + source.snippet.length + source.citation.length,
        0,
      ),
      includedSources: sources.length,
      truncatedSources: preview.budget.truncatedSources + preview.sources.length - sources.length,
    },
  };
}

function normalize(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().toLocaleLowerCase();
}
