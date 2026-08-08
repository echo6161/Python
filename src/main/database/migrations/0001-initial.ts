import type { DatabaseMigration } from './types';

export const initialMigration: DatabaseMigration = {
  version: 1,
  name: 'initial-library-schema',
  sql: `
CREATE TABLE papers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  abstract TEXT,
  year INTEGER CHECK (year IS NULL OR year BETWEEN 1000 AND 9999),
  doi TEXT,
  venue TEXT,
  language TEXT,
  status TEXT NOT NULL CHECK (status IN ('importing', 'ready', 'failed', 'trashed')),
  active_file_id TEXT REFERENCES paper_files(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  metadata_source TEXT NOT NULL CHECK (metadata_source IN ('manual', 'pdf', 'doi', 'mixed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  trashed_at TEXT,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1)
) STRICT;

CREATE TABLE paper_files (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  sha256 TEXT NOT NULL UNIQUE CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  relative_path TEXT NOT NULL UNIQUE,
  internal_filename TEXT NOT NULL,
  original_filename TEXT NOT NULL CHECK (length(original_filename) BETWEEN 1 AND 255),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  mime_type TEXT NOT NULL CHECK (mime_type = 'application/pdf'),
  pdf_version TEXT,
  page_count INTEGER CHECK (page_count IS NULL OR page_count > 0),
  is_encrypted INTEGER NOT NULL DEFAULT 0 CHECK (is_encrypted IN (0, 1)),
  imported_at TEXT NOT NULL,
  verified_at TEXT
) STRICT;

CREATE TABLE authors (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 300),
  normalized_name TEXT NOT NULL,
  orcid TEXT UNIQUE,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE paper_authors (
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES authors(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position >= 0),
  role TEXT,
  PRIMARY KEY (paper_id, author_id),
  UNIQUE (paper_id, position)
) STRICT;

CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE collection_papers (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL,
  PRIMARY KEY (collection_id, paper_id)
) STRICT;

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  normalized_name TEXT NOT NULL UNIQUE,
  color TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE paper_tags (
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (paper_id, tag_id)
) STRICT;

CREATE TABLE annotations (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  paper_file_id TEXT NOT NULL REFERENCES paper_files(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('highlight', 'note')),
  color TEXT NOT NULL,
  body_markdown TEXT,
  exact_text TEXT NOT NULL,
  prefix_text TEXT,
  suffix_text TEXT,
  page_start INTEGER NOT NULL CHECK (page_start >= 1),
  page_end INTEGER NOT NULL CHECK (page_end >= page_start),
  text_spans_json TEXT NOT NULL,
  rects_json TEXT NOT NULL,
  anchor_status TEXT NOT NULL CHECK (anchor_status IN ('valid', 'reanchored', 'orphaned')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1)
) STRICT;

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('freeform', 'summary', 'structured', 'translation', 'explanation')),
  title TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('user', 'ai', 'ai_edited')),
  generator_metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1)
) STRICT;

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE ai_conversations (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
) STRICT;

CREATE TABLE ai_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system_record')),
  content_markdown TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('streaming', 'complete', 'failed', 'cancelled')),
  provider_request_id TEXT,
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  created_at TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX papers_doi_unique
  ON papers(lower(doi))
  WHERE doi IS NOT NULL AND length(trim(doi)) > 0;
CREATE INDEX papers_status_updated_idx ON papers(status, updated_at DESC);
CREATE INDEX papers_title_idx ON papers(title COLLATE NOCASE);
CREATE INDEX paper_files_paper_idx ON paper_files(paper_id);
CREATE INDEX paper_authors_author_idx ON paper_authors(author_id);
CREATE INDEX collection_papers_paper_idx ON collection_papers(paper_id);
CREATE INDEX paper_tags_tag_idx ON paper_tags(tag_id);
CREATE INDEX annotations_paper_idx ON annotations(paper_id, deleted_at);
CREATE INDEX notes_paper_idx ON notes(paper_id, updated_at DESC);
CREATE INDEX ai_conversations_paper_idx ON ai_conversations(paper_id, updated_at DESC);
CREATE INDEX ai_messages_conversation_idx ON ai_messages(conversation_id, created_at);

CREATE TRIGGER papers_active_file_insert_guard
BEFORE INSERT ON papers
WHEN NEW.active_file_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'active file must be assigned after paper creation');
END;

CREATE TRIGGER papers_active_file_update_guard
BEFORE UPDATE OF active_file_id ON papers
WHEN NEW.active_file_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM paper_files
    WHERE id = NEW.active_file_id AND paper_id = NEW.id
  )
BEGIN
  SELECT RAISE(ABORT, 'active file must belong to paper');
END;
`,
};
