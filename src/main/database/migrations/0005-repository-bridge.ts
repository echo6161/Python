import type { DatabaseMigration } from './types';

export const repositoryBridgeMigration: DatabaseMigration = {
  version: 5,
  name: 'repository-bridge-and-workspace-links',
  sql: `
    CREATE TABLE repository_references (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 200),
      canonical_root TEXT NOT NULL CHECK (length(canonical_root) BETWEEN 1 AND 32767),
      canonical_key TEXT NOT NULL UNIQUE CHECK (length(canonical_key) BETWEEN 1 AND 32767),
      kind TEXT NOT NULL CHECK (kind IN ('git', 'source_folder')),
      git_root TEXT CHECK (git_root IS NULL OR length(git_root) BETWEEN 1 AND 32767),
      current_branch TEXT CHECK (current_branch IS NULL OR length(current_branch) <= 1024),
      head_commit TEXT CHECK (
        head_commit IS NULL OR (
          length(head_commit) IN (40, 64)
          AND lower(head_commit) NOT GLOB '*[^0-9a-f]*'
        )
      ),
      remote_summary_json TEXT NOT NULL DEFAULT '[]'
        CHECK (length(remote_summary_json) <= 32768),
      availability TEXT NOT NULL
        CHECK (availability IN ('available', 'missing', 'permission_denied', 'unavailable')),
      last_error_code TEXT CHECK (last_error_code IS NULL OR length(last_error_code) <= 100),
      last_observed_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1)
    ) STRICT;

    CREATE INDEX repository_references_observed_idx
      ON repository_references(availability, last_observed_at DESC, id ASC);

    CREATE TABLE workspace_repositories (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      repository_id TEXT NOT NULL REFERENCES repository_references(id) ON DELETE CASCADE,
      added_at TEXT NOT NULL,
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      PRIMARY KEY (workspace_id, repository_id),
      UNIQUE (workspace_id, sort_order)
    ) STRICT;

    CREATE INDEX workspace_repositories_repository_idx
      ON workspace_repositories(repository_id, workspace_id);
  `,
};
