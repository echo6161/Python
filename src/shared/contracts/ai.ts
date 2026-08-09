import type { ApiResult } from './library';

export const AI_IPC_CHANNELS = Object.freeze({
  getCapabilities: 'ai:get-capabilities',
  updateSettings: 'settings:update-ai',
  setApiKey: 'secrets:set-provider-key',
  deleteApiKey: 'secrets:delete-provider-key',
  getConversation: 'ai:get-conversation',
  openChatGptBridge: 'ai:open-chatgpt-bridge',
  startTask: 'ai:start-task',
  cancelTask: 'ai:cancel-task',
  streamEvent: 'events:ai-stream',
});

export const AI_HISTORY_MESSAGE_LIMIT = 20;
export const AI_HISTORY_CHARACTER_LIMIT = 40_000;

export type AiIpcChannels = typeof AI_IPC_CHANNELS;
export type AiTaskKind = 'translate' | 'explain' | 'term' | 'chat' | 'follow_up';
export type AiMessageRole = 'user' | 'assistant';
export type AiMessageStatus = 'streaming' | 'complete' | 'failed' | 'cancelled';
export type AiCredentialPersistence = 'secure' | 'session_only' | 'unavailable';
export type AiErrorCode =
  | 'AUTHENTICATION'
  | 'CANCELLED'
  | 'INVALID_REQUEST'
  | 'MISSING_CREDENTIAL'
  | 'NETWORK'
  | 'PERMISSION'
  | 'PROVIDER'
  | 'RATE_LIMIT'
  | 'STORAGE'
  | 'TIMEOUT';

export interface AiProviderSettings {
  readonly baseUrl: string;
  readonly model: string;
  readonly temperature: number;
  readonly maxOutputTokens: number;
  readonly saveHistoryByDefault: boolean;
}

export interface AiCredentialState {
  readonly configured: boolean;
  readonly persistence: AiCredentialPersistence;
  readonly backend: string;
}

export interface AiCapabilities {
  readonly providerId: 'openai';
  readonly settings: AiProviderSettings;
  readonly credential: AiCredentialState;
  readonly selectionOnlyByDefault: true;
}

export interface AiSelectionScope {
  readonly paperId: string;
  readonly paperTitle: string;
  readonly pageNumber: number;
  readonly selectedText: string;
  readonly textStart: number;
  readonly textEnd: number;
}

export interface AiTaskInput {
  readonly kind: AiTaskKind;
  readonly paperId: string;
  readonly selection: AiSelectionScope | null;
  readonly prompt: string | null;
  readonly conversationId: string | null;
  readonly saveHistory: boolean;
}

export interface AiChatGptBridgeInput {
  readonly kind: AiTaskKind;
  readonly selection: AiSelectionScope | null;
  readonly prompt: string | null;
}

export interface AiChatGptBridgeResult {
  readonly copied: true;
  readonly destinationUrl: 'https://chatgpt.com/';
  readonly opened: boolean;
  readonly promptCharacterCount: number;
}

export interface AiMessage {
  readonly id: string;
  readonly role: AiMessageRole;
  readonly content: string;
  readonly status: AiMessageStatus;
  readonly createdAt: string;
}

export function selectAiReplayHistory(messages: readonly AiMessage[]): readonly AiMessage[] {
  const candidates = messages
    .filter(({ status, content }) => status === 'complete' && content.trim().length > 0)
    .slice(-AI_HISTORY_MESSAGE_LIMIT);
  let characterCount = 0;
  let startIndex = candidates.length;

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const message = candidates[index];
    if (!message || characterCount + message.content.length > AI_HISTORY_CHARACTER_LIMIT) {
      break;
    }
    characterCount += message.content.length;
    startIndex = index;
  }

  return candidates.slice(startIndex);
}

export interface AiConversation {
  readonly id: string;
  readonly paperId: string;
  readonly title: string;
  readonly providerId: 'openai';
  readonly model: string;
  readonly messages: readonly AiMessage[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly persisted: boolean;
}

export interface AiTaskAccepted {
  readonly requestId: string;
  readonly conversation: AiConversation;
  readonly assistantMessageId: string;
}

export interface AiError {
  readonly code: AiErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

export type AiStreamEvent =
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
      readonly message: AiMessage;
    }
  | {
      readonly type: 'error';
      readonly requestId: string;
      readonly conversationId: string;
      readonly message: AiMessage;
      readonly error: AiError;
    };

export interface AiApi {
  getCapabilities(): Promise<ApiResult<AiCapabilities>>;
  updateSettings(settings: AiProviderSettings): Promise<ApiResult<AiCapabilities>>;
  setApiKey(apiKey: string): Promise<ApiResult<AiCredentialState>>;
  deleteApiKey(): Promise<ApiResult<AiCredentialState>>;
  getConversation(paperId: string): Promise<ApiResult<AiConversation | null>>;
  openChatGptBridge(input: AiChatGptBridgeInput): Promise<ApiResult<AiChatGptBridgeResult>>;
  startTask(input: AiTaskInput): Promise<ApiResult<AiTaskAccepted>>;
  cancelTask(requestId: string): Promise<ApiResult<{ readonly requestId: string }>>;
  onStreamEvent(listener: (event: AiStreamEvent) => void): () => void;
}
