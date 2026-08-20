import type {
  CreateExperimentInput,
  Experiment,
  ExperimentConclusionProposal,
  RecordExperimentResultInput,
  UpdateExperimentInput,
  CreateExperimentRunInput,
  UpdateExperimentRunInput,
  ExperimentStatus,
  ConclusionStatus,
} from '../../shared/contracts/experiment';
export interface ExperimentDataGateway {
  listExperiments(workspaceId: string): Promise<readonly Experiment[]>;
  getExperiment(workspaceId: string, id: string): Promise<Experiment | null>;
  createExperiment(input: CreateExperimentInput): Promise<Experiment>;
  updateExperiment(input: UpdateExperimentInput): Promise<Experiment>;
  setExperimentStatus(
    workspaceId: string,
    id: string,
    status: ExperimentStatus,
    rowVersion: number,
  ): Promise<Experiment>;
  deleteExperiment(workspaceId: string, id: string): Promise<boolean>;
  addExperimentRun(input: CreateExperimentRunInput): Promise<Experiment>;
  updateExperimentRun(input: UpdateExperimentRunInput): Promise<Experiment>;
  deleteExperimentRun(
    workspaceId: string,
    experimentId: string,
    runId: string,
  ): Promise<Experiment>;
  recordExperimentResult(input: RecordExperimentResultInput): Promise<Experiment>;
  createExperimentConclusion(
    workspaceId: string,
    experimentId: string,
    resultId: string | null,
    statement: string,
    provenance: 'manual' | 'ai-proposed-confirmed',
  ): Promise<Experiment>;
  updateExperimentConclusion(
    workspaceId: string,
    experimentId: string,
    conclusionId: string,
    statement: string,
    status: ConclusionStatus,
    rowVersion: number,
  ): Promise<Experiment>;
  createExperimentConclusionProposal(input: {
    readonly id: string;
    readonly workspaceId: string;
    readonly experimentId: string;
    readonly statement: string;
    readonly rationale: string;
    readonly providerId: 'codex' | 'openai';
    readonly model: string;
    readonly createdAt: string;
  }): Promise<ExperimentConclusionProposal>;
  confirmExperimentConclusionProposal(input: {
    readonly workspaceId: string;
    readonly experimentId: string;
    readonly proposalId: string;
    readonly statement: string;
    readonly rowVersion: number;
  }): Promise<Experiment>;
  rejectExperimentConclusionProposal(
    workspaceId: string,
    experimentId: string,
    proposalId: string,
    rowVersion: number,
  ): Promise<ExperimentConclusionProposal>;
}
