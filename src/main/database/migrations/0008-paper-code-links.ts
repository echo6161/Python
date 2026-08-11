import type { DatabaseMigration } from './types';

export const paperCodeLinksMigration: DatabaseMigration = {
  version: 8,
  name: 'paper-code-links',
  sql: `
    CREATE TABLE paper_code_links (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      zotero_server_id TEXT NOT NULL,
      zotero_library_type TEXT NOT NULL CHECK (zotero_library_type IN ('user', 'group')),
      zotero_library_id TEXT NOT NULL,
      zotero_item_key TEXT NOT NULL,
      zotero_item_version INTEGER NOT NULL CHECK (zotero_item_version >= 0),
      paper_snapshot_identity TEXT NOT NULL CHECK (length(paper_snapshot_identity) BETWEEN 1 AND 300),
      page_number INTEGER CHECK (page_number IS NULL OR page_number >= 1),
      location_label TEXT NOT NULL CHECK (length(location_label) <= 300),
      text_anchor_exact TEXT CHECK (text_anchor_exact IS NULL OR length(text_anchor_exact) BETWEEN 1 AND 2000),
      text_anchor_prefix TEXT CHECK (text_anchor_prefix IS NULL OR length(text_anchor_prefix) <= 500),
      text_anchor_suffix TEXT CHECK (text_anchor_suffix IS NULL OR length(text_anchor_suffix) <= 500),
      repository_id TEXT NOT NULL,
      code_snapshot_identity TEXT NOT NULL CHECK (length(code_snapshot_identity) BETWEEN 1 AND 300),
      code_language TEXT NOT NULL CHECK (code_language IN ('python', 'javascript', 'typescript', 'unsupported')),
      relative_path TEXT NOT NULL CHECK (length(relative_path) BETWEEN 1 AND 4096),
      symbol_kind TEXT CHECK (symbol_kind IS NULL OR symbol_kind IN ('module', 'class', 'function', 'method', 'interface', 'type', 'import', 'export')),
      symbol_name TEXT CHECK (symbol_name IS NULL OR length(symbol_name) BETWEEN 1 AND 500),
      start_line INTEGER NOT NULL CHECK (start_line >= 1),
      end_line INTEGER NOT NULL CHECK (end_line >= start_line),
      content_hash TEXT NOT NULL CHECK (length(content_hash) = 64 AND lower(content_hash) NOT GLOB '*[^0-9a-f]*'),
      relation_type TEXT NOT NULL CHECK (relation_type IN ('implements', 'corresponds_to', 'extends', 'uses')),
      label TEXT NOT NULL CHECK (length(label) <= 300),
      description TEXT NOT NULL CHECK (length(description) <= 4000),
      provenance TEXT NOT NULL CHECK (provenance IN ('manual', 'ai_proposed_confirmed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
      UNIQUE (id, workspace_id),
      CHECK (
        page_number IS NOT NULL OR length(trim(location_label)) > 0 OR text_anchor_exact IS NOT NULL
      ),
      CHECK (
        (symbol_kind IS NULL AND symbol_name IS NULL)
        OR (symbol_kind IS NOT NULL AND symbol_name IS NOT NULL)
      )
    ) STRICT;

    CREATE INDEX paper_code_links_workspace_idx
      ON paper_code_links(workspace_id, updated_at DESC);
    CREATE INDEX paper_code_links_paper_idx
      ON paper_code_links(workspace_id, zotero_server_id, zotero_library_type,
        zotero_library_id, zotero_item_key);
    CREATE INDEX paper_code_links_code_idx
      ON paper_code_links(workspace_id, repository_id, relative_path, start_line);
  `,
};
