import type { DatabaseMigration } from './types';

export const codeIntelligenceMigration: DatabaseMigration = {
  version: 6,
  name: 'disposable-code-intelligence-index',
  sql: `
    CREATE TABLE code_index_states (
      repository_id TEXT PRIMARY KEY REFERENCES repository_references(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('indexing', 'ready', 'cancelled', 'failed', 'stale')),
      snapshot_identity TEXT CHECK (snapshot_identity IS NULL OR length(snapshot_identity) BETWEEN 1 AND 200),
      dirty INTEGER NOT NULL DEFAULT 0 CHECK (dirty IN (0, 1)),
      parser_version TEXT NOT NULL CHECK (length(parser_version) BETWEEN 1 AND 100),
      file_count INTEGER NOT NULL DEFAULT 0 CHECK (file_count >= 0),
      symbol_count INTEGER NOT NULL DEFAULT 0 CHECK (symbol_count >= 0),
      chunk_count INTEGER NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
      processed_files INTEGER NOT NULL DEFAULT 0 CHECK (processed_files >= 0),
      total_files INTEGER NOT NULL DEFAULT 0 CHECK (total_files >= 0),
      active_request_id TEXT,
      last_error_code TEXT CHECK (last_error_code IS NULL OR length(last_error_code) <= 100),
      last_error_message TEXT CHECK (last_error_message IS NULL OR length(last_error_message) <= 500),
      started_at TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE code_index_files (
      id TEXT PRIMARY KEY,
      repository_id TEXT NOT NULL REFERENCES repository_references(id) ON DELETE CASCADE,
      relative_path TEXT NOT NULL CHECK (length(relative_path) BETWEEN 1 AND 4096),
      language TEXT NOT NULL CHECK (language IN ('python', 'javascript', 'typescript', 'unsupported')),
      snapshot_identity TEXT NOT NULL CHECK (length(snapshot_identity) BETWEEN 1 AND 200),
      content_hash TEXT NOT NULL CHECK (length(content_hash) = 64 AND lower(content_hash) NOT GLOB '*[^0-9a-f]*'),
      parser_version TEXT NOT NULL CHECK (length(parser_version) BETWEEN 1 AND 100),
      parse_mode TEXT NOT NULL CHECK (parse_mode IN ('structured', 'fallback')),
      byte_size INTEGER NOT NULL CHECK (byte_size >= 0 AND byte_size <= 1048576),
      line_count INTEGER NOT NULL CHECK (line_count >= 0),
      indexed_at TEXT NOT NULL,
      UNIQUE (repository_id, relative_path)
    ) STRICT;

    CREATE INDEX code_index_files_repository_idx
      ON code_index_files(repository_id, relative_path);

    CREATE TABLE code_index_symbols (
      id TEXT PRIMARY KEY,
      repository_id TEXT NOT NULL REFERENCES repository_references(id) ON DELETE CASCADE,
      file_id TEXT NOT NULL REFERENCES code_index_files(id) ON DELETE CASCADE,
      snapshot_identity TEXT NOT NULL CHECK (length(snapshot_identity) BETWEEN 1 AND 200),
      symbol_kind TEXT NOT NULL CHECK (symbol_kind IN ('module', 'class', 'function', 'method', 'interface', 'type', 'import', 'export')),
      name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 500),
      qualified_name TEXT NOT NULL CHECK (length(qualified_name) BETWEEN 1 AND 1000),
      start_line INTEGER NOT NULL CHECK (start_line >= 1),
      end_line INTEGER NOT NULL CHECK (end_line >= start_line),
      content_hash TEXT NOT NULL CHECK (length(content_hash) = 64 AND lower(content_hash) NOT GLOB '*[^0-9a-f]*'),
      parser_version TEXT NOT NULL CHECK (length(parser_version) BETWEEN 1 AND 100)
    ) STRICT;

    CREATE INDEX code_index_symbols_search_idx
      ON code_index_symbols(repository_id, name COLLATE NOCASE, qualified_name COLLATE NOCASE);

    CREATE TABLE code_index_chunks (
      id TEXT PRIMARY KEY,
      repository_id TEXT NOT NULL REFERENCES repository_references(id) ON DELETE CASCADE,
      file_id TEXT NOT NULL REFERENCES code_index_files(id) ON DELETE CASCADE,
      symbol_id TEXT REFERENCES code_index_symbols(id) ON DELETE SET NULL,
      snapshot_identity TEXT NOT NULL CHECK (length(snapshot_identity) BETWEEN 1 AND 200),
      start_line INTEGER NOT NULL CHECK (start_line >= 1),
      end_line INTEGER NOT NULL CHECK (end_line >= start_line),
      content_hash TEXT NOT NULL CHECK (length(content_hash) = 64 AND lower(content_hash) NOT GLOB '*[^0-9a-f]*'),
      parser_version TEXT NOT NULL CHECK (length(parser_version) BETWEEN 1 AND 100),
      content TEXT NOT NULL CHECK (length(content) <= 65536)
    ) STRICT;

    CREATE INDEX code_index_chunks_file_idx
      ON code_index_chunks(repository_id, file_id, start_line);

    CREATE VIRTUAL TABLE code_index_text_fts USING fts5(
      content,
      repository_id UNINDEXED,
      chunk_id UNINDEXED,
      relative_path UNINDEXED,
      tokenize = 'unicode61'
    );

    CREATE TRIGGER code_index_chunks_fts_insert
    AFTER INSERT ON code_index_chunks
    BEGIN
      INSERT INTO code_index_text_fts(content, repository_id, chunk_id, relative_path)
      SELECT new.content, new.repository_id, new.id, relative_path
      FROM code_index_files WHERE id = new.file_id;
    END;

    CREATE TRIGGER code_index_chunks_fts_delete
    AFTER DELETE ON code_index_chunks
    BEGIN
      DELETE FROM code_index_text_fts WHERE chunk_id = old.id;
    END;

    CREATE TRIGGER code_index_chunks_fts_update
    AFTER UPDATE OF content ON code_index_chunks
    BEGIN
      DELETE FROM code_index_text_fts WHERE chunk_id = old.id;
      INSERT INTO code_index_text_fts(content, repository_id, chunk_id, relative_path)
      SELECT new.content, new.repository_id, new.id, relative_path
      FROM code_index_files WHERE id = new.file_id;
    END;
  `,
};
