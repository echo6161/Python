import { randomUUID } from 'node:crypto';

import type { AiError } from '../../shared/contracts/ai';
import type {
  OpenResearchChatCitationInput,
  PrepareResearchChatContextInput,
  ResearchChatContextPreview,
  ResearchChatConversation,
  ResearchChatStreamEvent,
  ResearchChatTurnAccepted,
  RetryResearchChatTurnInput,
  StartResearchChatTurnInput,
} from '../../shared/contracts/research-chat';
import type { AiAssistantService } from '../ai/ai-assistant-service';
import { AiProviderError, type AiProvider } from '../ai/provider';
import type { KnowledgeEngineService } from '../knowledge/knowledge-engine-service';
import { LibraryError } from '../library/errors';
import type { QuestionDataGateway } from '../question/question-data-gateway';
import { extractCitationAliases } from './citation-binding';
import { ResearchChatContextBuilder, selectResearchChatSources } from './context-builder';
import type { ResearchChatDataGateway } from './research-chat-data-gateway';
import {
  buildResearchChatHistory,
  buildResearchChatTask,
  RESEARCH_CHAT_SYSTEM_INSTRUCTIONS,
} from './research-chat-prompts';

const REQUEST_TIMEOUT_MS = 90_000;
const MAX_RESPONSE_CHARACTERS = 2_000_000;

interface PreparedContext {
  readonly ownerId: number;
  readonly preview: ResearchChatContextPreview;
}

interface ActiveRequest {
  readonly controller: AbortController;
  readonly ownerId: number;
  readonly conversationId: string;
  readonly assistantMessageId: string;
  readonly emit: (event: ResearchChatStreamEvent) => void;
  cancelledByUser: boolean;
  timedOut: boolean;
}

export class ResearchChatService {
  private readonly builder: ResearchChatContextBuilder;
  private readonly prepared = new Map<string, PreparedContext>();
  private readonly active = new Map<string, ActiveRequest>();
  private readonly tasks = new Map<string, Promise<void>>();

  public constructor(
    private readonly data: ResearchChatDataGateway,
    knowledge: KnowledgeEngineService,
    private readonly questions: QuestionDataGateway,
    private readonly ai: AiAssistantService,
  ) {
    this.builder = new ResearchChatContextBuilder(knowledge);
    this.knowledge = knowledge;
  }

  private readonly knowledge: KnowledgeEngineService;

  public async initialize(): Promise<void> {
    await this.data.markStaleResearchChatMessages();
  }

  public async getLatestConversation(workspaceId: string, questionId: string | null) {
    await this.validateQuestion(workspaceId, questionId);
    return this.data.getLatestResearchChatConversation(workspaceId, questionId);
  }

  public async prepareContext(
    input: PrepareResearchChatContextInput,
    ownerId: number,
  ): Promise<ResearchChatContextPreview> {
    await this.validateQuestion(input.workspaceId, input.questionId);
    this.removeExpiredPreviews();
    const preview = await this.builder.build(input);
    this.prepared.set(preview.id, { ownerId, preview });
    return preview;
  }

  public async startTurn(
    input: StartResearchChatTurnInput,
    ownerId: number,
    emit: (event: ResearchChatStreamEvent) => void,
  ): Promise<ResearchChatTurnAccepted> {
    this.ensureOwnerIdle(ownerId);
    this.removeExpiredPreviews();
    const prepared = this.prepared.get(input.contextId);
    if (prepared?.ownerId !== ownerId) {
      throw new LibraryError(
        'NOT_FOUND',
        'The prepared context expired. Prepare the question again.',
      );
    }
    const context = selectResearchChatSources(prepared.preview, input.selectedAliases);
    this.prepared.delete(input.contextId);
    await this.validateQuestion(context.workspaceId, context.questionId);
    const prior = input.conversationId
      ? await this.requireConversation(context.workspaceId, input.conversationId)
      : null;
    if (input.conversationId && prior?.questionId !== context.questionId) {
      throw new LibraryError('INVALID_INPUT', 'The chat is bound to another Research Question.');
    }
    return this.beginTurn(context, prior, null, ownerId, emit);
  }

  public async retryTurn(
    input: RetryResearchChatTurnInput,
    ownerId: number,
    emit: (event: ResearchChatStreamEvent) => void,
  ): Promise<ResearchChatTurnAccepted> {
    this.ensureOwnerIdle(ownerId);
    const turn = await this.data.getResearchChatTurn(
      input.workspaceId,
      input.conversationId,
      input.assistantMessageId,
    );
    if (!turn) throw new LibraryError('NOT_FOUND', 'The Research Chat turn no longer exists.');
    if (turn.assistantMessage.status !== 'failed' && turn.assistantMessage.status !== 'cancelled') {
      throw new LibraryError('CONFLICT', 'Only failed or cancelled answers can be retried.');
    }
    await this.validateQuestion(input.workspaceId, turn.conversation.questionId);
    const context = { ...turn.context, questionId: turn.conversation.questionId };
    return this.beginTurn(context, turn.conversation, input.assistantMessageId, ownerId, emit);
  }

  public cancelTurn(requestId: string, ownerId: number): void {
    const request = this.active.get(requestId);
    if (request?.ownerId !== ownerId || request.controller.signal.aborted) {
      throw new LibraryError('NOT_FOUND', 'The Research Chat request is no longer active.');
    }
    request.cancelledByUser = true;
    request.controller.abort();
  }

  public cancelOwnerRequests(ownerId: number): void {
    for (const request of this.active.values()) {
      if (request.ownerId === ownerId && !request.controller.signal.aborted) {
        request.cancelledByUser = true;
        request.controller.abort();
      }
    }
  }

  public async openCitation(input: OpenResearchChatCitationInput) {
    const conversation = await this.requireConversation(input.workspaceId, input.conversationId);
    const message = conversation.messages.find(
      ({ id, role }) => id === input.messageId && role === 'assistant',
    );
    if (!message || !extractCitationAliases(message.content).includes(input.alias)) {
      throw new LibraryError('INVALID_INPUT', 'The answer does not contain that citation.');
    }
    const source = await this.data.getResearchChatCitationSource(
      input.workspaceId,
      input.conversationId,
      input.messageId,
      input.alias,
    );
    if (!source) throw new LibraryError('NOT_FOUND', 'The cited source is unavailable.');
    return this.knowledge.openResult(input.workspaceId, source.chunkId);
  }

  public async shutdown(): Promise<void> {
    for (const request of this.active.values()) {
      request.cancelledByUser = true;
      request.controller.abort();
    }
    await Promise.allSettled(this.tasks.values());
  }

  private async beginTurn(
    context: ResearchChatContextPreview,
    prior: ResearchChatConversation | null,
    retryOfMessageId: string | null,
    ownerId: number,
    emit: (event: ResearchChatStreamEvent) => void,
  ): Promise<ResearchChatTurnAccepted> {
    const session = await this.ai.createProviderSession();
    if (prior && prior.model !== session.settings.model) {
      throw new LibraryError('CONFLICT', 'Continue this chat with its original AI model.');
    }
    const history = buildResearchChatHistory(prior);
    const created = await this.data.createResearchChatTurn({
      conversationId: prior?.id ?? null,
      workspaceId: context.workspaceId,
      questionId: context.questionId,
      title: context.query.slice(0, 300),
      providerId: session.provider.id === 'mock' ? 'openai' : session.provider.id,
      model: session.settings.model,
      userContent: context.query,
      context,
      retryOfMessageId,
    });
    const requestId = randomUUID();
    const active: ActiveRequest = {
      controller: new AbortController(),
      ownerId,
      conversationId: created.conversation.id,
      assistantMessageId: created.assistantMessageId,
      emit,
      cancelledByUser: false,
      timedOut: false,
    };
    this.active.set(requestId, active);
    const task = new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => this.run(requestId, active, session.provider, session.settings, history, context))
      .catch(() => undefined)
      .finally(() => this.tasks.delete(requestId));
    this.tasks.set(requestId, task);
    return {
      requestId,
      conversation: created.conversation,
      assistantMessageId: created.assistantMessageId,
    };
  }

  private async run(
    requestId: string,
    active: ActiveRequest,
    provider: AiProvider,
    settings: Awaited<ReturnType<AiAssistantService['createProviderSession']>>['settings'],
    history: ReturnType<typeof buildResearchChatHistory>,
    context: ResearchChatContextPreview,
  ): Promise<void> {
    let content = '';
    let providerRequestId: string | null = null;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let providerCompleted = false;
    const timeout = setTimeout(() => {
      active.timedOut = true;
      active.controller.abort();
    }, REQUEST_TIMEOUT_MS);
    try {
      for await (const event of provider.stream(
        {
          instructions: RESEARCH_CHAT_SYSTEM_INSTRUCTIONS,
          messages: [...history, { role: 'user', content: buildResearchChatTask(context) }],
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
          this.emit(active, {
            type: 'delta',
            requestId,
            conversationId: active.conversationId,
            assistantMessageId: active.assistantMessageId,
            delta: event.delta,
          });
        } else {
          providerCompleted = true;
          providerRequestId = event.providerRequestId;
          inputTokens = event.inputTokens;
          outputTokens = event.outputTokens;
        }
      }
      if (!providerCompleted)
        throw new AiProviderError({
          code: 'PROVIDER',
          message: 'The AI provider ended the response unexpectedly.',
          retryable: true,
        });
      const message = await this.data.finalizeResearchChatMessage({
        messageId: active.assistantMessageId,
        status: 'complete',
        content,
        error: null,
        providerRequestId,
        inputTokens,
        outputTokens,
      });
      this.emit(active, {
        type: 'completed',
        requestId,
        conversationId: active.conversationId,
        message,
      });
    } catch (error) {
      const cancelled =
        active.cancelledByUser || (!active.timedOut && active.controller.signal.aborted);
      const safeError: AiError = active.timedOut
        ? {
            code: 'TIMEOUT',
            message:
              settings.providerId === 'codex'
                ? 'The Codex service could not be reached before timeout. Check its local proxy setting and network access.'
                : 'The AI request timed out.',
            retryable: true,
          }
        : cancelled
          ? { code: 'CANCELLED', message: 'The AI request was cancelled.', retryable: false }
          : error instanceof AiProviderError
            ? error.safeError
            : {
                code: 'PROVIDER',
                message: 'The AI provider could not complete the response.',
                retryable: true,
              };
      try {
        const message = await this.data.finalizeResearchChatMessage({
          messageId: active.assistantMessageId,
          status: cancelled ? 'cancelled' : 'failed',
          content,
          error: safeError,
          providerRequestId,
          inputTokens,
          outputTokens,
        });
        this.emit(
          active,
          cancelled
            ? { type: 'cancelled', requestId, conversationId: active.conversationId, message }
            : {
                type: 'error',
                requestId,
                conversationId: active.conversationId,
                message,
                error: safeError,
              },
        );
      } catch {
        this.emit(active, {
          type: 'error',
          requestId,
          conversationId: active.conversationId,
          message: {
            id: active.assistantMessageId,
            role: 'assistant',
            content,
            status: 'failed',
            citations: [],
            unsupportedCitations: [],
            error: {
              code: 'STORAGE',
              message: 'The AI response could not be saved locally.',
              retryable: true,
            },
            createdAt: new Date().toISOString(),
          },
          error: {
            code: 'STORAGE',
            message: 'The AI response could not be saved locally.',
            retryable: true,
          },
        });
      }
    } finally {
      clearTimeout(timeout);
      this.active.delete(requestId);
    }
  }

  private ensureOwnerIdle(ownerId: number): void {
    if ([...this.active.values()].some((request) => request.ownerId === ownerId)) {
      throw new LibraryError('CONFLICT', 'Wait for the active Research Chat response.');
    }
  }

  private async validateQuestion(workspaceId: string, questionId: string | null): Promise<void> {
    if (questionId && !(await this.questions.getQuestion(workspaceId, questionId))) {
      throw new LibraryError(
        'NOT_FOUND',
        'The selected Research Question is unavailable in this Workspace.',
      );
    }
  }

  private async requireConversation(workspaceId: string, conversationId: string) {
    const conversation = await this.data.getResearchChatConversation(workspaceId, conversationId);
    if (!conversation) throw new LibraryError('NOT_FOUND', 'The Research Chat no longer exists.');
    return conversation;
  }

  private removeExpiredPreviews(): void {
    const now = Date.now();
    for (const [id, { preview }] of this.prepared) {
      if (Date.parse(preview.expiresAt) <= now) this.prepared.delete(id);
    }
  }

  private emit(active: ActiveRequest, event: ResearchChatStreamEvent): void {
    try {
      active.emit(event);
    } catch {
      // A closed Renderer cannot turn a completed provider request into a service failure.
    }
  }
}
