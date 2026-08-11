import type { DatabaseMigration } from './types';

export const researchQuestionsEvidenceMigration: DatabaseMigration = {
  version: 7,
  name: 'research-questions-and-typed-evidence',
  sql: `
    CREATE TABLE research_questions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
      description TEXT NOT NULL CHECK (length(description) <= 10000),
      status TEXT NOT NULL CHECK (status IN ('unresolved', 'investigating', 'blocked', 'understood', 'closed')),
      priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'critical')),
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
      UNIQUE (id, workspace_id)
    ) STRICT;

    CREATE INDEX research_questions_workspace_idx
      ON research_questions(workspace_id, archived_at, updated_at DESC);

    CREATE TABLE question_evidence (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('zotero_paper', 'code')),
      note TEXT NOT NULL CHECK (length(note) <= 4000),
      source_snapshot_identity TEXT NOT NULL CHECK (length(source_snapshot_identity) BETWEEN 1 AND 300),
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      created_at TEXT NOT NULL,
      zotero_server_id TEXT,
      zotero_library_type TEXT CHECK (zotero_library_type IS NULL OR zotero_library_type IN ('user', 'group')),
      zotero_library_id TEXT,
      zotero_item_key TEXT,
      zotero_item_version INTEGER CHECK (zotero_item_version IS NULL OR zotero_item_version >= 0),
      page_number INTEGER CHECK (page_number IS NULL OR page_number >= 1),
      text_anchor_exact TEXT CHECK (text_anchor_exact IS NULL OR length(text_anchor_exact) BETWEEN 1 AND 2000),
      text_anchor_prefix TEXT CHECK (text_anchor_prefix IS NULL OR length(text_anchor_prefix) <= 500),
      text_anchor_suffix TEXT CHECK (text_anchor_suffix IS NULL OR length(text_anchor_suffix) <= 500),
      repository_id TEXT,
      code_language TEXT CHECK (code_language IS NULL OR code_language IN ('python', 'javascript', 'typescript', 'unsupported')),
      relative_path TEXT CHECK (relative_path IS NULL OR length(relative_path) BETWEEN 1 AND 4096),
      symbol_kind TEXT CHECK (symbol_kind IS NULL OR symbol_kind IN ('module', 'class', 'function', 'method', 'interface', 'type', 'import', 'export')),
      symbol_name TEXT CHECK (symbol_name IS NULL OR length(symbol_name) BETWEEN 1 AND 500),
      start_line INTEGER CHECK (start_line IS NULL OR start_line >= 1),
      end_line INTEGER CHECK (end_line IS NULL OR end_line >= start_line),
      content_hash TEXT CHECK (content_hash IS NULL OR (length(content_hash) = 64 AND lower(content_hash) NOT GLOB '*[^0-9a-f]*')),
      FOREIGN KEY (question_id, workspace_id) REFERENCES research_questions(id, workspace_id) ON DELETE CASCADE,
      UNIQUE (question_id, sort_order),
      CHECK (
        (kind = 'zotero_paper' AND zotero_server_id IS NOT NULL AND zotero_library_type IS NOT NULL
          AND zotero_library_id IS NOT NULL AND zotero_item_key IS NOT NULL
          AND zotero_item_version IS NOT NULL AND repository_id IS NULL AND relative_path IS NULL)
        OR
        (kind = 'code' AND repository_id IS NOT NULL AND code_language IS NOT NULL
          AND relative_path IS NOT NULL AND start_line IS NOT NULL AND end_line IS NOT NULL
          AND content_hash IS NOT NULL AND zotero_server_id IS NULL AND zotero_item_key IS NULL)
      ),
      CHECK (
        (symbol_kind IS NULL AND symbol_name IS NULL)
        OR (symbol_kind IS NOT NULL AND symbol_name IS NOT NULL)
      )
    ) STRICT;

    CREATE INDEX question_evidence_question_idx
      ON question_evidence(question_id, sort_order);
    CREATE INDEX question_evidence_repository_idx
      ON question_evidence(repository_id) WHERE repository_id IS NOT NULL;
  `,
};
