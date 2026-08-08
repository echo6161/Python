import type { DatabaseMigration } from './types';

export const metadataOrganizationMigration: DatabaseMigration = {
  version: 3,
  name: 'paper-metadata-organization-and-search',
  sql: `
ALTER TABLE papers ADD COLUMN reading_status TEXT NOT NULL DEFAULT 'unread'
  CHECK (reading_status IN ('unread', 'reading', 'completed', 'shelved'));
ALTER TABLE papers ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0
  CHECK (is_favorite IN (0, 1));
ALTER TABLE papers ADD COLUMN metadata_review_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (metadata_review_status IN ('pending', 'confirmed'));

ALTER TABLE paper_files ADD COLUMN text_extraction_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (text_extraction_status IN ('pending', 'succeeded', 'partial', 'failed'));
ALTER TABLE paper_files ADD COLUMN extraction_error_code TEXT;

CREATE TABLE paper_metadata_fields (
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL CHECK (field_name IN ('title', 'authors', 'abstract', 'year', 'doi')),
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  source TEXT NOT NULL CHECK (
    source IN ('manual', 'pdf_metadata', 'first_page', 'filename', 'legacy', 'none')
  ),
  confidence TEXT NOT NULL CHECK (
    confidence IN ('confirmed', 'high', 'medium', 'low', 'unconfirmed')
  ),
  user_edited INTEGER NOT NULL DEFAULT 0 CHECK (user_edited IN (0, 1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (paper_id, field_name)
) STRICT;

CREATE TABLE document_pages (
  paper_file_id TEXT NOT NULL REFERENCES paper_files(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL CHECK (page_number >= 1),
  normalized_text TEXT NOT NULL,
  text_hash TEXT NOT NULL CHECK (length(text_hash) = 64),
  extractor_version TEXT NOT NULL,
  extracted_at TEXT NOT NULL,
  PRIMARY KEY (paper_file_id, page_number)
) STRICT;

CREATE VIRTUAL TABLE paper_full_text USING fts5(
  paper_id UNINDEXED,
  page_number UNINDEXED,
  content,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE INDEX papers_reading_status_idx ON papers(reading_status, updated_at DESC);
CREATE INDEX papers_favorite_idx ON papers(is_favorite, updated_at DESC);
CREATE INDEX document_pages_file_idx ON document_pages(paper_file_id, page_number);

INSERT INTO paper_metadata_fields (
  paper_id, field_name, value_json, source, confidence, user_edited, updated_at
)
SELECT id, 'title', json_quote(title),
       CASE WHEN row_version > 1 THEN 'manual' ELSE 'filename' END,
       CASE WHEN row_version > 1 THEN 'confirmed' ELSE 'unconfirmed' END,
       CASE WHEN row_version > 1 THEN 1 ELSE 0 END, updated_at FROM papers;

INSERT INTO paper_metadata_fields (
  paper_id, field_name, value_json, source, confidence, user_edited, updated_at
)
SELECT id, 'abstract', CASE WHEN abstract IS NULL THEN 'null' ELSE json_quote(abstract) END,
       CASE WHEN row_version > 1 THEN 'manual' ELSE 'none' END,
       CASE WHEN row_version > 1 THEN 'confirmed' ELSE 'unconfirmed' END,
       CASE WHEN row_version > 1 THEN 1 ELSE 0 END, updated_at FROM papers;

INSERT INTO paper_metadata_fields (
  paper_id, field_name, value_json, source, confidence, user_edited, updated_at
)
SELECT id, 'year', CASE WHEN year IS NULL THEN 'null' ELSE CAST(year AS TEXT) END,
       CASE WHEN row_version > 1 THEN 'manual' ELSE 'none' END,
       CASE WHEN row_version > 1 THEN 'confirmed' ELSE 'unconfirmed' END,
       CASE WHEN row_version > 1 THEN 1 ELSE 0 END, updated_at FROM papers;

INSERT INTO paper_metadata_fields (
  paper_id, field_name, value_json, source, confidence, user_edited, updated_at
)
SELECT id, 'doi', CASE WHEN doi IS NULL THEN 'null' ELSE json_quote(doi) END,
       CASE WHEN row_version > 1 THEN 'manual' ELSE 'none' END,
       CASE WHEN row_version > 1 THEN 'confirmed' ELSE 'unconfirmed' END,
       CASE WHEN row_version > 1 THEN 1 ELSE 0 END, updated_at FROM papers;

INSERT INTO paper_metadata_fields (
  paper_id, field_name, value_json, source, confidence, user_edited, updated_at
)
SELECT p.id, 'authors', COALESCE((
  SELECT json_group_array(display_name)
  FROM (
    SELECT a.display_name
    FROM authors a
    JOIN paper_authors pa ON pa.author_id = a.id
    WHERE pa.paper_id = p.id
    ORDER BY pa.position
  )
), '[]'),
CASE WHEN EXISTS (
  SELECT 1 FROM paper_authors pa WHERE pa.paper_id = p.id
) THEN 'legacy' ELSE 'none' END,
'unconfirmed', 0, p.updated_at
FROM papers p;

UPDATE papers
SET metadata_review_status = CASE WHEN row_version > 1 THEN 'confirmed' ELSE 'pending' END;
`,
};
