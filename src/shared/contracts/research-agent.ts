import type { AiError, AiProviderId } from './ai';
import type { ApiResult } from './library';
import type { KnowledgeProvenance, KnowledgeSourceType, OpenKnowledgeResult } from './knowledge';

export const RESEARCH_AGENT_IPC_CHANNELS = Object.freeze({
  listRuns: 'research-agent:list-runs',
  getRun: 'research-agent:get-run',
  startRun: 'research-agent:start-run',
  cancelRun: 'research-agent:cancel-run',
  openCitation: 'research-agent:open-citation',
  acceptProposal: 'research-agent:accept-proposal',
  rejectProposal: 'research-agent:reject-proposal',
  runEvent: 'research-agent:run-event',
});
export type ResearchAgentIpcChannels = typeof RESEARCH_AGENT_IPC_CHANNELS;

export type ResearchAgentToolName =
  | 'inspect_workspace'
  | 'search_knowledge'
  | 'read_paper_pages'
  | 'search_code'
  | 'read_code'
  | 'list_questions'
  | 'list_notes_memory'
  | 'inspect_plan'
  | 'list_links';
export type ResearchAgentRunStatus =
  'cancelled' | 'failed' | 'partial' | 'running' | 'succeeded' | 'timeout';
export type ResearchAgentTerminationReason =
  | 'cancelled'
  | 'completed'
  | 'max_context'
  | 'max_steps'
  | 'max_tool_calls'
  | 'provider_error'
  | 'timeout'
  | 'tool_error';
export type ResearchAgentStepStatus = 'cancelled' | 'failed' | 'running' | 'succeeded';
export type ResearchAgentProposalStatus = 'accepted' | 'pending' | 'rejected';

export interface ResearchAgentBudget {
  readonly maximumSteps: number;
  readonly maximumToolCalls: number;
  readonly maximumContextCharacters: number;
  readonly timeoutMs: number;
}

export interface ResearchAgentUsage {
  readonly steps: number;
  readonly toolCalls: number;
  readonly contextCharacters: number;
}

export interface ResearchAgentTraceStep {
  readonly id: string;
  readonly ordinal: number;
  readonly toolName: ResearchAgentToolName;
  readonly status: ResearchAgentStepStatus;
  readonly inputSummary: string;
  readonly outputSummary: string;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
}

export interface ResearchAgentCitation {
  readonly alias: string;
  readonly chunkId: string;
  readonly sourceType: KnowledgeSourceType;
  readonly title: string;
  readonly snippet: string;
  readonly citation: string;
  readonly stale: boolean;
  readonly unavailableReason: string | null;
  readonly provenance: KnowledgeProvenance;
}

export interface ResearchAgentProposal {
  readonly id: string;
  readonly runId: string;
  readonly workspaceId: string;
  readonly kind: 'memory';
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly reason: string;
  readonly status: ResearchAgentProposalStatus;
  readonly downstreamProposalId: string | null;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
  readonly rowVersion: number;
}

export interface ResearchAgentRun {
  readonly id: string;
  readonly workspaceId: string;
  readonly goal: string;
  readonly status: ResearchAgentRunStatus;
  readonly terminationReason: ResearchAgentTerminationReason | null;
  readonly answerMarkdown: string;
  readonly uncertainty: string;
  readonly providerId: AiProviderId;
  readonly model: string;
  readonly budget: ResearchAgentBudget;
  readonly usage: ResearchAgentUsage;
  readonly trace: readonly ResearchAgentTraceStep[];
  readonly citations: readonly ResearchAgentCitation[];
  readonly proposals: readonly ResearchAgentProposal[];
  readonly error: AiError | null;
  readonly createdAt: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
}

export interface ResearchAgentRunSummary {
  readonly id: string;
  readonly workspaceId: string;
  readonly goal: string;
  readonly status: ResearchAgentRunStatus;
  readonly terminationReason: ResearchAgentTerminationReason | null;
  readonly toolCalls: number;
  readonly citationCount: number;
  readonly proposalCount: number;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface StartResearchAgentRunInput {
  readonly workspaceId: string;
  readonly goal: string;
}

export interface ResearchAgentRunAccepted {
  readonly requestId: string;
  readonly run: ResearchAgentRun;
}

export type ResearchAgentRunEvent =
  | { readonly type: 'updated'; readonly requestId: string; readonly run: ResearchAgentRun }
  | {
      readonly type: 'delta';
      readonly requestId: string;
      readonly runId: string;
      readonly delta: string;
    };

export interface ResearchAgentApi {
  listRuns(workspaceId: string): Promise<ApiResult<readonly ResearchAgentRunSummary[]>>;
  getRun(workspaceId: string, runId: string): Promise<ApiResult<ResearchAgentRun>>;
  startRun(input: StartResearchAgentRunInput): Promise<ApiResult<ResearchAgentRunAccepted>>;
  cancelRun(requestId: string): Promise<ApiResult<{ readonly requestId: string }>>;
  openCitation(input: {
    readonly workspaceId: string;
    readonly runId: string;
    readonly alias: string;
  }): Promise<ApiResult<OpenKnowledgeResult>>;
  acceptProposal(input: {
    readonly workspaceId: string;
    readonly runId: string;
    readonly proposalId: string;
    readonly rowVersion: number;
  }): Promise<ApiResult<ResearchAgentProposal>>;
  rejectProposal(input: {
    readonly workspaceId: string;
    readonly runId: string;
    readonly proposalId: string;
    readonly rowVersion: number;
  }): Promise<ApiResult<ResearchAgentProposal>>;
  onRunEvent(listener: (event: ResearchAgentRunEvent) => void): () => void;
}
