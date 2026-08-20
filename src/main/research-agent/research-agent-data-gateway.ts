import type { AiError } from '../../shared/contracts/ai';
import type {
  ResearchAgentBudget,
  ResearchAgentCitation,
  ResearchAgentProposal,
  ResearchAgentRun,
  ResearchAgentRunStatus,
  ResearchAgentRunSummary,
  ResearchAgentTerminationReason,
  ResearchAgentToolName,
  ResearchAgentUsage,
} from '../../shared/contracts/research-agent';

export interface CreateStoredAgentRunInput {
  readonly id: string;
  readonly workspaceId: string;
  readonly goal: string;
  readonly providerId: 'codex' | 'openai';
  readonly model: string;
  readonly budget: ResearchAgentBudget;
  readonly createdAt: string;
}

export interface AppendStoredAgentStepInput {
  readonly id: string;
  readonly runId: string;
  readonly workspaceId: string;
  readonly ordinal: number;
  readonly toolName: ResearchAgentToolName;
  readonly status: 'cancelled' | 'failed' | 'succeeded';
  readonly inputSummary: string;
  readonly outputSummary: string;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface CompleteStoredAgentRunInput {
  readonly runId: string;
  readonly workspaceId: string;
  readonly status: Exclude<ResearchAgentRunStatus, 'running'>;
  readonly terminationReason: ResearchAgentTerminationReason;
  readonly answerMarkdown: string;
  readonly uncertainty: string;
  readonly usage: ResearchAgentUsage;
  readonly citations: readonly ResearchAgentCitation[];
  readonly proposals: readonly Omit<
    ResearchAgentProposal,
    'downstreamProposalId' | 'reviewedAt' | 'rowVersion' | 'status'
  >[];
  readonly error: AiError | null;
  readonly completedAt: string;
}

export interface ResearchAgentDataGateway {
  markInterruptedAgentRuns(completedAt: string): Promise<number>;
  createAgentRun(input: CreateStoredAgentRunInput): Promise<ResearchAgentRun>;
  appendAgentStep(input: AppendStoredAgentStepInput): Promise<ResearchAgentRun>;
  updateAgentContextUsage(
    workspaceId: string,
    runId: string,
    contextCharacters: number,
  ): Promise<ResearchAgentRun>;
  completeAgentRun(input: CompleteStoredAgentRunInput): Promise<ResearchAgentRun>;
  getAgentRun(workspaceId: string, runId: string): Promise<ResearchAgentRun | null>;
  listAgentRuns(workspaceId: string): Promise<readonly ResearchAgentRunSummary[]>;
  reviewAgentProposal(input: {
    readonly workspaceId: string;
    readonly runId: string;
    readonly proposalId: string;
    readonly status: 'accepted' | 'rejected';
    readonly downstreamProposalId: string | null;
    readonly rowVersion: number;
    readonly reviewedAt: string;
  }): Promise<ResearchAgentProposal>;
}
