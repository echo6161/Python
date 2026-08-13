import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type { AiError, AiMessageStatus } from '../../shared/contracts/ai';
import type { KnowledgeProvenance, KnowledgeSourceType } from '../../shared/contracts/knowledge';
import type {
  ResearchChatContextPreview,
  ResearchChatContextSource,
  ResearchChatConversation,
  ResearchChatMessage,
} from '../../shared/contracts/research-chat';
import type {
  CreateResearchChatTurnInput,
  CreateResearchChatTurnResult,
  FinalizeResearchChatMessageInput,
  StoredResearchChatTurn,
} from '../research-chat/research-chat-data-gateway';
import { extractCitationAliases } from '../research-chat/citation-binding';
import { LibraryError } from '../library/errors';

interface ConversationRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly question_id: string | null;
  readonly title: string;
  readonly provider_id: string;
  readonly generation_provider_id: string;
  readonly model_name: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface MessageRow {
  readonly id: string;
  readonly role: 'assistant' | 'user';
  readonly content_markdown: string;
  readonly status: AiMessageStatus;
  readonly error_code: string | null;
  readonly error_message: string | null;
  readonly error_retryable: number | null;
  readonly created_at: string;
}

interface ContextRow {
  readonly id: string;
  readonly query: string;
  readonly source_types_json: string;
  readonly retrieval_version: string;
  readonly search_mode: 'hybrid' | 'keyword';
  readonly maximum_characters: number;
  readonly used_characters: number;
  readonly maximum_sources: number;
  readonly candidate_sources: number;
  readonly included_sources: number;
  readonly deduplicated_sources: number;
  readonly truncated_sources: number;
  readonly created_at: string;
  readonly question_id: string | null;
}

interface SourceRow {
  readonly alias: string;
  readonly chunk_id: string;
  readonly source_type: KnowledgeSourceType;
  readonly title: string;
  readonly snippet: string;
  readonly citation: string;
  readonly score: number;
  readonly stale: number;
  readonly unavailable_reason: string | null;
  readonly provenance_json: string;
}

const CONVERSATION_SELECT = `SELECT id, workspace_id, question_id, title, provider_id,
  generation_provider_id,
  model_name, created_at, updated_at FROM research_chat_conversations`;
const MESSAGE_SELECT = `SELECT id, role, content_markdown, status, error_code, error_message,
  error_retryable, created_at FROM research_chat_messages`;

export class ResearchChatRepository {
  public constructor(private readonly database: Database.Database) {}

  public createTurn(input: CreateResearchChatTurnInput): CreateResearchChatTurnResult {
    return this.database.transaction(() => {
      const now = new Date().toISOString();
      const conversationId = input.conversationId ?? randomUUID();
      if (input.conversationId) {
        const existing = this.getConversationRow(input.workspaceId, input.conversationId);
        if (!existing) throw new LibraryError('NOT_FOUND', 'The Research Chat no longer exists.');
        if (existing.question_id !== input.questionId) {
          throw new LibraryError(
            'INVALID_INPUT',
            'The chat is bound to another Research Question.',
          );
        }
        if (
          existing.model_name !== input.model ||
          existing.generation_provider_id !== input.providerId
        ) {
          throw new LibraryError(
            'CONFLICT',
            'Continue this chat with its original provider and model.',
          );
        }
      } else {
        this.database
          .prepare(
            `INSERT INTO research_chat_conversations
           (id, workspace_id, question_id, title, provider_id, generation_provider_id,
            model_name, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'openai', ?, ?, ?, ?)`,
          )
          .run(
            conversationId,
            input.workspaceId,
            input.questionId,
            input.title,
            input.providerId,
            input.model,
            now,
            now,
          );
      }

      const userMessageId = randomUUID();
      const assistantMessageId = randomUUID();
      const insertMessage = this.database.prepare(
        `INSERT INTO research_chat_messages
         (id, conversation_id, role, content_markdown, status, error_code, error_message,
          error_retryable, provider_request_id, input_tokens, output_tokens,
          retry_of_message_id, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
      );
      if (!input.retryOfMessageId) {
        insertMessage.run(
          userMessageId,
          conversationId,
          'user',
          input.userContent,
          'complete',
          null,
          now,
        );
      }
      insertMessage.run(
        assistantMessageId,
        conversationId,
        'assistant',
        '',
        'streaming',
        input.retryOfMessageId,
        now,
      );
      this.insertContext(assistantMessageId, input.context);
      this.database
        .prepare('UPDATE research_chat_conversations SET updated_at = ? WHERE id = ?')
        .run(now, conversationId);
      return {
        conversation: this.requireConversation(input.workspaceId, conversationId),
        assistantMessageId,
      };
    })();
  }

  public finalizeMessage(input: FinalizeResearchChatMessageInput): ResearchChatMessage {
    return this.database.transaction(() => {
      const result = this.database
        .prepare(
          `UPDATE research_chat_messages SET content_markdown = ?, status = ?, error_code = ?,
           error_message = ?, error_retryable = ?, provider_request_id = ?, input_tokens = ?,
           output_tokens = ? WHERE id = ? AND role = 'assistant' AND status = 'streaming'`,
        )
        .run(
          input.content,
          input.status,
          input.error?.code ?? null,
          input.error?.message ?? null,
          input.error ? Number(input.error.retryable) : null,
          input.providerRequestId,
          input.inputTokens,
          input.outputTokens,
          input.messageId,
        );
      if (result.changes !== 1) {
        throw new LibraryError('CONFLICT', 'The Research Chat response is already complete.');
      }
      this.database
        .prepare(
          `UPDATE research_chat_conversations SET updated_at = ?
         WHERE id = (SELECT conversation_id FROM research_chat_messages WHERE id = ?)`,
        )
        .run(new Date().toISOString(), input.messageId);
      return this.requireMessage(input.messageId);
    })();
  }

  public getLatestConversation(workspaceId: string, questionId: string | null) {
    const row = this.database
      .prepare(
        `${CONVERSATION_SELECT} WHERE workspace_id = ? AND question_id IS ?
       ORDER BY updated_at DESC, id DESC LIMIT 1`,
      )
      .get(workspaceId, questionId) as ConversationRow | undefined;
    return row ? this.mapConversation(row) : null;
  }

  public getConversation(workspaceId: string, conversationId: string) {
    const row = this.getConversationRow(workspaceId, conversationId);
    return row ? this.mapConversation(row) : null;
  }

  public getTurn(
    workspaceId: string,
    conversationId: string,
    assistantMessageId: string,
  ): StoredResearchChatTurn | null {
    const conversation = this.getConversation(workspaceId, conversationId);
    if (!conversation) return null;
    const assistantMessage = conversation.messages.find(
      (message) => message.id === assistantMessageId && message.role === 'assistant',
    );
    if (!assistantMessage) return null;
    const context = this.getContext(workspaceId, assistantMessageId);
    return context ? { conversation, assistantMessage, context } : null;
  }

  public getCitationSource(
    workspaceId: string,
    conversationId: string,
    messageId: string,
    alias: string,
  ): ResearchChatContextSource | null {
    const row = this.database
      .prepare(
        `SELECT s.alias, s.chunk_id, s.source_type, s.title, s.snippet, s.citation, s.score,
              s.stale, s.unavailable_reason, s.provenance_json
       FROM research_chat_context_sources s
       JOIN research_chat_contexts c ON c.id = s.context_id
       JOIN research_chat_messages m ON m.id = c.assistant_message_id
       JOIN research_chat_conversations v ON v.id = m.conversation_id
       WHERE v.workspace_id = ? AND v.id = ? AND m.id = ? AND s.alias = ?`,
      )
      .get(workspaceId, conversationId, messageId, alias) as SourceRow | undefined;
    return row ? mapSource(row) : null;
  }

  public markStaleMessages(): number {
    return this.database
      .prepare(
        `UPDATE research_chat_messages SET status = 'failed', error_code = 'PROVIDER',
       error_message = 'Generation was interrupted by an application restart.', error_retryable = 1
       WHERE role = 'assistant' AND status = 'streaming'`,
      )
      .run().changes;
  }

  private insertContext(assistantMessageId: string, context: ResearchChatContextPreview): void {
    const contextId = randomUUID();
    this.database
      .prepare(
        `INSERT INTO research_chat_contexts
       (id, assistant_message_id, query, source_types_json, retrieval_version, search_mode,
        maximum_characters, used_characters, maximum_sources, candidate_sources,
        included_sources, deduplicated_sources, truncated_sources, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        contextId,
        assistantMessageId,
        context.query,
        JSON.stringify(context.sourceTypes),
        context.retrievalVersion,
        context.searchMode,
        context.budget.maximumCharacters,
        context.budget.usedCharacters,
        context.budget.maximumSources,
        context.budget.candidateSources,
        context.budget.includedSources,
        context.budget.deduplicatedSources,
        context.budget.truncatedSources,
        context.createdAt,
      );
    const insert = this.database.prepare(
      `INSERT INTO research_chat_context_sources
       (context_id, alias, chunk_id, source_type, title, snippet, citation, score, stale,
        unavailable_reason, provenance_json, ordinal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    context.sources.forEach((source, ordinal) =>
      insert.run(
        contextId,
        source.alias,
        source.chunkId,
        source.sourceType,
        source.title,
        source.snippet,
        source.citation,
        source.score,
        Number(source.stale),
        source.unavailableReason,
        JSON.stringify(source.provenance),
        ordinal,
      ),
    );
  }

  private getContext(
    workspaceId: string,
    assistantMessageId: string,
  ): ResearchChatContextPreview | null {
    const row = this.database
      .prepare(
        `SELECT c.*, v.question_id FROM research_chat_contexts c
       JOIN research_chat_messages m ON m.id = c.assistant_message_id
       JOIN research_chat_conversations v ON v.id = m.conversation_id
       WHERE v.workspace_id = ? AND c.assistant_message_id = ?`,
      )
      .get(workspaceId, assistantMessageId) as ContextRow | undefined;
    if (!row) return null;
    const sources = this.database
      .prepare(
        `SELECT alias, chunk_id, source_type, title, snippet, citation, score, stale,
              unavailable_reason, provenance_json
       FROM research_chat_context_sources WHERE context_id = ? ORDER BY ordinal`,
      )
      .all(row.id) as SourceRow[];
    return {
      id: row.id,
      workspaceId,
      questionId: row.question_id,
      query: row.query,
      sourceTypes: parseJson(row.source_types_json) as ResearchChatContextPreview['sourceTypes'],
      retrievalVersion: row.retrieval_version,
      searchMode: row.search_mode,
      sources: sources.map(mapSource),
      budget: {
        maximumCharacters: row.maximum_characters,
        usedCharacters: row.used_characters,
        maximumSources: row.maximum_sources,
        candidateSources: row.candidate_sources,
        includedSources: row.included_sources,
        deduplicatedSources: row.deduplicated_sources,
        truncatedSources: row.truncated_sources,
      },
      createdAt: row.created_at,
      expiresAt: row.created_at,
    };
  }

  private getConversationRow(workspaceId: string, conversationId: string) {
    return (
      (this.database
        .prepare(`${CONVERSATION_SELECT} WHERE workspace_id = ? AND id = ?`)
        .get(workspaceId, conversationId) as ConversationRow | undefined) ?? null
    );
  }

  private requireConversation(workspaceId: string, conversationId: string) {
    const conversation = this.getConversation(workspaceId, conversationId);
    if (!conversation)
      throw new LibraryError('DATABASE_ERROR', 'The Research Chat could not be read.');
    return conversation;
  }

  private requireMessage(messageId: string): ResearchChatMessage {
    const row = this.database.prepare(`${MESSAGE_SELECT} WHERE id = ?`).get(messageId) as
      MessageRow | undefined;
    if (!row)
      throw new LibraryError('DATABASE_ERROR', 'The Research Chat message could not be read.');
    return this.mapMessage(row);
  }

  private mapConversation(row: ConversationRow): ResearchChatConversation {
    if (row.generation_provider_id !== 'openai' && row.generation_provider_id !== 'codex')
      throw new LibraryError('DATABASE_ERROR', 'Unsupported provider.');
    const messages = this.database
      .prepare(`${MESSAGE_SELECT} WHERE conversation_id = ? ORDER BY created_at, rowid`)
      .all(row.id) as MessageRow[];
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      questionId: row.question_id,
      title: row.title,
      providerId: row.generation_provider_id,
      model: row.model_name,
      messages: messages.map((message) => this.mapMessage(message)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapMessage(row: MessageRow): ResearchChatMessage {
    const context = row.role === 'assistant' ? this.getContextForMessage(row.id) : null;
    const aliases = extractCitationAliases(row.content_markdown);
    const sources = new Map((context?.sources ?? []).map((source) => [source.alias, source]));
    const citations = aliases.flatMap((alias) => {
      const source = sources.get(alias);
      return source ? [{ alias, source }] : [];
    });
    return {
      id: row.id,
      role: row.role,
      content: row.content_markdown,
      status: row.status,
      citations,
      unsupportedCitations: aliases.filter((alias) => !sources.has(alias)),
      error: mapError(row),
      createdAt: row.created_at,
    };
  }

  private getContextForMessage(
    messageId: string,
  ): { readonly sources: readonly ResearchChatContextSource[] } | null {
    const context = this.database
      .prepare('SELECT id FROM research_chat_contexts WHERE assistant_message_id = ?')
      .get(messageId) as { readonly id: string } | undefined;
    if (!context) return null;
    const rows = this.database
      .prepare(
        `SELECT alias, chunk_id, source_type, title, snippet, citation, score, stale,
       unavailable_reason, provenance_json FROM research_chat_context_sources
       WHERE context_id = ? ORDER BY ordinal`,
      )
      .all(context.id) as SourceRow[];
    return { sources: rows.map(mapSource) };
  }
}

function mapSource(row: SourceRow): ResearchChatContextSource {
  return {
    alias: row.alias,
    chunkId: row.chunk_id,
    sourceType: row.source_type,
    title: row.title,
    snippet: row.snippet,
    citation: row.citation,
    score: row.score,
    stale: row.stale === 1,
    unavailableReason: row.unavailable_reason,
    provenance: parseJson(row.provenance_json) as KnowledgeProvenance,
  };
}

function mapError(row: MessageRow): AiError | null {
  if (!row.error_code || !row.error_message) return null;
  return {
    code: row.error_code as AiError['code'],
    message: row.error_message,
    retryable: row.error_retryable === 1,
  };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new LibraryError('DATABASE_ERROR', 'Stored Research Chat context is invalid.', {
      cause: error,
    });
  }
}
