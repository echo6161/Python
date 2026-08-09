import type {
  AiConversation,
  AiMessage,
  AiMessageStatus,
  AiProviderSettings,
} from '../../shared/contracts/ai';

export type AiTerminalMessageStatus = Exclude<AiMessageStatus, 'streaming'>;

export interface CreateAiTurnInput {
  readonly conversationId: string | null;
  readonly paperId: string;
  readonly title: string;
  readonly providerId: 'openai';
  readonly model: string;
  readonly userContent: string;
}

export interface CreateAiTurnResult {
  readonly conversation: AiConversation;
  readonly assistantMessageId: string;
}

export interface FinalizeAiMessageInput {
  readonly messageId: string;
  readonly status: AiTerminalMessageStatus;
  readonly content: string;
  readonly providerRequestId: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
}

export interface AiDataGateway {
  getAiSettings(): Promise<AiProviderSettings | null>;
  saveAiSettings(settings: AiProviderSettings): Promise<AiProviderSettings>;
  createAiTurn(input: CreateAiTurnInput): Promise<CreateAiTurnResult>;
  finalizeAiMessage(input: FinalizeAiMessageInput): Promise<AiMessage>;
  getLatestAiConversation(paperId: string): Promise<AiConversation | null>;
  getAiConversation(conversationId: string): Promise<AiConversation | null>;
  markStaleAiMessages(): Promise<number>;
}
