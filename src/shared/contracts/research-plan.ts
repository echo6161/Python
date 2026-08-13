import type { ApiResult } from './library';
import type { ZoteroItemRef } from './zotero';

export const RESEARCH_PLAN_IPC_CHANNELS = Object.freeze({
  getActive: 'research-plan:get-active',
  create: 'research-plan:create',
  update: 'research-plan:update',
  retire: 'research-plan:retire',
  delete: 'research-plan:delete',
  createTask: 'research-plan:create-task',
  updateTask: 'research-plan:update-task',
  deleteTask: 'research-plan:delete-task',
  reorderTasks: 'research-plan:reorder-tasks',
  setTaskStatus: 'research-plan:set-task-status',
  completeTask: 'research-plan:complete-task',
  setDependencies: 'research-plan:set-dependencies',
  listReferenceCandidates: 'research-plan:list-reference-candidates',
  addReference: 'research-plan:add-reference',
  removeReference: 'research-plan:remove-reference',
  listHistory: 'research-plan:list-history',
  generateProposal: 'research-plan:generate-proposal',
  updateProposal: 'research-plan:update-proposal',
  confirmProposal: 'research-plan:confirm-proposal',
  rejectProposal: 'research-plan:reject-proposal',
});

export type ResearchPlanIpcChannels = typeof RESEARCH_PLAN_IPC_CHANNELS;
export type ResearchPlanStatus = 'active' | 'retired';
export type PlanTaskStatus = 'blocked' | 'done' | 'in_progress' | 'retired' | 'todo';
export type PlanReferenceType = 'memory' | 'paper' | 'question' | 'repository';
export type PlanReferenceAvailability = 'available' | 'stale' | 'unavailable';
export type PlanProposalMode = 'adapt' | 'generate';
export type PlanProposalStatus = 'confirmed' | 'pending' | 'rejected';
export type PlanProposalChangeKind = 'add' | 'conflict' | 'keep' | 'update';

export type PlanReferenceTarget =
  | { readonly type: 'paper'; readonly itemRef: ZoteroItemRef }
  | { readonly type: 'repository'; readonly repositoryId: string }
  | { readonly type: 'question'; readonly questionId: string }
  | { readonly type: 'memory'; readonly memoryId: string };

export interface PlanReferenceCandidate {
  readonly id: string;
  readonly type: PlanReferenceType;
  readonly title: string;
  readonly citation: string;
  readonly target: PlanReferenceTarget;
  readonly snapshotIdentity: string | null;
  readonly availability: PlanReferenceAvailability;
  readonly availabilityReason: string | null;
}

export interface PlanReference extends PlanReferenceCandidate {
  readonly taskId: string;
  readonly workspaceId: string;
  readonly displayOrder: number;
  readonly createdAt: string;
}

export interface PlanCompletionEvidence {
  readonly id: string;
  readonly taskId: string;
  readonly workspaceId: string;
  readonly sourceType: PlanReferenceType;
  readonly title: string;
  readonly citation: string;
  readonly target: PlanReferenceTarget;
  readonly snapshotIdentity: string | null;
  readonly note: string;
  readonly createdAt: string;
}

export interface PlanTask {
  readonly id: string;
  readonly planId: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly description: string;
  readonly status: PlanTaskStatus;
  readonly blockedReason: string | null;
  readonly displayOrder: number;
  readonly dependencyIds: readonly string[];
  readonly references: readonly PlanReference[];
  readonly completionEvidence: readonly PlanCompletionEvidence[];
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
}

export interface PlanProgress {
  readonly completed: number;
  readonly eligible: number;
  readonly percent: number;
  readonly blocked: number;
  readonly nextTaskId: string | null;
  readonly explanation: string;
}

export interface ResearchPlan {
  readonly id: string;
  readonly workspaceId: string;
  readonly goal: string;
  readonly status: ResearchPlanStatus;
  readonly version: number;
  readonly tasks: readonly PlanTask[];
  readonly progress: PlanProgress;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
}

export interface ResearchPlanHistoryEntry {
  readonly id: string;
  readonly planId: string;
  readonly workspaceId: string;
  readonly version: number;
  readonly actor: 'ai-confirmed' | 'user';
  readonly changeKind: string;
  readonly summary: string;
  readonly snapshot: ResearchPlan;
  readonly createdAt: string;
}

export interface PlanProposalChange {
  readonly id: string;
  readonly kind: PlanProposalChangeKind;
  readonly taskId: string | null;
  readonly title: string;
  readonly description: string;
  readonly rationale: string;
  readonly dependencyTaskIds: readonly string[];
  readonly referenceCandidateIds: readonly string[];
}

export interface ResearchPlanProposal {
  readonly id: string;
  readonly workspaceId: string;
  readonly planId: string | null;
  readonly baseVersion: number | null;
  readonly mode: PlanProposalMode;
  readonly goal: string;
  readonly rationale: string;
  readonly changes: readonly PlanProposalChange[];
  readonly providerId: 'codex' | 'openai';
  readonly model: string;
  readonly status: PlanProposalStatus;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
  readonly rowVersion: number;
}

export interface CreateResearchPlanInput {
  readonly workspaceId: string;
  readonly goal: string;
}

export interface UpdateResearchPlanInput {
  readonly workspaceId: string;
  readonly planId: string;
  readonly goal: string;
  readonly rowVersion: number;
}

export interface CreatePlanTaskInput {
  readonly workspaceId: string;
  readonly planId: string;
  readonly title: string;
  readonly description: string;
}

export interface UpdatePlanTaskInput extends CreatePlanTaskInput {
  readonly taskId: string;
  readonly rowVersion: number;
}

export interface SetPlanTaskStatusInput {
  readonly workspaceId: string;
  readonly planId: string;
  readonly taskId: string;
  readonly status: Exclude<PlanTaskStatus, 'done'>;
  readonly blockedReason?: string;
  readonly rowVersion: number;
}

export interface CompletePlanTaskInput {
  readonly workspaceId: string;
  readonly planId: string;
  readonly taskId: string;
  readonly completionNote: string;
  readonly evidenceReferenceIds: readonly string[];
  readonly rowVersion: number;
}

export interface PlanTaskIdentityInput {
  readonly workspaceId: string;
  readonly planId: string;
  readonly taskId: string;
}

export interface SetPlanDependenciesInput extends PlanTaskIdentityInput {
  readonly dependencyIds: readonly string[];
}

export interface ReorderPlanTasksInput {
  readonly workspaceId: string;
  readonly planId: string;
  readonly taskIds: readonly string[];
}

export interface AddPlanReferenceInput extends PlanTaskIdentityInput {
  readonly target: PlanReferenceTarget;
}

export interface RemovePlanReferenceInput extends PlanTaskIdentityInput {
  readonly referenceId: string;
}

export interface GenerateResearchPlanProposalInput {
  readonly workspaceId: string;
  readonly mode: PlanProposalMode;
  readonly instruction: string;
}

export interface UpdateResearchPlanProposalInput {
  readonly workspaceId: string;
  readonly proposalId: string;
  readonly goal: string;
  readonly rationale: string;
  readonly changes: readonly PlanProposalChange[];
  readonly rowVersion: number;
}

export interface ReviewResearchPlanProposalInput {
  readonly workspaceId: string;
  readonly proposalId: string;
  readonly rowVersion: number;
}

export interface ResearchPlanApi {
  getActive(workspaceId: string): Promise<ApiResult<ResearchPlan | null>>;
  create(input: CreateResearchPlanInput): Promise<ApiResult<ResearchPlan>>;
  update(input: UpdateResearchPlanInput): Promise<ApiResult<ResearchPlan>>;
  retire(input: {
    readonly workspaceId: string;
    readonly planId: string;
    readonly rowVersion: number;
  }): Promise<ApiResult<ResearchPlan>>;
  delete(input: {
    readonly workspaceId: string;
    readonly planId: string;
    readonly confirmation: 'DELETE_RESEARCH_PLAN';
  }): Promise<ApiResult<{ readonly id: string }>>;
  createTask(input: CreatePlanTaskInput): Promise<ApiResult<ResearchPlan>>;
  updateTask(input: UpdatePlanTaskInput): Promise<ApiResult<ResearchPlan>>;
  deleteTask(
    input: PlanTaskIdentityInput & { readonly confirmation: 'DELETE_PLAN_TASK' },
  ): Promise<ApiResult<ResearchPlan>>;
  reorderTasks(input: ReorderPlanTasksInput): Promise<ApiResult<ResearchPlan>>;
  setTaskStatus(input: SetPlanTaskStatusInput): Promise<ApiResult<ResearchPlan>>;
  completeTask(input: CompletePlanTaskInput): Promise<ApiResult<ResearchPlan>>;
  setDependencies(input: SetPlanDependenciesInput): Promise<ApiResult<ResearchPlan>>;
  listReferenceCandidates(
    workspaceId: string,
  ): Promise<ApiResult<readonly PlanReferenceCandidate[]>>;
  addReference(input: AddPlanReferenceInput): Promise<ApiResult<ResearchPlan>>;
  removeReference(input: RemovePlanReferenceInput): Promise<ApiResult<ResearchPlan>>;
  listHistory(input: {
    readonly workspaceId: string;
    readonly planId: string;
  }): Promise<ApiResult<readonly ResearchPlanHistoryEntry[]>>;
  generateProposal(
    input: GenerateResearchPlanProposalInput,
  ): Promise<ApiResult<ResearchPlanProposal>>;
  updateProposal(input: UpdateResearchPlanProposalInput): Promise<ApiResult<ResearchPlanProposal>>;
  confirmProposal(input: ReviewResearchPlanProposalInput): Promise<ApiResult<ResearchPlan>>;
  rejectProposal(input: ReviewResearchPlanProposalInput): Promise<ApiResult<ResearchPlanProposal>>;
}
