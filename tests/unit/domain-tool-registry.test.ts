import { describe, expect, it } from 'vitest';

import { createDomainToolRegistry } from '../../src/main/research-agent/domain-tool-registry';
import type { KnowledgeEngineService } from '../../src/main/knowledge/knowledge-engine-service';
import type { WorkspaceDataGateway } from '../../src/main/workspace/workspace-data-gateway';
import type { QuestionDataGateway } from '../../src/main/question/question-data-gateway';
import type { ResearchMemoryDataGateway } from '../../src/main/research-memory/research-memory-data-gateway';
import type { ResearchPlanDataGateway } from '../../src/main/research-plan/research-plan-data-gateway';
import type { PaperCodeLinkDataGateway } from '../../src/main/paper-code-link/paper-code-link-data-gateway';

const workspaceId = '11111111-1111-4111-8111-111111111111';

describe('DomainToolRegistry security boundary', () => {
  it('exposes only the fixed read-only registry and rejects arbitrary arguments', async () => {
    const registry = fixtureRegistry();
    expect(registry.list()).toEqual([
      'inspect_workspace',
      'search_knowledge',
      'search_code',
      'read_paper_pages',
      'read_code',
      'list_questions',
      'list_notes_memory',
      'inspect_plan',
      'list_links',
    ]);
    const context = {
      workspaceId,
      signal: new AbortController().signal,
      discoveredChunks: new Map(),
    };
    await expect(
      registry.execute('search_knowledge', context, { url: 'http://127.0.0.1:1' }),
    ).rejects.toThrow();
    await expect(
      registry.execute('inspect_workspace', context, { workspaceId, shell: true }),
    ).rejects.toThrow();
    await expect(registry.execute('list_questions', context, { limit: 10 })).rejects.toThrow();
    await expect(
      registry.execute('read_code', context, {
        chunkId: '22222222-2222-4222-8222-222222222222',
        path: 'C:\\Users\\secret',
      }),
    ).rejects.toThrow();
  });

  it('requires read tools to use a same-run discovered chunk of the matching type', async () => {
    const registry = fixtureRegistry();
    const context = {
      workspaceId,
      signal: new AbortController().signal,
      discoveredChunks: new Map(),
    };
    await expect(
      registry.execute('read_paper_pages', context, {
        chunkId: '22222222-2222-4222-8222-222222222222',
      }),
    ).rejects.toThrow('in-scope result');
  });
});

function fixtureRegistry() {
  return createDomainToolRegistry({
    workspace: {
      getWorkspace: () => Promise.resolve(null),
    } as unknown as WorkspaceDataGateway,
    knowledge: {
      search: () =>
        Promise.resolve({ results: [], mode: 'keyword', offset: 0, limit: 12, total: 0 }),
      getChunk: () => Promise.resolve(null),
    } as unknown as KnowledgeEngineService,
    questions: { listQuestions: () => Promise.resolve([]) } as unknown as QuestionDataGateway,
    memory: {
      listResearchContent: () => Promise.resolve([]),
      getResearchContent: () => Promise.resolve(null),
    } as unknown as ResearchMemoryDataGateway,
    plan: {
      getActiveResearchPlan: () => Promise.resolve(null),
    } as unknown as ResearchPlanDataGateway,
    links: { listPaperCodeLinks: () => Promise.resolve([]) } as unknown as PaperCodeLinkDataGateway,
  });
}
