import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type {
  AiConversation,
  AiMessage,
  AiMessageStatus,
  AiProviderSettings,
} from '../../shared/contracts/ai';
import type {
  CreateAiTurnInput,
  CreateAiTurnResult,
  FinalizeAiMessageInput,
} from '../ai/ai-data-gateway';
import { LibraryError } from '../library/errors';

const AI_SETTINGS_KEY = 'ai.openai.config.v1';

interface ConversationRow {
  readonly id: string;
  readonly paper_id: string;
  readonly title: string;
  readonly provider_id: string;
  readonly model_name: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface MessageRow {
  readonly id: string;
  readonly role: string;
  readonly content_markdown: string;
  readonly status: AiMessageStatus;
  readonly created_at: string;
}

interface SettingsRow {
  readonly value_json: string;
}

const CONVERSATION_SELECT = `
  SELECT id, paper_id, title, provider_id, model_name, created_at, updated_at
  FROM ai_conversations
`;

export class AiRepository {
  public constructor(private readonly database: Database.Database) {}

  public getSettings(): AiProviderSettings | null {
    const row = this.database
      .prepare('SELECT value_json FROM settings WHERE key = ?')
      .get(AI_SETTINGS_KEY) as SettingsRow | undefined;
    if (!row) return null;

    try {
      return this.parseSettings(JSON.parse(row.value_json) as unknown);
    } catch (error) {
      throw new LibraryError('DATABASE_ERROR', 'The saved AI settings are invalid.', {
        cause: error,
      });
    }
  }

  public saveSettings(settings: AiProviderSettings): AiProviderSettings {
    const persisted = this.sanitizeSettings(settings);
    this.database
      .prepare(
        `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`,
      )
      .run(AI_SETTINGS_KEY, JSON.stringify(persisted), new Date().toISOString());
    return persisted;
  }

  public createTurn(input: CreateAiTurnInput): CreateAiTurnResult {
    const create = this.database.transaction(() => {
      const now = new Date();
      const conversationId = input.conversationId ?? randomUUID();
      if (input.conversationId) {
        const existing = this.getConversationRow(input.conversationId);
        if (!existing) {
          throw new LibraryError('NOT_FOUND', 'The AI conversation no longer exists.');
        }
        if (existing.paper_id !== input.paperId) {
          throw new LibraryError('INVALID_INPUT', 'The conversation belongs to another paper.');
        }
        if (existing.provider_id !== input.providerId || existing.model_name !== input.model) {
          throw new LibraryError(
            'CONFLICT',
            'Continue this conversation with its original provider and model.',
          );
        }
      } else {
        this.database
          .prepare(
            `INSERT INTO ai_conversations (
               id, paper_id, title, provider_id, model_name, created_at, updated_at, deleted_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
          )
          .run(
            conversationId,
            input.paperId,
            input.title,
            input.providerId,
            input.model,
            now.toISOString(),
            now.toISOString(),
          );
      }

      const userMessageId = randomUUID();
      const assistantMessageId = randomUUID();
      const userCreatedAt = now.toISOString();
      const assistantCreatedAt = userCreatedAt;
      const insertMessage = this.database.prepare(
        `INSERT INTO ai_messages (
           id, conversation_id, role, content_markdown, status, provider_request_id,
           input_tokens, output_tokens, created_at
         ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`,
      );
      insertMessage.run(
        userMessageId,
        conversationId,
        'user',
        input.userContent,
        'complete',
        userCreatedAt,
      );
      insertMessage.run(
        assistantMessageId,
        conversationId,
        'assistant',
        '',
        'streaming',
        assistantCreatedAt,
      );
      this.database
        .prepare('UPDATE ai_conversations SET updated_at = ? WHERE id = ?')
        .run(assistantCreatedAt, conversationId);

      const conversation = this.getConversation(conversationId);
      if (!conversation) {
        throw new LibraryError('DATABASE_ERROR', 'The AI conversation could not be created.');
      }
      return { conversation, assistantMessageId };
    });

    return create();
  }

  public finalizeMessage(input: FinalizeAiMessageInput): AiMessage {
    const finalize = this.database.transaction(() => {
      const result = this.database
        .prepare(
          `UPDATE ai_messages
           SET content_markdown = ?, status = ?, provider_request_id = ?,
               input_tokens = ?, output_tokens = ?
           WHERE id = ? AND role = 'assistant' AND status = 'streaming'`,
        )
        .run(
          input.content,
          input.status,
          input.providerRequestId,
          input.inputTokens,
          input.outputTokens,
          input.messageId,
        );
      if (result.changes !== 1) {
        throw new LibraryError(
          'CONFLICT',
          'The AI response is missing or has already reached a terminal state.',
        );
      }
      this.database
        .prepare(
          `UPDATE ai_conversations
           SET updated_at = ?
           WHERE id = (SELECT conversation_id FROM ai_messages WHERE id = ?)`,
        )
        .run(new Date().toISOString(), input.messageId);

      const row = this.getMessageRow(input.messageId);
      if (!row) {
        throw new LibraryError('DATABASE_ERROR', 'The completed AI message could not be read.');
      }
      return this.mapMessage(row);
    });

    return finalize();
  }

  public getLatestConversation(paperId: string): AiConversation | null {
    const row = this.database
      .prepare(
        `${CONVERSATION_SELECT}
         WHERE paper_id = ? AND deleted_at IS NULL
         ORDER BY updated_at DESC, id DESC
         LIMIT 1`,
      )
      .get(paperId) as ConversationRow | undefined;
    return row ? this.mapConversation(row) : null;
  }

  public getConversation(conversationId: string): AiConversation | null {
    const row = this.getConversationRow(conversationId);
    return row ? this.mapConversation(row) : null;
  }

  public markStaleMessages(): number {
    const mark = this.database.transaction(() => {
      const result = this.database
        .prepare(
          `UPDATE ai_messages
           SET status = 'failed'
           WHERE role = 'assistant' AND status = 'streaming'`,
        )
        .run();
      return result.changes;
    });
    return mark();
  }

  private getConversationRow(conversationId: string): ConversationRow | null {
    return (
      (this.database
        .prepare(`${CONVERSATION_SELECT} WHERE id = ? AND deleted_at IS NULL`)
        .get(conversationId) as ConversationRow | undefined) ?? null
    );
  }

  private getMessageRow(messageId: string): MessageRow | null {
    return (
      (this.database
        .prepare(
          `SELECT id, role, content_markdown, status, created_at
           FROM ai_messages
           WHERE id = ? AND role IN ('user', 'assistant')`,
        )
        .get(messageId) as MessageRow | undefined) ?? null
    );
  }

  private mapConversation(row: ConversationRow): AiConversation {
    if (row.provider_id !== 'openai' && row.provider_id !== 'codex') {
      throw new LibraryError('DATABASE_ERROR', 'The AI conversation provider is unsupported.');
    }
    const messages = this.database
      .prepare(
        `SELECT id, role, content_markdown, status, created_at
         FROM (
           SELECT id, role, content_markdown, status, created_at, rowid AS message_order
           FROM ai_messages
           WHERE conversation_id = ? AND role IN ('user', 'assistant')
           ORDER BY created_at DESC, rowid DESC
           LIMIT 500
         )
         ORDER BY created_at, message_order`,
      )
      .all(row.id) as MessageRow[];
    return {
      id: row.id,
      paperId: row.paper_id,
      title: row.title,
      providerId: row.provider_id,
      model: row.model_name,
      messages: messages.map((message) => this.mapMessage(message)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      persisted: true,
    };
  }

  private mapMessage(row: MessageRow): AiMessage {
    if (row.role !== 'user' && row.role !== 'assistant') {
      throw new LibraryError('DATABASE_ERROR', 'The AI message role is invalid.');
    }
    return {
      id: row.id,
      role: row.role,
      content: row.content_markdown,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  private sanitizeSettings(settings: AiProviderSettings): AiProviderSettings {
    return {
      providerId: settings.providerId,
      baseUrl: settings.baseUrl,
      codexProxyUrl: settings.codexProxyUrl ?? null,
      model: settings.model,
      temperature: settings.temperature,
      maxOutputTokens: settings.maxOutputTokens,
      saveHistoryByDefault: settings.saveHistoryByDefault,
    };
  }

  private parseSettings(value: unknown): AiProviderSettings {
    if (!value || typeof value !== 'object') throw new Error('Expected an object.');
    const candidate = value as Record<string, unknown>;
    if (
      (candidate.providerId !== undefined &&
        candidate.providerId !== 'openai' &&
        candidate.providerId !== 'codex') ||
      typeof candidate.baseUrl !== 'string' ||
      (candidate.codexProxyUrl !== undefined &&
        candidate.codexProxyUrl !== null &&
        typeof candidate.codexProxyUrl !== 'string') ||
      typeof candidate.model !== 'string' ||
      typeof candidate.temperature !== 'number' ||
      typeof candidate.maxOutputTokens !== 'number' ||
      typeof candidate.saveHistoryByDefault !== 'boolean'
    ) {
      throw new Error('AI settings have an invalid shape.');
    }
    return {
      providerId: candidate.providerId === 'codex' ? 'codex' : 'openai',
      baseUrl: candidate.baseUrl,
      codexProxyUrl: typeof candidate.codexProxyUrl === 'string' ? candidate.codexProxyUrl : null,
      model: candidate.model,
      temperature: candidate.temperature,
      maxOutputTokens: candidate.maxOutputTokens,
      saveHistoryByDefault: candidate.saveHistoryByDefault,
    };
  }
}
