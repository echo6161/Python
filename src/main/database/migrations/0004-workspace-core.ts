import type { DatabaseMigration } from './types';

export const workspaceCoreMigration: DatabaseMigration = {
  version: 4,
  name: 'workspace-core-and-zotero-references',
  sql: `
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
      description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
      research_goal TEXT NOT NULL DEFAULT '' CHECK (length(research_goal) <= 10000),
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1)
    ) STRICT;

    CREATE INDEX workspaces_status_updated_idx
      ON workspaces(status, updated_at DESC, id ASC);

    CREATE TABLE zotero_item_references (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL CHECK (length(server_id) BETWEEN 8 AND 128),
      library_type TEXT NOT NULL CHECK (library_type IN ('user', 'group')),
      library_id TEXT NOT NULL CHECK (
        length(library_id) > 0 AND library_id NOT GLOB '*[^0-9]*'
      ),
      item_key TEXT NOT NULL CHECK (
        length(item_key) = 8
        AND item_key NOT GLOB '*[^23456789ABCDEFGHIJKLMNPQRSTUVWXYZ]*'
      ),
      created_at TEXT NOT NULL,
      UNIQUE(server_id, library_type, library_id, item_key)
    ) STRICT;

    CREATE TABLE workspace_zotero_items (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      zotero_ref_id TEXT NOT NULL REFERENCES zotero_item_references(id) ON DELETE RESTRICT,
      added_at TEXT NOT NULL,
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      PRIMARY KEY (workspace_id, zotero_ref_id),
      UNIQUE (workspace_id, sort_order)
    ) STRICT;

    CREATE INDEX workspace_zotero_items_ref_idx
      ON workspace_zotero_items(zotero_ref_id, workspace_id);

    CREATE TABLE workspace_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_active_workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    INSERT INTO workspace_state (id, last_active_workspace_id, updated_at)
    VALUES (1, NULL, '1970-01-01T00:00:00.000Z');
  `,
};
