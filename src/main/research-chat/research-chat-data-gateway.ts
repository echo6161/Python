import type { AiError, AiProviderId } from '../../shared/contracts/ai';
import type {
  ResearchChatContextPreview,
  ResearchChatContextSource,
  ResearchChatConversation,
  ResearchChatMessage,
} from '../../shared/contracts/research-chat';

export interface CreateResearchChatTurnInput {
  readonly conversationId: string | null;
  readonly workspaceId: string;
  readonly questionId: string | null;
  readonly title: string;
  readonly providerId: AiProviderId;
  readonly model: string;
  readonly userContent: string;
  readonly context: ResearchChatContextPreview;
  readonly retryOfMessageId: string | null;
}

export interface CreateResearchChatTurnResult {
  readonly conversation: ResearchChatConversation;
  readonly assistantMessageId: string;
}

export interface FinalizeResearchChatMessageInput {
  readonly messageId: string;
  readonly status: 'cancelled' | 'complete' | 'failed';
  readonly content: string;
  readonly error: AiError | null;
  readonly providerRequestId: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
}

export interface StoredResearchChatTurn {
  readonly conversation: ResearchChatConversation;
  readonly assistantMessage: ResearchChatMessage;
  readonly context: ResearchChatContextPreview;
}

export interface ResearchChatDataGateway {
  createResearchChatTurn(input: CreateResearchChatTurnInput): Promise<CreateResearchChatTurnResult>;
  finalizeResearchChatMessage(
    input: FinalizeResearchChatMessageInput,
  ): Promise<ResearchChatMessage>;
  getLatestResearchChatConversation(
    workspaceId: string,
    questionId: string | null,
  ): Promise<ResearchChatConversation | null>;
  getResearchChatConversation(
    workspaceId: string,
    conversationId: string,
  ): Promise<ResearchChatConversation | null>;
  getResearchChatTurn(
    workspaceId: string,
    conversationId: string,
    assistantMessageId: string,
  ): Promise<StoredResearchChatTurn | null>;
  getResearchChatCitationSource(
    workspaceId: string,
    conversationId: string,
    messageId: string,
    alias: string,
  ): Promise<ResearchChatContextSource | null>;
  markStaleResearchChatMessages(): Promise<number>;
}
