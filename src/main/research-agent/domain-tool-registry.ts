import { z } from 'zod';

import type {
  ResearchAgentCitation,
  ResearchAgentToolName,
} from '../../shared/contracts/research-agent';
import type { KnowledgeEngineService } from '../knowledge/knowledge-engine-service';
import type { PaperCodeLinkDataGateway } from '../paper-code-link/paper-code-link-data-gateway';
import type { QuestionDataGateway } from '../question/question-data-gateway';
import type { ResearchMemoryDataGateway } from '../research-memory/research-memory-data-gateway';
import type { ResearchPlanDataGateway } from '../research-plan/research-plan-data-gateway';
import type { WorkspaceDataGateway } from '../workspace/workspace-data-gateway';
import { LibraryError } from '../library/errors';

const boundedQuery = z.string().trim().min(1).max(4000);
const chunkInput = z.object({ chunkId: z.uuid() }).strict();

export interface AgentToolContext {
  readonly workspaceId: string;
  readonly signal: AbortSignal;
  readonly discoveredChunks: Map<string, ResearchAgentCitation>;
}

export interface AgentToolResult {
  readonly content: string;
  readonly summary: string;
  readonly citations: readonly ResearchAgentCitation[];
}

export interface DomainToolDefinition {
  readonly name: ResearchAgentToolName;
  readonly inputSchema: z.ZodType;
  readonly inputSummary: (input: unknown) => string;
  readonly execute: (context: AgentToolContext, input: unknown) => Promise<AgentToolResult>;
}

export class DomainToolRegistry {
  private readonly definitions: ReadonlyMap<ResearchAgentToolName, DomainToolDefinition>;

  public constructor(definitions: readonly DomainToolDefinition[]) {
    this.definitions = new Map(definitions.map((definition) => [definition.name, definition]));
  }

  public list(): readonly ResearchAgentToolName[] {
    return [...this.definitions.keys()];
  }

  public inputSummary(name: ResearchAgentToolName, input: unknown): string {
    const definition = this.require(name);
    return definition.inputSummary(definition.inputSchema.parse(input)).slice(0, 1000);
  }

  public execute(
    name: ResearchAgentToolName,
    context: AgentToolContext,
    input: unknown,
  ): Promise<AgentToolResult> {
    return Promise.resolve().then(() => {
      if (context.signal.aborted) throw new Error('The Agent run was cancelled.');
      const definition = this.require(name);
      return definition.execute(context, definition.inputSchema.parse(input));
    });
  }

  private require(name: ResearchAgentToolName): DomainToolDefinition {
    const definition = this.definitions.get(name);
    if (!definition) throw new LibraryError('INVALID_INPUT', 'The Agent tool is not allowed.');
    return definition;
  }
}

export function createDomainToolRegistry(dependencies: {
  readonly workspace: WorkspaceDataGateway;
  readonly knowledge: KnowledgeEngineService;
  readonly questions: QuestionDataGateway;
  readonly memory: ResearchMemoryDataGateway;
  readonly plan: ResearchPlanDataGateway;
  readonly links: PaperCodeLinkDataGateway;
}): DomainToolRegistry {
  const search = (sourceTypes?: readonly ('code' | 'link' | 'paper' | 'question')[]) =>
    defineSearchTool(dependencies.knowledge, sourceTypes);
  return new DomainToolRegistry([
    {
      name: 'inspect_workspace',
      inputSchema: z.null(),
      inputSummary: () => 'current Workspace identity and research goal',
      execute: async ({ workspaceId }) => {
        const workspace = await dependencies.workspace.getWorkspace(workspaceId);
        if (!workspace) throw new LibraryError('NOT_FOUND', 'The Workspace does not exist.');
        return {
          content: JSON.stringify({
            name: workspace.name,
            description: workspace.description,
            researchGoal: workspace.researchGoal,
            status: workspace.status,
          }),
          summary: `Workspace ${workspace.name}; status ${workspace.status}`,
          citations: [],
        };
      },
    },
    { name: 'search_knowledge', ...search() },
    { name: 'search_code', ...search(['code']) },
    {
      name: 'read_paper_pages',
      inputSchema: chunkInput,
      inputSummary: summarizeChunk,
      execute: (context, input) =>
        readDiscoveredChunk(dependencies.knowledge, context, input, 'paper'),
    },
    {
      name: 'read_code',
      inputSchema: chunkInput,
      inputSummary: summarizeChunk,
      execute: (context, input) =>
        readDiscoveredChunk(dependencies.knowledge, context, input, 'code'),
    },
    {
      name: 'list_questions',
      inputSchema: z.null(),
      inputSummary: () => 'bounded current Workspace Research Questions',
      execute: async ({ workspaceId }) => {
        const values = (await dependencies.questions.listQuestions(workspaceId)).slice(0, 20);
        return {
          content: JSON.stringify(
            values.map(({ id, title, description, status, priority, archivedAt }) => ({
              id,
              title,
              description: description.slice(0, 1000),
              status,
              priority,
              archived: Boolean(archivedAt),
            })),
          ),
          summary: `${String(values.length)} Research Questions inspected`,
          citations: [],
        };
      },
    },
    {
      name: 'list_notes_memory',
      inputSchema: z.null(),
      inputSummary: () => 'bounded current Workspace Notes and confirmed Memory',
      execute: async ({ workspaceId }) => {
        const summaries = (
          await dependencies.memory.listResearchContent({ workspaceId, types: ['note', 'memory'] })
        ).slice(0, 10);
        const values = [];
        for (const summary of summaries.slice(0, 5)) {
          const item = await dependencies.memory.getResearchContent({
            workspaceId,
            type: summary.type,
            id: summary.id,
          });
          if (item)
            values.push({
              type: item.type,
              title: item.title,
              status: item.status,
              body: item.bodyMarkdown.slice(0, 1200),
              references: item.references.length,
            });
        }
        return {
          content: JSON.stringify(values),
          summary: `${String(values.length)} Note/Memory records read`,
          citations: [],
        };
      },
    },
    {
      name: 'inspect_plan',
      inputSchema: z.null(),
      inputSummary: () => 'active Workspace Plan and bounded task state',
      execute: async ({ workspaceId }) => {
        const plan = await dependencies.plan.getActiveResearchPlan(workspaceId);
        return {
          content: JSON.stringify(
            plan
              ? {
                  goal: plan.goal,
                  progress: plan.progress,
                  tasks: plan.tasks.slice(0, 30).map(({ title, status, blockedReason }) => ({
                    title,
                    status,
                    blockedReason,
                  })),
                }
              : null,
          ),
          summary: plan
            ? `${String(plan.tasks.length)} Plan tasks; ${String(plan.progress.percent)}% complete`
            : 'No active Plan',
          citations: [],
        };
      },
    },
    {
      name: 'list_links',
      inputSchema: z.null(),
      inputSummary: () => 'bounded confirmed Paper-Code Links',
      execute: async ({ workspaceId }) => {
        const links = (await dependencies.links.listPaperCodeLinks(workspaceId)).slice(0, 20);
        return {
          content: JSON.stringify(
            links.map(
              ({ id, label, relationType, locationLabel, relativePath, startLine, endLine }) => ({
                id,
                label,
                relationType,
                paperLocation: locationLabel,
                codeLocation: `${relativePath}:${String(startLine)}-${String(endLine)}`,
              }),
            ),
          ),
          summary: `${String(links.length)} confirmed Paper-Code Links inspected`,
          citations: [],
        };
      },
    },
  ]);
}

function defineSearchTool(
  knowledge: KnowledgeEngineService,
  forcedSourceTypes?: readonly ('code' | 'link' | 'paper' | 'question')[],
): Omit<DomainToolDefinition, 'name'> {
  return {
    inputSchema: boundedQuery,
    inputSummary: (input) => `bounded query: ${boundedQuery.parse(input).slice(0, 120)}`,
    execute: async (context, input) => {
      const query = boundedQuery.parse(input);
      const page = await knowledge.search({
        workspaceId: context.workspaceId,
        query,
        sourceTypes: forcedSourceTypes ?? ['paper', 'code', 'question', 'link'],
        offset: 0,
        limit: 12,
      });
      const reserved = new Map(context.discoveredChunks);
      const citations = page.results.map((result) => {
        const existing = reserved.get(result.chunkId);
        if (existing) return existing;
        const citation = {
          alias: nextCitationAlias(reserved),
          chunkId: result.chunkId,
          sourceType: result.sourceType,
          title: result.title,
          snippet: result.snippet.slice(0, 1200),
          citation: result.citation,
          stale: result.stale,
          unavailableReason: result.unavailableReason,
          provenance: result.provenance,
        };
        reserved.set(result.chunkId, citation);
        return citation;
      });
      for (const citation of citations) context.discoveredChunks.set(citation.chunkId, citation);
      return {
        content: JSON.stringify(
          citations.map(({ alias, sourceType, title, citation, stale }) => ({
            alias,
            sourceType,
            title,
            citation,
            stale,
          })),
        ),
        summary: `${String(citations.length)} bounded ${forcedSourceTypes?.[0] ?? 'mixed'} results`,
        citations,
      };
    },
  };
}

function nextCitationAlias(discovered: ReadonlyMap<string, ResearchAgentCitation>): string {
  const used = new Set([...discovered.values()].map(({ alias }) => alias));
  let ordinal = 1;
  while (used.has(`S${String(ordinal)}`)) ordinal += 1;
  return `S${String(ordinal)}`;
}

function summarizeChunk(input: unknown): string {
  const { chunkId } = chunkInput.parse(input);
  return `previously discovered chunk ${chunkId.slice(0, 8)}`;
}

async function readDiscoveredChunk(
  knowledge: KnowledgeEngineService,
  context: AgentToolContext,
  input: unknown,
  expectedType: 'code' | 'paper',
): Promise<AgentToolResult> {
  const { chunkId } = chunkInput.parse(input);
  const citation = context.discoveredChunks.get(chunkId);
  if (citation?.sourceType !== expectedType)
    throw new LibraryError(
      'INVALID_INPUT',
      'The Agent may read only an in-scope result discovered during this run.',
    );
  const chunk = await knowledge.getChunk(context.workspaceId, chunkId);
  if (!chunk) throw new LibraryError('NOT_FOUND', 'The indexed source is unavailable.');
  return {
    content: chunk.content.slice(0, 2400),
    summary: `${expectedType} source read: ${citation.citation}`,
    citations: [citation],
  };
}
