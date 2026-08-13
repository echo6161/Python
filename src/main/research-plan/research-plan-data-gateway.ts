import type {
  CreatePlanTaskInput,
  CreateResearchPlanInput,
  PlanReference,
  PlanReferenceTarget,
  PlanTaskIdentityInput,
  ResearchPlan,
  ResearchPlanHistoryEntry,
  ResearchPlanProposal,
  SetPlanDependenciesInput,
  UpdatePlanTaskInput,
  UpdateResearchPlanInput,
} from '../../shared/contracts/research-plan';

export interface StoredPlanReferenceInput extends PlanTaskIdentityInput {
  readonly id: string;
  readonly sourceKey: string;
  readonly title: string;
  readonly citation: string;
  readonly target: PlanReferenceTarget;
  readonly snapshotIdentity: string | null;
  readonly createdAt: string;
}

export interface StoredPlanProposalInput {
  readonly id: string;
  readonly workspaceId: string;
  readonly planId: string | null;
  readonly baseVersion: number | null;
  readonly mode: 'adapt' | 'generate';
  readonly goal: string;
  readonly rationale: string;
  readonly changesJson: string;
  readonly providerId: 'codex' | 'openai';
  readonly model: string;
  readonly createdAt: string;
}

export interface ResearchPlanDataGateway {
  getActiveResearchPlan(workspaceId: string): Promise<ResearchPlan | null>;
  getResearchPlan(workspaceId: string, planId: string): Promise<ResearchPlan | null>;
  createResearchPlan(input: CreateResearchPlanInput): Promise<ResearchPlan>;
  updateResearchPlan(input: UpdateResearchPlanInput): Promise<ResearchPlan>;
  retireResearchPlan(input: {
    readonly workspaceId: string;
    readonly planId: string;
    readonly rowVersion: number;
  }): Promise<ResearchPlan>;
  deleteResearchPlan(workspaceId: string, planId: string): Promise<boolean>;
  createPlanTask(input: CreatePlanTaskInput): Promise<ResearchPlan>;
  updatePlanTask(input: UpdatePlanTaskInput): Promise<ResearchPlan>;
  deletePlanTask(input: PlanTaskIdentityInput): Promise<ResearchPlan>;
  reorderPlanTasks(input: {
    readonly workspaceId: string;
    readonly planId: string;
    readonly taskIds: readonly string[];
  }): Promise<ResearchPlan>;
  setPlanTaskStatus(
    input: PlanTaskIdentityInput & {
      readonly status: string;
      readonly blockedReason: string | null;
      readonly rowVersion: number;
    },
  ): Promise<ResearchPlan>;
  completePlanTask(
    input: PlanTaskIdentityInput & {
      readonly completionNote: string;
      readonly evidenceReferenceIds: readonly string[];
      readonly rowVersion: number;
    },
  ): Promise<ResearchPlan>;
  setPlanDependencies(input: SetPlanDependenciesInput): Promise<ResearchPlan>;
  addPlanReference(input: StoredPlanReferenceInput): Promise<ResearchPlan>;
  removePlanReference(
    input: PlanTaskIdentityInput & { readonly referenceId: string },
  ): Promise<ResearchPlan>;
  listResearchPlanHistory(
    workspaceId: string,
    planId: string,
  ): Promise<readonly ResearchPlanHistoryEntry[]>;
  createResearchPlanProposal(input: StoredPlanProposalInput): Promise<ResearchPlanProposal>;
  getResearchPlanProposal(
    workspaceId: string,
    proposalId: string,
  ): Promise<ResearchPlanProposal | null>;
  updateResearchPlanProposal(input: {
    readonly workspaceId: string;
    readonly proposalId: string;
    readonly goal: string;
    readonly rationale: string;
    readonly changesJson: string;
    readonly rowVersion: number;
  }): Promise<ResearchPlanProposal>;
  confirmResearchPlanProposal(input: {
    readonly workspaceId: string;
    readonly proposalId: string;
    readonly rowVersion: number;
  }): Promise<ResearchPlan>;
  rejectResearchPlanProposal(input: {
    readonly workspaceId: string;
    readonly proposalId: string;
    readonly rowVersion: number;
  }): Promise<ResearchPlanProposal>;
  listPlanReferences(workspaceId: string, planId: string): Promise<readonly PlanReference[]>;
}
