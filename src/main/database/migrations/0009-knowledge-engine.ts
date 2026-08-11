import type { DatabaseMigration } from './types';

export const knowledgeEngineMigration: DatabaseMigration = {
  version: 9,
  name: 'knowledge-engine',
  sql: `
    CREATE TABLE knowledge_index_states (
      workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('unindexed', 'indexing', 'ready', 'cancelled', 'failed', 'stale')),
      index_version TEXT NOT NULL,
      embedding_provider TEXT,
      source_count INTEGER NOT NULL DEFAULT 0 CHECK (source_count >= 0),
      chunk_count INTEGER NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
      processed_sources INTEGER NOT NULL DEFAULT 0 CHECK (processed_sources >= 0),
      total_sources INTEGER NOT NULL DEFAULT 0 CHECK (total_sources >= 0),
      active_request_id TEXT,
      last_error_code TEXT,
      last_error_message TEXT,
      started_at TEXT,
      completed_at TEXT,
      updated_at TEXT
    ) STRICT;

    CREATE TABLE knowledge_sources (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL CHECK (source_type IN ('paper', 'code', 'question', 'link')),
      source_identity TEXT NOT NULL,
      snapshot_identity TEXT NOT NULL,
      title TEXT NOT NULL,
      fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64 AND lower(fingerprint) NOT GLOB '*[^0-9a-f]*'),
      provenance_json TEXT NOT NULL,
      unavailable_reason TEXT,
      indexed_at TEXT NOT NULL,
      UNIQUE(workspace_id, source_type, source_identity)
    ) STRICT;

    CREATE INDEX knowledge_sources_workspace_type
      ON knowledge_sources(workspace_id, source_type, source_identity);

    CREATE TABLE knowledge_chunks (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL CHECK (source_type IN ('paper', 'code', 'question', 'link')),
      ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
      content_hash TEXT NOT NULL CHECK (length(content_hash) = 64 AND lower(content_hash) NOT GLOB '*[^0-9a-f]*'),
      content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 8000),
      citation TEXT NOT NULL CHECK (length(citation) BETWEEN 1 AND 500),
      provenance_json TEXT NOT NULL,
      embedding_json TEXT,
      UNIQUE(source_id, ordinal)
    ) STRICT;

    CREATE INDEX knowledge_chunks_workspace_type
      ON knowledge_chunks(workspace_id, source_type);

    CREATE VIRTUAL TABLE knowledge_chunks_fts USING fts5(
      content,
      chunk_id UNINDEXED,
      workspace_id UNINDEXED,
      source_type UNINDEXED,
      tokenize = 'unicode61 remove_diacritics 2'
    );

    CREATE TRIGGER knowledge_chunks_fts_insert AFTER INSERT ON knowledge_chunks BEGIN
      INSERT INTO knowledge_chunks_fts(content, chunk_id, workspace_id, source_type)
      VALUES (new.content, new.id, new.workspace_id, new.source_type);
    END;

    CREATE TRIGGER knowledge_chunks_fts_delete AFTER DELETE ON knowledge_chunks BEGIN
      DELETE FROM knowledge_chunks_fts WHERE chunk_id = old.id;
    END;

    CREATE TRIGGER knowledge_chunks_fts_update AFTER UPDATE OF content, workspace_id, source_type ON knowledge_chunks BEGIN
      DELETE FROM knowledge_chunks_fts WHERE chunk_id = old.id;
      INSERT INTO knowledge_chunks_fts(content, chunk_id, workspace_id, source_type)
      VALUES (new.content, new.id, new.workspace_id, new.source_type);
    END;
  `,
};
