import type { AiError, AiMessageStatus, AiProviderId } from './ai';
import type { ApiResult } from './library';
import type {
  KnowledgeProvenance,
  KnowledgeSearchMode,
  KnowledgeSourceType,
  OpenKnowledgeResult,
} from './knowledge';

export const RESEARCH_CHAT_IPC_CHANNELS = Object.freeze({
  getLatestConversation: 'research-chat:get-latest-conversation',
  prepareContext: 'research-chat:prepare-context',
  startTurn: 'research-chat:start-turn',
  retryTurn: 'research-chat:retry-turn',
  cancelTurn: 'research-chat:cancel-turn',
  openCitation: 'research-chat:open-citation',
  streamEvent: 'research-chat:stream-event',
});

export type ResearchChatIpcChannels = typeof RESEARCH_CHAT_IPC_CHANNELS;

export interface ResearchChatContextSource {
  readonly alias: string;
  readonly chunkId: string;
  readonly sourceType: KnowledgeSourceType;
  readonly title: string;
  readonly snippet: string;
  readonly citation: string;
  readonly score: number;
  readonly stale: boolean;
  readonly unavailableReason: string | null;
  readonly provenance: KnowledgeProvenance;
}

export interface ResearchChatContextBudget {
  readonly maximumCharacters: number;
  readonly usedCharacters: number;
  readonly maximumSources: number;
  readonly candidateSources: number;
  readonly includedSources: number;
  readonly deduplicatedSources: number;
  readonly truncatedSources: number;
}

export interface ResearchChatContextPreview {
  readonly id: string;
  readonly workspaceId: string;
  readonly questionId: string | null;
  readonly query: string;
  readonly sourceTypes: readonly KnowledgeSourceType[];
  readonly retrievalVersion: string;
  readonly searchMode: KnowledgeSearchMode;
  readonly sources: readonly ResearchChatContextSource[];
  readonly budget: ResearchChatContextBudget;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface PrepareResearchChatContextInput {
  readonly workspaceId: string;
  readonly questionId: string | null;
  readonly query: string;
  readonly sourceTypes: readonly KnowledgeSourceType[];
}

export interface ResearchChatCitation {
  readonly alias: string;
  readonly source: ResearchChatContextSource;
}

export interface ResearchChatMessage {
  readonly id: string;
  readonly role: 'assistant' | 'user';
  readonly content: string;
  readonly status: AiMessageStatus;
  readonly citations: readonly ResearchChatCitation[];
  readonly unsupportedCitations: readonly string[];
  readonly error: AiError | null;
  readonly createdAt: string;
}

export interface ResearchChatConversation {
  readonly id: string;
  readonly workspaceId: string;
  readonly questionId: string | null;
  readonly title: string;
  readonly providerId: AiProviderId;
  readonly model: string;
  readonly messages: readonly ResearchChatMessage[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StartResearchChatTurnInput {
  readonly contextId: string;
  readonly selectedAliases: readonly string[];
  readonly conversationId: string | null;
}

export interface RetryResearchChatTurnInput {
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly assistantMessageId: string;
}

export interface ResearchChatTurnAccepted {
  readonly requestId: string;
  readonly conversation: ResearchChatConversation;
  readonly assistantMessageId: string;
}

export type ResearchChatStreamEvent =
  | {
      readonly type: 'delta';
      readonly requestId: string;
      readonly conversationId: string;
      readonly assistantMessageId: string;
      readonly delta: string;
    }
  | {
      readonly type: 'completed' | 'cancelled';
      readonly requestId: string;
      readonly conversationId: string;
      readonly message: ResearchChatMessage;
    }
  | {
      readonly type: 'error';
      readonly requestId: string;
      readonly conversationId: string;
      readonly message: ResearchChatMessage;
      readonly error: AiError;
    };

export interface OpenResearchChatCitationInput {
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly alias: string;
}

export interface ResearchChatApi {
  getLatestConversation(
    workspaceId: string,
    questionId: string | null,
  ): Promise<ApiResult<ResearchChatConversation | null>>;
  prepareContext(
    input: PrepareResearchChatContextInput,
  ): Promise<ApiResult<ResearchChatContextPreview>>;
  startTurn(input: StartResearchChatTurnInput): Promise<ApiResult<ResearchChatTurnAccepted>>;
  retryTurn(input: RetryResearchChatTurnInput): Promise<ApiResult<ResearchChatTurnAccepted>>;
  cancelTurn(requestId: string): Promise<ApiResult<{ readonly requestId: string }>>;
  openCitation(input: OpenResearchChatCitationInput): Promise<ApiResult<OpenKnowledgeResult>>;
  onStreamEvent(listener: (event: ResearchChatStreamEvent) => void): () => void;
}
