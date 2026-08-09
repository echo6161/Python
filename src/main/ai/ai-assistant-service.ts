import { randomUUID } from 'node:crypto';

import type {
  AiCapabilities,
  AiConversation,
  AiMessage,
  AiProviderSettings,
  AiStreamEvent,
  AiTaskAccepted,
  AiTaskInput,
} from '../../shared/contracts/ai';
import type { AiDataGateway } from './ai-data-gateway';
import { normalizeAiBaseUrl } from './base-url-policy';
import { MockAiProvider, type MockProviderOptions } from './mock-provider';
import { OpenAiProvider } from './openai-provider';
import {
  AI_SYSTEM_INSTRUCTIONS,
  buildProviderMessages,
  buildTaskMessage,
  buildVisibleUserMessage,
} from './prompts';
import { AiProviderError, type AiProvider } from './provider';
import type { AiSecretStore } from './secret-store';
import { LibraryError } from '../library/errors';

const DEFAULT_SETTINGS: AiProviderSettings = Object.freeze({
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-5.6',
  temperature: 0.2,
  maxOutputTokens: 2_048,
  saveHistoryByDefault: true,
});
const REQUEST_TIMEOUT_MS = 90_000;
const MAX_RESPONSE_CHARACTERS = 2_000_000;

interface ActiveRequest {
  readonly controller: AbortController;
  readonly ownerId: number;
  readonly conversationId: string;
  readonly assistantMessageId: string;
  readonly persisted: boolean;
  readonly emit: (event: AiStreamEvent) => void;
  readonly assistantCreatedAt: string;
  acceptingCancellation: boolean;
  cancelledByUser: boolean;
  timedOut: boolean;
}

export interface AiAssistantServiceOptions {
  readonly useMockProvider?: boolean;
  readonly mockProviderOptions?: MockProviderOptions;
  readonly providerFactory?: (apiKey: string) => AiProvider;
}

export class AiAssistantService {
  private readonly activeRequests = new Map<string, ActiveRequest>();
  private readonly requestTasks = new Map<string, Promise<void>>();
  private readonly lockedConversations = new Set<string>();
  private readonly startingOwners = new Set<number>();
  private readonly ephemeralConversations = new Map<string, AiConversation>();
  private shuttingDown = false;

  public constructor(
    private readonly data: AiDataGateway,
    private readonly secrets: AiSecretStore,
    private readonly options: AiAssistantServiceOptions = {},
  ) {}

  public async initialize(): Promise<void> {
    await this.data.markStaleAiMessages();
  }

  public async getCapabilities(): Promise<AiCapabilities> {
    return {
      providerId: 'openai',
      settings: await this.getSettings(),
      credential: this.options.useMockProvider
        ? { configured: true, persistence: 'unavailable', backend: 'test-mock' }
        : await this.secrets.getState(),
      selectionOnlyByDefault: true,
    };
  }

  public async updateSettings(settings: AiProviderSettings): Promise<AiCapabilities> {
    const normalized = validateAiSettings(settings, 'INVALID_INPUT');
    await this.data.saveAiSettings(normalized);
    return this.getCapabilities();
  }

  public setApiKey(apiKey: string) {
    return this.secrets.setApiKey(apiKey);
  }

  public deleteApiKey() {
    return this.secrets.deleteApiKey();
  }

  public async getConversation(paperId: string): Promise<AiConversation | null> {
    const ephemeral = [...this.ephemeralConversations.values()]
      .filter((conversation) => conversation.paperId === paperId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    const persisted = await this.data.getLatestAiConversation(paperId);
    if (!ephemeral) return persisted;
    if (!persisted || ephemeral.updatedAt >= persisted.updatedAt) return ephemeral;
    return persisted;
  }

  public async startTask(
    input: AiTaskInput,
    ownerId: number,
    emit: (event: AiStreamEvent) => void,
  ): Promise<AiTaskAccepted> {
    if (this.shuttingDown) {
      throw new LibraryError('CONFLICT', 'The AI service is shutting down.');
    }
    if (
      this.startingOwners.has(ownerId) ||
      [...this.activeRequests.values()].some((request) => request.ownerId === ownerId)
    ) {
      throw new LibraryError(
        'CONFLICT',
        'Wait for the active AI response before starting another.',
      );
    }
    this.startingOwners.add(ownerId);
    try {
      return await this.startTaskForOwner(input, ownerId, emit);
    } finally {
      this.startingOwners.delete(ownerId);
    }
  }

  private async startTaskForOwner(
    input: AiTaskInput,
    ownerId: number,
    emit: (event: AiStreamEvent) => void,
  ): Promise<AiTaskAccepted> {
    const settings = await this.getSettings();
    const provider = await this.createProvider();
    const requestedConversation = input.conversationId
      ? await this.findConversation(input.conversationId)
      : null;
    if (requestedConversation && requestedConversation.paperId !== input.paperId) {
      throw new LibraryError('INVALID_INPUT', 'The conversation belongs to another paper.');
    }
    const priorConversation =
      requestedConversation?.model === settings.model &&
      !(input.saveHistory && !requestedConversation.persisted)
        ? requestedConversation
        : null;

    if (priorConversation && this.lockedConversations.has(priorConversation.id)) {
      throw new LibraryError(
        'CONFLICT',
        'Wait for the active AI response before continuing this conversation.',
      );
    }

    const taskMessage = buildTaskMessage(input);
    const userContent = buildVisibleUserMessage(input);
    if (priorConversation) this.lockedConversations.add(priorConversation.id);
    let created: { readonly conversation: AiConversation; readonly assistantMessageId: string };
    try {
      created = input.saveHistory
        ? await this.data.createAiTurn({
            conversationId: priorConversation?.persisted ? priorConversation.id : null,
            paperId: input.paperId,
            title: conversationTitle(input),
            providerId: 'openai',
            model: settings.model,
            userContent,
          })
        : this.createEphemeralTurn(input, priorConversation, settings.model, userContent);
    } catch (error) {
      if (priorConversation) this.lockedConversations.delete(priorConversation.id);
      throw error;
    }
    this.lockedConversations.add(created.conversation.id);

    const requestId = randomUUID();
    const active: ActiveRequest = {
      controller: new AbortController(),
      ownerId,
      conversationId: created.conversation.id,
      assistantMessageId: created.assistantMessageId,
      persisted: created.conversation.persisted,
      emit,
      assistantCreatedAt:
        created.conversation.messages.find(({ id }) => id === created.assistantMessageId)
          ?.createdAt ?? new Date().toISOString(),
      acceptingCancellation: true,
      cancelledByUser: false,
      timedOut: false,
    };
    this.activeRequests.set(requestId, active);
    const history = priorConversation?.messages ?? [];
    const task = new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => this.runTask(requestId, provider, settings, history, taskMessage, active))
      .catch(() => undefined)
      .finally(() => {
        this.requestTasks.delete(requestId);
        this.lockedConversations.delete(created.conversation.id);
      });
    this.requestTasks.set(requestId, task);
    return {
      requestId,
      conversation: created.conversation,
      assistantMessageId: created.assistantMessageId,
    };
  }

  public cancelTask(requestId: string, ownerId: number): void {
    const request = this.activeRequests.get(requestId);
    if (request?.ownerId !== ownerId || !request.acceptingCancellation) {
      throw new LibraryError('NOT_FOUND', 'The AI request is no longer active.');
    }
    request.cancelledByUser = true;
    request.controller.abort();
  }

  public cancelOwnerRequests(ownerId: number): void {
    for (const request of this.activeRequests.values()) {
      if (request.ownerId === ownerId && request.acceptingCancellation) {
        request.cancelledByUser = true;
        request.controller.abort();
      }
    }
  }

  public async shutdown(): Promise<void> {
    this.shuttingDown = true;
    while (this.startingOwners.size > 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    for (const request of this.activeRequests.values()) {
      if (request.acceptingCancellation) {
        request.cancelledByUser = true;
        request.controller.abort();
      }
    }
    await Promise.allSettled(this.requestTasks.values());
  }

  private async createProvider(): Promise<AiProvider> {
    if (this.options.useMockProvider) {
      return new MockAiProvider(this.options.mockProviderOptions);
    }
    const apiKey = await this.secrets.getApiKeyForMain();
    if (!apiKey) {
      throw new LibraryError(
        'PERMISSION_DENIED',
        'Configure an OpenAI API key in Settings before using AI.',
      );
    }
    return this.options.providerFactory?.(apiKey) ?? new OpenAiProvider(apiKey);
  }

  private async getSettings(): Promise<AiProviderSettings> {
    const stored = await this.data.getAiSettings();
    return stored ? validateAiSettings(stored, 'DATABASE_ERROR') : DEFAULT_SETTINGS;
  }

  private async findConversation(conversationId: string): Promise<AiConversation | null> {
    return (
      this.ephemeralConversations.get(conversationId) ??
      (await this.data.getAiConversation(conversationId))
    );
  }

  private createEphemeralTurn(
    input: AiTaskInput,
    prior: AiConversation | null,
    model: string,
    userContent: string,
  ): { readonly conversation: AiConversation; readonly assistantMessageId: string } {
    const now = new Date();
    const conversationId = prior?.persisted ? randomUUID() : (prior?.id ?? randomUUID());
    const userMessage: AiMessage = {
      id: randomUUID(),
      role: 'user',
      content: userContent,
      status: 'complete',
      createdAt: now.toISOString(),
    };
    const assistantMessage: AiMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: '',
      status: 'streaming',
      createdAt: new Date(now.getTime() + 1).toISOString(),
    };
    const conversation: AiConversation = {
      id: conversationId,
      paperId: input.paperId,
      title: prior?.title ?? conversationTitle(input),
      providerId: 'openai',
      model,
      messages: [...(prior?.messages ?? []), userMessage, assistantMessage],
      createdAt: prior?.createdAt ?? now.toISOString(),
      updatedAt: assistantMessage.createdAt,
      persisted: false,
    };
    this.ephemeralConversations.set(conversationId, conversation);
    return { conversation, assistantMessageId: assistantMessage.id };
  }

  private async runTask(
    requestId: string,
    provider: AiProvider,
    settings: AiProviderSettings,
    history: readonly AiMessage[],
    taskMessage: string,
    active: ActiveRequest,
  ): Promise<void> {
    let content = '';
    let providerRequestId: string | null = null;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let completed = false;
    let terminalWriteStarted = false;
    let pendingDelta = '';
    let deltaFlushTimer: NodeJS.Timeout | null = null;
    const flushDelta = () => {
      if (deltaFlushTimer) clearTimeout(deltaFlushTimer);
      deltaFlushTimer = null;
      if (!pendingDelta) return;
      const delta = pendingDelta;
      pendingDelta = '';
      this.emitSafe(active, {
        type: 'delta',
        requestId,
        conversationId: active.conversationId,
        assistantMessageId: active.assistantMessageId,
        delta,
      });
    };
    const scheduleDelta = () => {
      if (pendingDelta.length >= 4_096) {
        flushDelta();
      } else {
        deltaFlushTimer ??= setTimeout(flushDelta, 16);
      }
    };
    const timeout = setTimeout(() => {
      active.timedOut = true;
      active.controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      for await (const event of provider.stream(
        {
          instructions: AI_SYSTEM_INSTRUCTIONS,
          messages: buildProviderMessages(history, taskMessage),
          settings,
        },
        active.controller.signal,
      )) {
        if (event.type === 'delta') {
          if (content.length + event.delta.length > MAX_RESPONSE_CHARACTERS) {
            throw new AiProviderError({
              code: 'PROVIDER',
              message: 'The AI response exceeded the local safety limit.',
              retryable: false,
            });
          }
          content += event.delta;
          pendingDelta += event.delta;
          scheduleDelta();
        } else {
          completed = true;
          providerRequestId = event.providerRequestId;
          inputTokens = event.inputTokens;
          outputTokens = event.outputTokens;
        }
      }
      if (!completed) {
        throw new AiProviderError({
          code: 'PROVIDER',
          message: 'The AI provider ended the response unexpectedly.',
          retryable: true,
        });
      }
      flushDelta();
      active.acceptingCancellation = false;
      if (active.controller.signal.aborted) {
        throw new AiProviderError({
          code: 'CANCELLED',
          message: 'The AI request was cancelled.',
          retryable: false,
        });
      }
      terminalWriteStarted = true;
      const message = await this.finalize(active, 'complete', content, {
        providerRequestId,
        inputTokens,
        outputTokens,
      });
      this.emitSafe(active, {
        type: 'completed',
        requestId,
        conversationId: active.conversationId,
        message,
      });
    } catch (error) {
      flushDelta();
      active.acceptingCancellation = false;
      if (terminalWriteStarted) {
        this.emitStorageFailure(active, requestId, content);
        return;
      }
      const cancelled =
        active.cancelledByUser || (!active.timedOut && active.controller.signal.aborted);
      const timedOut = active.timedOut;
      const safeError = timedOut
        ? { code: 'TIMEOUT' as const, message: 'The AI request timed out.', retryable: true }
        : cancelled
          ? {
              code: 'CANCELLED' as const,
              message: 'The AI request was cancelled.',
              retryable: false,
            }
          : error instanceof AiProviderError
            ? error.safeError
            : {
                code: 'PROVIDER' as const,
                message: 'The AI provider could not complete the response.',
                retryable: true,
              };
      const status = cancelled ? 'cancelled' : 'failed';
      let message: AiMessage;
      try {
        terminalWriteStarted = true;
        message = await this.finalize(active, status, content, {
          providerRequestId,
          inputTokens,
          outputTokens,
        });
      } catch {
        this.emitStorageFailure(active, requestId, content);
        return;
      }
      if (cancelled) {
        this.emitSafe(active, {
          type: 'cancelled',
          requestId,
          conversationId: active.conversationId,
          message,
        });
      } else {
        this.emitSafe(active, {
          type: 'error',
          requestId,
          conversationId: active.conversationId,
          message,
          error: safeError,
        });
      }
    } finally {
      clearTimeout(timeout);
      this.activeRequests.delete(requestId);
    }
  }

  private async finalize(
    active: ActiveRequest,
    status: 'complete' | 'failed' | 'cancelled',
    content: string,
    metadata: {
      readonly providerRequestId: string | null;
      readonly inputTokens: number | null;
      readonly outputTokens: number | null;
    },
  ): Promise<AiMessage> {
    if (active.persisted) {
      return this.data.finalizeAiMessage({
        messageId: active.assistantMessageId,
        status,
        content,
        ...metadata,
      });
    }
    const conversation = this.ephemeralConversations.get(active.conversationId);
    if (!conversation) throw new Error('The in-memory conversation was lost.');
    const message = conversation.messages.find(({ id }) => id === active.assistantMessageId);
    if (!message) throw new Error('The in-memory AI response was lost.');
    const updated: AiMessage = { ...message, content, status };
    this.ephemeralConversations.set(active.conversationId, {
      ...conversation,
      messages: conversation.messages.map((item) => (item.id === updated.id ? updated : item)),
      updatedAt: new Date().toISOString(),
    });
    return updated;
  }

  private emitStorageFailure(active: ActiveRequest, requestId: string, content: string): void {
    this.emitSafe(active, {
      type: 'error',
      requestId,
      conversationId: active.conversationId,
      message: {
        id: active.assistantMessageId,
        role: 'assistant',
        content,
        status: 'failed',
        createdAt: active.assistantCreatedAt,
      },
      error: {
        code: 'STORAGE',
        message: 'The AI response could not be saved locally.',
        retryable: true,
      },
    });
  }

  private emitSafe(active: ActiveRequest, event: AiStreamEvent): void {
    try {
      active.emit(event);
    } catch {
      // A closed Renderer must not turn a completed provider request into an unhandled failure.
    }
  }
}

function conversationTitle(input: AiTaskInput): string {
  const labels = {
    translate: 'Translation',
    explain: 'Selection explanation',
    term: 'Term explanation',
    chat: 'Paper question',
    follow_up: 'Paper follow-up',
  } as const;
  return `${labels[input.kind]} · ${input.selection?.paperTitle ?? 'No paper text'}`.slice(0, 500);
}

function validateAiSettings(
  settings: AiProviderSettings,
  errorCode: 'DATABASE_ERROR' | 'INVALID_INPUT',
): AiProviderSettings {
  const model = settings.model.trim();
  if (
    !/^[a-zA-Z0-9._:-]{1,120}$/u.test(model) ||
    !Number.isFinite(settings.temperature) ||
    settings.temperature < 0 ||
    settings.temperature > 2 ||
    !Number.isInteger(settings.maxOutputTokens) ||
    settings.maxOutputTokens < 1 ||
    settings.maxOutputTokens > 128_000
  ) {
    throw new LibraryError(errorCode, 'The saved AI provider settings are invalid.');
  }
  return {
    baseUrl: normalizeAiBaseUrl(settings.baseUrl),
    model,
    temperature: settings.temperature,
    maxOutputTokens: settings.maxOutputTokens,
    saveHistoryByDefault: settings.saveHistoryByDefault,
  };
}
