import type { DatabaseMigration } from './types';

export const readerAnnotationsMigration: DatabaseMigration = {
  version: 2,
  name: 'reader-annotations-and-state',
  sql: `
ALTER TABLE annotations RENAME TO annotations_v1;

CREATE TABLE annotations (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  paper_file_id TEXT NOT NULL REFERENCES paper_files(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('highlight', 'underline')),
  color TEXT NOT NULL CHECK (color IN ('yellow', 'green', 'blue', 'pink')),
  body_markdown TEXT,
  exact_text TEXT NOT NULL CHECK (length(exact_text) BETWEEN 1 AND 20000),
  prefix_text TEXT NOT NULL,
  suffix_text TEXT NOT NULL,
  page_start INTEGER NOT NULL CHECK (page_start >= 1),
  page_end INTEGER NOT NULL CHECK (page_end = page_start),
  text_spans_json TEXT NOT NULL CHECK (json_valid(text_spans_json)),
  rects_json TEXT NOT NULL CHECK (json_valid(rects_json)),
  anchor_status TEXT NOT NULL CHECK (anchor_status IN ('valid', 'reanchored', 'orphaned')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1)
) STRICT;

INSERT INTO annotations (
  id, paper_id, paper_file_id, kind, color, body_markdown, exact_text, prefix_text,
  suffix_text, page_start, page_end, text_spans_json, rects_json, anchor_status,
  created_at, updated_at, deleted_at, row_version
)
SELECT
  id, paper_id, paper_file_id,
  CASE WHEN kind = 'note' THEN 'highlight' ELSE kind END,
  CASE WHEN color IN ('yellow', 'green', 'blue', 'pink') THEN color ELSE 'yellow' END,
  body_markdown, exact_text, coalesce(prefix_text, ''), coalesce(suffix_text, ''),
  page_start, page_start, text_spans_json, rects_json, anchor_status,
  created_at, updated_at, deleted_at, row_version
FROM annotations_v1;

DROP TABLE annotations_v1;
CREATE INDEX annotations_paper_idx ON annotations(paper_id, deleted_at, page_start);

CREATE TRIGGER annotations_file_insert_guard
BEFORE INSERT ON annotations
WHEN NOT EXISTS (
  SELECT 1 FROM paper_files
  WHERE id = NEW.paper_file_id AND paper_id = NEW.paper_id
)
BEGIN
  SELECT RAISE(ABORT, 'annotation file must belong to paper');
END;

CREATE TRIGGER annotations_file_update_guard
BEFORE UPDATE OF paper_id, paper_file_id ON annotations
WHEN NOT EXISTS (
  SELECT 1 FROM paper_files
  WHERE id = NEW.paper_file_id AND paper_id = NEW.paper_id
)
BEGIN
  SELECT RAISE(ABORT, 'annotation file must belong to paper');
END;

CREATE TABLE reading_states (
  paper_id TEXT PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL CHECK (page_number >= 1),
  scale REAL NOT NULL CHECK (scale BETWEEN 0.25 AND 5.0),
  updated_at TEXT NOT NULL
) STRICT;
`,
};
