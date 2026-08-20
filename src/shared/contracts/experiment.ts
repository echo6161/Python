import type { ApiResult } from './library';

export const EXPERIMENT_IPC_CHANNELS = Object.freeze({
  list: 'experiments:list',
  get: 'experiments:get',
  create: 'experiments:create',
  update: 'experiments:update',
  setStatus: 'experiments:set-status',
  delete: 'experiments:delete',
  addRun: 'experiments:add-run',
  updateRun: 'experiments:update-run',
  deleteRun: 'experiments:delete-run',
  recordResult: 'experiments:record-result',
  createConclusion: 'experiments:create-conclusion',
  updateConclusion: 'experiments:update-conclusion',
  generateProposal: 'experiments:generate-conclusion-proposal',
  confirmProposal: 'experiments:confirm-conclusion-proposal',
  rejectProposal: 'experiments:reject-conclusion-proposal',
});
export type ExperimentIpcChannels = typeof EXPERIMENT_IPC_CHANNELS;
export type ExperimentStatus = 'archived' | 'completed' | 'in_progress' | 'paused' | 'planned';
export type ExperimentRunStatus = 'cancelled' | 'failed' | 'pending' | 'running' | 'succeeded';
export type ExperimentOutcome = 'inconclusive' | 'refutes' | 'supports';
export type ConclusionStatus = 'confirmed' | 'draft' | 'retired';

export interface ExperimentMetric {
  readonly name: string;
  readonly value: number;
  readonly unit: string | null;
}
export interface ExperimentResult {
  readonly id: string;
  readonly runId: string;
  readonly summary: string;
  readonly outcome: ExperimentOutcome;
  readonly metrics: readonly ExperimentMetric[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
}
export interface ExperimentRunReference {
  readonly id: string;
  readonly experimentId: string;
  readonly label: string;
  readonly toolName: string;
  readonly externalRunId: string;
  readonly status: ExperimentRunStatus;
  readonly configSummary: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly result: ExperimentResult | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
}
export interface ExperimentConclusion {
  readonly id: string;
  readonly experimentId: string;
  readonly resultId: string | null;
  readonly statement: string;
  readonly status: ConclusionStatus;
  readonly provenance: 'ai-proposed-confirmed' | 'manual';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
}
export interface ExperimentConclusionProposal {
  readonly id: string;
  readonly experimentId: string;
  readonly statement: string;
  readonly rationale: string;
  readonly providerId: 'codex' | 'openai';
  readonly model: string;
  readonly status: 'confirmed' | 'pending' | 'rejected';
  readonly confirmedConclusionId: string | null;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
  readonly rowVersion: number;
}
export interface ExperimentAvailability {
  readonly question: 'available' | 'unavailable';
  readonly repository: 'available' | 'stale' | 'unavailable';
  readonly reason: string | null;
}
export interface Experiment {
  readonly id: string;
  readonly workspaceId: string;
  readonly questionId: string | null;
  readonly title: string;
  readonly hypothesis: string;
  readonly status: ExperimentStatus;
  readonly repositoryId: string | null;
  readonly codeSnapshotIdentity: string | null;
  readonly configSummary: string;
  readonly runs: readonly ExperimentRunReference[];
  readonly conclusions: readonly ExperimentConclusion[];
  readonly proposals: readonly ExperimentConclusionProposal[];
  readonly availability: ExperimentAvailability;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
}
export interface CreateExperimentInput {
  readonly workspaceId: string;
  readonly questionId: string | null;
  readonly title: string;
  readonly hypothesis: string;
  readonly repositoryId: string | null;
  readonly codeSnapshotIdentity: string | null;
  readonly configSummary: string;
}
export interface UpdateExperimentInput extends CreateExperimentInput {
  readonly id: string;
  readonly rowVersion: number;
}
export interface ExperimentIdentityInput {
  readonly workspaceId: string;
  readonly experimentId: string;
}
export interface CreateExperimentRunInput extends ExperimentIdentityInput {
  readonly label: string;
  readonly toolName: string;
  readonly externalRunId: string;
  readonly configSummary: string;
  readonly startedAt: string | null;
}
export interface UpdateExperimentRunInput extends ExperimentIdentityInput {
  readonly runId: string;
  readonly label: string;
  readonly status: ExperimentRunStatus;
  readonly configSummary: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly rowVersion: number;
}
export interface RecordExperimentResultInput extends ExperimentIdentityInput {
  readonly runId: string;
  readonly summary: string;
  readonly outcome: ExperimentOutcome;
  readonly metrics: readonly ExperimentMetric[];
}
export interface ExperimentApi {
  list(workspaceId: string): Promise<ApiResult<readonly Experiment[]>>;
  get(input: ExperimentIdentityInput): Promise<ApiResult<Experiment>>;
  create(input: CreateExperimentInput): Promise<ApiResult<Experiment>>;
  update(input: UpdateExperimentInput): Promise<ApiResult<Experiment>>;
  setStatus(
    input: ExperimentIdentityInput & {
      readonly status: ExperimentStatus;
      readonly rowVersion: number;
    },
  ): Promise<ApiResult<Experiment>>;
  delete(
    input: ExperimentIdentityInput & { readonly confirmation: 'DELETE_EXPERIMENT' },
  ): Promise<ApiResult<{ readonly id: string }>>;
  addRun(input: CreateExperimentRunInput): Promise<ApiResult<Experiment>>;
  updateRun(input: UpdateExperimentRunInput): Promise<ApiResult<Experiment>>;
  deleteRun(
    input: ExperimentIdentityInput & {
      readonly runId: string;
      readonly confirmation: 'DELETE_EXPERIMENT_RUN';
    },
  ): Promise<ApiResult<Experiment>>;
  recordResult(input: RecordExperimentResultInput): Promise<ApiResult<Experiment>>;
  createConclusion(
    input: ExperimentIdentityInput & {
      readonly resultId: string | null;
      readonly statement: string;
    },
  ): Promise<ApiResult<Experiment>>;
  updateConclusion(
    input: ExperimentIdentityInput & {
      readonly conclusionId: string;
      readonly statement: string;
      readonly status: ConclusionStatus;
      readonly rowVersion: number;
    },
  ): Promise<ApiResult<Experiment>>;
  generateProposal(
    input: ExperimentIdentityInput & { readonly instruction: string },
  ): Promise<ApiResult<ExperimentConclusionProposal>>;
  confirmProposal(
    input: ExperimentIdentityInput & {
      readonly proposalId: string;
      readonly statement: string;
      readonly rowVersion: number;
    },
  ): Promise<ApiResult<Experiment>>;
  rejectProposal(
    input: ExperimentIdentityInput & { readonly proposalId: string; readonly rowVersion: number },
  ): Promise<ApiResult<ExperimentConclusionProposal>>;
}
