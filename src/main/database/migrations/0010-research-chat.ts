import type { DatabaseMigration } from './types';

export const researchChatMigration: DatabaseMigration = {
  version: 10,
  name: 'research-chat-context-builder',
  sql: `
    CREATE TABLE research_chat_conversations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      question_id TEXT REFERENCES research_questions(id) ON DELETE SET NULL,
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
      provider_id TEXT NOT NULL CHECK (provider_id = 'openai'),
      model_name TEXT NOT NULL CHECK (length(model_name) BETWEEN 1 AND 120),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX research_chat_conversations_workspace_updated
      ON research_chat_conversations(workspace_id, question_id, updated_at DESC);

    CREATE TABLE research_chat_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES research_chat_conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content_markdown TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('streaming', 'complete', 'failed', 'cancelled')),
      error_code TEXT,
      error_message TEXT,
      error_retryable INTEGER CHECK (error_retryable IS NULL OR error_retryable IN (0, 1)),
      provider_request_id TEXT,
      input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
      output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
      retry_of_message_id TEXT REFERENCES research_chat_messages(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX research_chat_messages_conversation
      ON research_chat_messages(conversation_id, created_at);

    CREATE TABLE research_chat_contexts (
      id TEXT PRIMARY KEY,
      assistant_message_id TEXT NOT NULL UNIQUE REFERENCES research_chat_messages(id) ON DELETE CASCADE,
      query TEXT NOT NULL CHECK (length(query) BETWEEN 1 AND 4000),
      source_types_json TEXT NOT NULL,
      retrieval_version TEXT NOT NULL,
      search_mode TEXT NOT NULL CHECK (search_mode IN ('keyword', 'hybrid')),
      maximum_characters INTEGER NOT NULL CHECK (maximum_characters > 0),
      used_characters INTEGER NOT NULL CHECK (used_characters >= 0),
      maximum_sources INTEGER NOT NULL CHECK (maximum_sources > 0),
      candidate_sources INTEGER NOT NULL CHECK (candidate_sources >= 0),
      included_sources INTEGER NOT NULL CHECK (included_sources >= 0),
      deduplicated_sources INTEGER NOT NULL CHECK (deduplicated_sources >= 0),
      truncated_sources INTEGER NOT NULL CHECK (truncated_sources >= 0),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE research_chat_context_sources (
      context_id TEXT NOT NULL REFERENCES research_chat_contexts(id) ON DELETE CASCADE,
      alias TEXT NOT NULL CHECK (length(alias) BETWEEN 2 AND 12),
      chunk_id TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK (source_type IN ('paper', 'code', 'question', 'link')),
      title TEXT NOT NULL,
      snippet TEXT NOT NULL CHECK (length(snippet) BETWEEN 1 AND 1200),
      citation TEXT NOT NULL,
      score REAL NOT NULL CHECK (score >= 0 AND score <= 1),
      stale INTEGER NOT NULL CHECK (stale IN (0, 1)),
      unavailable_reason TEXT,
      provenance_json TEXT NOT NULL,
      ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
      PRIMARY KEY (context_id, alias),
      UNIQUE (context_id, chunk_id)
    ) STRICT;
  `,
};
