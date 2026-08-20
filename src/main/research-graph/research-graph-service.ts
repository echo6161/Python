import type {
  ResearchGraphEdge,
  ResearchGraphNode,
  ResearchGraphProjection,
} from '../../shared/contracts/research-graph';
import type { WorkspaceDataGateway } from '../workspace/workspace-data-gateway';
import type { QuestionDataGateway } from '../question/question-data-gateway';
import type { RepositoryDataGateway } from '../repository/repository-data-gateway';
import type { PaperCodeLinkDataGateway } from '../paper-code-link/paper-code-link-data-gateway';
import type { ResearchMemoryDataGateway } from '../research-memory/research-memory-data-gateway';
import type { ResearchPlanDataGateway } from '../research-plan/research-plan-data-gateway';
import type { ExperimentService } from '../experiment/experiment-service';
import { LibraryError } from '../library/errors';
export class ResearchGraphService {
  constructor(
    private readonly workspace: WorkspaceDataGateway,
    private readonly questions: QuestionDataGateway,
    private readonly repositories: RepositoryDataGateway,
    private readonly links: PaperCodeLinkDataGateway,
    private readonly memory: ResearchMemoryDataGateway,
    private readonly plans: ResearchPlanDataGateway,
    private readonly experiments: Pick<ExperimentService, 'list'>,
  ) {}
  async getProjection(workspaceId: string): Promise<ResearchGraphProjection> {
    const ws = await this.workspace.getWorkspace(workspaceId);
    if (!ws) throw new LibraryError('NOT_FOUND', 'The Workspace does not exist.');
    const [q, repos, papers, links, memory, plan, experiments] = await Promise.all([
      this.questions.listQuestions(workspaceId),
      this.repositories.listWorkspaceRepositories(workspaceId),
      this.workspace.listWorkspaceZoteroPapers(workspaceId),
      this.links.listPaperCodeLinks(workspaceId),
      this.memory.listResearchContent({ workspaceId, types: ['memory'], statuses: ['confirmed'] }),
      this.plans.getActiveResearchPlan(workspaceId),
      this.experiments.list(workspaceId),
    ]);
    const nodes: ResearchGraphNode[] = [
      node(
        `workspace:${workspaceId}`,
        'workspace',
        ws.name,
        ws.status,
        ws.researchGoal,
        workspaceId,
      ),
    ];
    const edges: ResearchGraphEdge[] = [];
    const add = (
      n: ResearchGraphNode,
      parent = `workspace:${workspaceId}`,
      relation = 'contains',
    ) => {
      nodes.push(n);
      edges.push(edge(parent, n.id, relation));
    };
    for (const x of q)
      add(node(`question:${x.id}`, 'question', x.title, x.status, x.description, x.id));
    for (const x of repos)
      add(
        node(
          `repository:${x.id}`,
          'repository',
          x.displayName,
          x.availability,
          x.headCommit ?? 'No snapshot',
          x.id,
          x.availability === 'available' ? 'available' : 'unavailable',
        ),
      );
    for (const x of papers) {
      const key = paperKey(
        x.itemRef.serverId,
        x.itemRef.library.type,
        x.itemRef.library.id,
        x.itemRef.itemKey,
      );
      add(
        node(
          key,
          'paper',
          x.itemRef.itemKey,
          'Zotero reference',
          'Bibliographic metadata resolves through Zotero.',
          key,
        ),
      );
    }
    for (const x of memory)
      add(
        node(
          `memory:${x.id}`,
          'memory',
          x.title,
          x.status,
          `${String(x.referenceCount)} sources`,
          x.id,
        ),
      );
    if (plan)
      for (const x of plan.tasks)
        add(node(`plan_task:${x.id}`, 'plan_task', x.title, x.status, x.description, x.id));
    for (const x of experiments) {
      const eid = `experiment:${x.id}`;
      add(
        node(
          eid,
          'experiment',
          x.title,
          x.status,
          x.configSummary,
          x.id,
          x.availability.repository,
        ),
      );
      const hid = `hypothesis:${x.id}`;
      add(node(hid, 'hypothesis', x.hypothesis, 'hypothesis', x.hypothesis, x.id), eid, 'tests');
      if (x.questionId) edges.push(edge(`question:${x.questionId}`, hid, 'motivates'));
      if (x.repositoryId) edges.push(edge(`repository:${x.repositoryId}`, eid, 'pins snapshot'));
      for (const run of x.runs) {
        const rid = `run:${run.id}`;
        add(
          node(rid, 'run', run.label, run.status, `${run.toolName} · ${run.externalRunId}`, run.id),
          eid,
          'has run',
        );
        if (run.result) {
          const result = `result:${run.result.id}`;
          add(
            node(
              result,
              'result',
              run.result.summary,
              run.result.outcome,
              run.result.metrics.map((m) => `${m.name}=${String(m.value)}`).join(', '),
              run.result.id,
            ),
            rid,
            'produces',
          );
        }
      }
      for (const c of x.conclusions) {
        const cid = `conclusion:${c.id}`;
        add(node(cid, 'conclusion', c.statement, c.status, c.provenance, c.id), eid, 'concludes');
        if (c.resultId) edges.push(edge(`result:${c.resultId}`, cid, 'supports'));
      }
    }
    for (const x of links) {
      const lid = `link:${x.id}`;
      add(node(lid, 'link', x.label, x.relationType, x.description, x.id));
      const pk = paperKey(
        x.itemRef.serverId,
        x.itemRef.library.type,
        x.itemRef.library.id,
        x.itemRef.itemKey,
      );
      if (nodes.some((n) => n.id === pk)) edges.push(edge(pk, lid, 'paper side'));
      if (nodes.some((n) => n.id === `repository:${x.repositoryId}`))
        edges.push(edge(lid, `repository:${x.repositoryId}`, 'code side'));
    }
    return {
      workspaceId,
      version: 'research-graph-v1',
      nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
      edges: edges.sort((a, b) => a.id.localeCompare(b.id)),
    };
  }
}
function node(
  id: string,
  kind: ResearchGraphNode['kind'],
  label: string,
  subtitle: string,
  detail: string,
  relatedId: string | null,
  status: ResearchGraphNode['status'] = 'available',
): ResearchGraphNode {
  return {
    id,
    kind,
    label: label.slice(0, 300),
    subtitle: subtitle.slice(0, 300),
    status,
    relatedId,
    detail: detail.slice(0, 2000),
  };
}
function edge(source: string, target: string, relation: string): ResearchGraphEdge {
  return { id: `${source}->${relation}->${target}`, source, target, relation };
}
function paperKey(s: string, t: string, l: string, k: string) {
  return `paper:${s}:${t}:${l}:${k}`;
}
