import { createHash, randomUUID } from 'node:crypto';

import type {
  AddPlanReferenceInput,
  GenerateResearchPlanProposalInput,
  PlanReference,
  PlanReferenceCandidate,
  PlanReferenceTarget,
  ResearchPlan,
  ReviewResearchPlanProposalInput,
  UpdateResearchPlanProposalInput,
} from '../../shared/contracts/research-plan';
import type { ZoteroItemDetails, ZoteroItemRef } from '../../shared/contracts/zotero';
import type { QuestionDataGateway } from '../question/question-data-gateway';
import type { RepositoryDataGateway } from '../repository/repository-data-gateway';
import type { ResearchMemoryDataGateway } from '../research-memory/research-memory-data-gateway';
import type { WorkspaceDataGateway } from '../workspace/workspace-data-gateway';
import type { ZoteroBridgeService } from '../zotero/zotero-bridge-service';
import { LibraryError } from '../library/errors';
import type { PlanProposalGenerator } from './plan-proposal-generator';
import type { ResearchPlanDataGateway } from './research-plan-data-gateway';

export class ResearchPlanService {
  public constructor(
    private readonly data: ResearchPlanDataGateway,
    private readonly workspaces: WorkspaceDataGateway,
    private readonly questions: QuestionDataGateway,
    private readonly repositories: RepositoryDataGateway,
    private readonly memory: ResearchMemoryDataGateway,
    private readonly zotero: ZoteroBridgeService,
    private readonly generator: PlanProposalGenerator,
  ) {}

  public async getActive(workspaceId: string) {
    await this.requireWorkspace(workspaceId);
    const plan = await this.data.getActiveResearchPlan(workspaceId);
    return plan ? this.hydratePlan(plan) : null;
  }

  public async create(input: Parameters<ResearchPlanDataGateway['createResearchPlan']>[0]) {
    await this.requireWorkspace(input.workspaceId);
    return this.data.createResearchPlan(input);
  }
  public async update(input: Parameters<ResearchPlanDataGateway['updateResearchPlan']>[0]) {
    return this.data.updateResearchPlan(input);
  }
  public async retire(input: Parameters<ResearchPlanDataGateway['retireResearchPlan']>[0]) {
    return this.data.retireResearchPlan(input);
  }
  public async delete(workspaceId: string, planId: string) {
    if (!(await this.data.deleteResearchPlan(workspaceId, planId)))
      throw new LibraryError('NOT_FOUND', 'The Research Plan was not found.');
    return { id: planId };
  }
  public async createTask(input: Parameters<ResearchPlanDataGateway['createPlanTask']>[0]) {
    return this.data.createPlanTask(input);
  }
  public async updateTask(input: Parameters<ResearchPlanDataGateway['updatePlanTask']>[0]) {
    return this.data.updatePlanTask(input);
  }
  public async deleteTask(input: Parameters<ResearchPlanDataGateway['deletePlanTask']>[0]) {
    return this.data.deletePlanTask(input);
  }
  public async reorderTasks(input: Parameters<ResearchPlanDataGateway['reorderPlanTasks']>[0]) {
    return this.data.reorderPlanTasks(input);
  }
  public async setTaskStatus(input: Parameters<ResearchPlanDataGateway['setPlanTaskStatus']>[0]) {
    return this.data.setPlanTaskStatus(input);
  }
  public async completeTask(input: Parameters<ResearchPlanDataGateway['completePlanTask']>[0]) {
    return this.data.completePlanTask(input);
  }
  public async setDependencies(
    input: Parameters<ResearchPlanDataGateway['setPlanDependencies']>[0],
  ) {
    return this.data.setPlanDependencies(input);
  }

  public async listReferenceCandidates(
    workspaceId: string,
  ): Promise<readonly PlanReferenceCandidate[]> {
    await this.requireWorkspace(workspaceId);
    const [papers, repositories, questions, memories] = await Promise.all([
      this.workspaces.listWorkspaceZoteroPapers(workspaceId),
      this.repositories.listWorkspaceRepositories(workspaceId),
      this.questions.listQuestions(workspaceId),
      this.memory.listResearchContent({ workspaceId, types: ['memory'], statuses: ['confirmed'] }),
    ]);
    const paperCandidates = await Promise.all(
      papers.map(async ({ itemRef }) => this.paperCandidate(itemRef)),
    );
    return [
      ...paperCandidates,
      ...repositories.map((repository) => ({
        id: candidateId({ type: 'repository', repositoryId: repository.id }),
        type: 'repository' as const,
        title: repository.displayName,
        citation: `${repository.displayName}${repository.currentBranch ? ` @ ${repository.currentBranch}` : ''}`,
        target: { type: 'repository' as const, repositoryId: repository.id },
        snapshotIdentity: repository.headCommit,
        availability:
          repository.availability === 'available'
            ? ('available' as const)
            : ('unavailable' as const),
        availabilityReason:
          repository.availability === 'available'
            ? null
            : `Repository is ${repository.availability}.`,
      })),
      ...questions
        .filter(({ archivedAt }) => !archivedAt)
        .map((question) => ({
          id: candidateId({ type: 'question', questionId: question.id }),
          type: 'question' as const,
          title: question.title,
          citation: `Research Question: ${question.title}`,
          target: { type: 'question' as const, questionId: question.id },
          snapshotIdentity: `question:${question.id}:v${String(question.rowVersion)}`,
          availability: 'available' as const,
          availabilityReason: null,
        })),
      ...memories.map((entry) => ({
        id: candidateId({ type: 'memory', memoryId: entry.id }),
        type: 'memory' as const,
        title: entry.title,
        citation: `Confirmed Memory: ${entry.title}`,
        target: { type: 'memory' as const, memoryId: entry.id },
        snapshotIdentity: `memory:${entry.id}:${entry.updatedAt}`,
        availability: 'available' as const,
        availabilityReason: null,
      })),
    ];
  }

  public async addReference(input: AddPlanReferenceInput) {
    const candidate = await this.requireCandidate(input.workspaceId, input.target);
    if (candidate.availability === 'unavailable')
      throw new LibraryError(
        'CONFLICT',
        'Unavailable external data cannot be added as a new Plan source.',
      );
    return this.data.addPlanReference({
      ...input,
      id: randomUUID(),
      sourceKey: sourceKey(input.target),
      title: candidate.title,
      citation: candidate.citation,
      target: input.target,
      snapshotIdentity: candidate.snapshotIdentity,
      createdAt: new Date().toISOString(),
    });
  }

  public async removeReference(
    input: Parameters<ResearchPlanDataGateway['removePlanReference']>[0],
  ) {
    return this.data.removePlanReference(input);
  }

  public listHistory(workspaceId: string, planId: string) {
    return this.data.listResearchPlanHistory(workspaceId, planId);
  }

  public async generateProposal(input: GenerateResearchPlanProposalInput) {
    const workspace = await this.requireWorkspace(input.workspaceId);
    const currentPlan = await this.data.getActiveResearchPlan(input.workspaceId);
    if (input.mode === 'generate' && currentPlan)
      throw new LibraryError('CONFLICT', 'Generate is only available when no active Plan exists.');
    if (input.mode === 'adapt' && !currentPlan)
      throw new LibraryError('CONFLICT', 'Create or generate a Plan before adapting it.');
    const candidates = await this.listReferenceCandidates(input.workspaceId);
    const generated = await this.generator.generate({
      workspace,
      currentPlan,
      candidates,
      ...input,
    });
    return this.data.createResearchPlanProposal({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      planId: currentPlan?.id ?? null,
      baseVersion: currentPlan?.version ?? null,
      mode: input.mode,
      goal: generated.goal,
      rationale: generated.rationale,
      changesJson: JSON.stringify(
        generated.changes.map((change) => ({ ...change, id: randomUUID() })),
      ),
      providerId: generated.providerId,
      model: generated.model,
      createdAt: new Date().toISOString(),
    });
  }

  public updateProposal(input: UpdateResearchPlanProposalInput) {
    return this.data.updateResearchPlanProposal({
      ...input,
      changesJson: JSON.stringify(input.changes),
    });
  }
  public async confirmProposal(input: ReviewResearchPlanProposalInput) {
    const proposal = await this.data.getResearchPlanProposal(input.workspaceId, input.proposalId);
    if (!proposal) throw new LibraryError('NOT_FOUND', 'The Plan proposal was not found.');
    const candidates = await this.listReferenceCandidates(input.workspaceId);
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    for (const change of proposal.changes) {
      for (const id of change.referenceCandidateIds) {
        const candidate = byId.get(id);
        if (!candidate || candidate.availability === 'unavailable')
          throw new LibraryError(
            'CONFLICT',
            'A proposed source is no longer available. Review the proposal again.',
          );
      }
    }
    let plan = await this.data.confirmResearchPlanProposal(input);
    for (const change of proposal.changes) {
      if (change.kind === 'conflict' || change.kind === 'keep') continue;
      const task = change.taskId
        ? plan.tasks.find(({ id }) => id === change.taskId)
        : [...plan.tasks]
            .reverse()
            .find(
              ({ title, description }) =>
                title === change.title && description === change.description,
            );
      if (!task) continue;
      for (const candidateId of change.referenceCandidateIds) {
        const candidate = byId.get(candidateId);
        if (
          !candidate ||
          task.references.some(({ target }) => sourceKey(target) === sourceKey(candidate.target))
        )
          continue;
        plan = await this.data.addPlanReference({
          workspaceId: input.workspaceId,
          planId: plan.id,
          taskId: task.id,
          id: randomUUID(),
          sourceKey: sourceKey(candidate.target),
          title: candidate.title,
          citation: candidate.citation,
          target: candidate.target,
          snapshotIdentity: candidate.snapshotIdentity,
          createdAt: new Date().toISOString(),
        });
      }
    }
    return plan;
  }
  public rejectProposal(input: ReviewResearchPlanProposalInput) {
    return this.data.rejectResearchPlanProposal(input);
  }

  private async hydratePlan(plan: ResearchPlan): Promise<ResearchPlan> {
    if (!plan.tasks.some(({ references }) => references.length > 0)) return plan;
    const candidates = new Map(
      (await this.listReferenceCandidates(plan.workspaceId)).map((candidate) => [
        sourceKey(candidate.target),
        candidate,
      ]),
    );
    const tasks = plan.tasks.map((task) => ({
      ...task,
      references: task.references.map((reference) => this.hydrateReference(reference, candidates)),
    }));
    return { ...plan, tasks };
  }

  private hydrateReference(
    reference: PlanReference,
    candidates: ReadonlyMap<string, PlanReferenceCandidate>,
  ): PlanReference {
    const current = candidates.get(sourceKey(reference.target));
    if (!current) {
      return {
        ...reference,
        availability: 'unavailable',
        availabilityReason: 'The external source is no longer available in this Workspace.',
      };
    }
    const stale =
      reference.snapshotIdentity !== null &&
      current.snapshotIdentity !== reference.snapshotIdentity;
    return {
      ...reference,
      availability:
        current.availability === 'unavailable'
          ? 'unavailable'
          : stale
            ? 'stale'
            : current.availability,
      availabilityReason:
        current.availabilityReason ??
        (stale ? 'The external source changed after this Plan reference was recorded.' : null),
    };
  }

  private async requireCandidate(
    workspaceId: string,
    target: PlanReferenceTarget,
  ): Promise<PlanReferenceCandidate> {
    const candidate = (await this.listReferenceCandidates(workspaceId)).find(
      ({ target: current }) => sourceKey(current) === sourceKey(target),
    );
    if (!candidate)
      throw new LibraryError('NOT_FOUND', 'The Plan source does not belong to this Workspace.');
    return candidate;
  }

  private async paperCandidate(itemRef: ZoteroItemRef): Promise<PlanReferenceCandidate> {
    try {
      const item = await this.zotero.getItem(itemRef);
      return paperCandidateFromItem(itemRef, item);
    } catch {
      return {
        id: candidateId({ type: 'paper', itemRef }),
        type: 'paper',
        title: `Zotero item ${itemRef.itemKey}`,
        citation: `Zotero item ${itemRef.itemKey}`,
        target: { type: 'paper', itemRef },
        snapshotIdentity: null,
        availability: 'unavailable',
        availabilityReason: 'Zotero is unavailable or this item no longer exists.',
      };
    }
  }

  private async requireWorkspace(workspaceId: string) {
    const workspace = await this.workspaces.getWorkspace(workspaceId);
    if (!workspace) throw new LibraryError('NOT_FOUND', 'The Workspace was not found.');
    return workspace;
  }
}

function paperCandidateFromItem(
  itemRef: ZoteroItemRef,
  item: ZoteroItemDetails,
): PlanReferenceCandidate {
  return {
    id: candidateId({ type: 'paper', itemRef }),
    type: 'paper',
    title: item.title || `Zotero item ${itemRef.itemKey}`,
    citation: `${item.title || `Zotero item ${itemRef.itemKey}`}${item.year ? ` (${String(item.year)})` : ''}`,
    target: { type: 'paper', itemRef },
    snapshotIdentity: `zotero:${itemRef.serverId}:${itemRef.library.type}:${itemRef.library.id}:${itemRef.itemKey}:v${String(item.version)}`,
    availability: 'available',
    availabilityReason: null,
  };
}

function candidateId(target: PlanReferenceTarget): string {
  return `${target.type}:${createHash('sha256').update(sourceKey(target)).digest('hex').slice(0, 20)}`;
}

function sourceKey(target: PlanReferenceTarget): string {
  if (target.type === 'paper') return JSON.stringify(target.itemRef);
  if (target.type === 'repository') return target.repositoryId;
  if (target.type === 'question') return target.questionId;
  return target.memoryId;
}
