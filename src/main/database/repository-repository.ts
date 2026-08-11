import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type {
  RepositoryAvailability,
  RepositoryKind,
  RepositoryRef,
  RepositoryRemoteSummary,
  WorkspaceRepositoryRef,
} from '../../shared/contracts/repository';
import { LibraryError } from '../library/errors';
import type { RepositoryObservationInput } from '../repository/repository-data-gateway';

interface RepositoryRow {
  readonly id: string;
  readonly display_name: string;
  readonly canonical_root: string;
  readonly kind: RepositoryKind;
  readonly git_root: string | null;
  readonly current_branch: string | null;
  readonly head_commit: string | null;
  readonly remote_summary_json: string;
  readonly availability: RepositoryAvailability;
  readonly last_error_code: string | null;
  readonly last_observed_at: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface WorkspaceRepositoryRow extends RepositoryRow {
  readonly workspace_id: string;
  readonly added_at: string;
  readonly sort_order: number;
}

const SELECT_REPOSITORY = `
  SELECT id, display_name, canonical_root, kind, git_root, current_branch, head_commit,
         remote_summary_json, availability, last_error_code, last_observed_at,
         created_at, updated_at, row_version
  FROM repository_references
`;

export class RepositoryRepository {
  public constructor(private readonly database: Database.Database) {}

  public createOrUpdate(input: RepositoryObservationInput): RepositoryRef {
    const existing = this.database
      .prepare('SELECT id FROM repository_references WHERE canonical_key = ?')
      .get(input.canonicalKey) as { readonly id: string } | undefined;
    if (existing) {
      this.database
        .prepare(
          `UPDATE repository_references
           SET display_name = ?, canonical_root = ?, kind = ?, git_root = ?,
               current_branch = ?, head_commit = ?, remote_summary_json = ?,
               availability = ?, last_error_code = ?, last_observed_at = ?, updated_at = ?,
               row_version = row_version + 1
           WHERE id = ?`,
        )
        .run(
          input.displayName,
          input.canonicalRoot,
          input.kind,
          input.gitRoot,
          input.currentBranch,
          input.headCommit,
          serializeRemotes(input.remotes),
          input.availability,
          input.lastErrorCode,
          input.observedAt,
          input.observedAt,
          existing.id,
        );
      return this.require(existing.id);
    }
    const id = randomUUID();
    this.database
      .prepare(
        `INSERT INTO repository_references (
           id, display_name, canonical_root, canonical_key, kind, git_root, current_branch,
           head_commit, remote_summary_json, availability, last_error_code, last_observed_at,
           created_at, updated_at, row_version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .run(
        id,
        input.displayName,
        input.canonicalRoot,
        input.canonicalKey,
        input.kind,
        input.gitRoot,
        input.currentBranch,
        input.headCommit,
        serializeRemotes(input.remotes),
        input.availability,
        input.lastErrorCode,
        input.observedAt,
        input.observedAt,
        input.observedAt,
      );
    return this.require(id);
  }

  public get(id: string): RepositoryRef | null {
    const row = this.database.prepare(`${SELECT_REPOSITORY} WHERE id = ?`).get(id) as
      RepositoryRow | undefined;
    return row ? mapRepository(row) : null;
  }

  public updateObservation(
    id: string,
    input: Omit<RepositoryObservationInput, 'canonicalKey' | 'canonicalRoot' | 'displayName'>,
  ): RepositoryRef {
    const result = this.database
      .prepare(
        `UPDATE repository_references
         SET kind = ?, git_root = ?, current_branch = ?, head_commit = ?,
             remote_summary_json = ?, availability = ?, last_error_code = ?,
             last_observed_at = ?, updated_at = ?, row_version = row_version + 1
         WHERE id = ?`,
      )
      .run(
        input.kind,
        input.gitRoot,
        input.currentBranch,
        input.headCommit,
        serializeRemotes(input.remotes),
        input.availability,
        input.lastErrorCode,
        input.observedAt,
        input.observedAt,
        id,
      );
    if (result.changes !== 1) throw new LibraryError('NOT_FOUND', 'Repository reference missing.');
    return this.require(id);
  }

  public addToWorkspace(workspaceId: string, repositoryId: string): WorkspaceRepositoryRef {
    const add = this.database.transaction(() => {
      const workspace = this.database
        .prepare('SELECT status FROM workspaces WHERE id = ?')
        .get(workspaceId) as { readonly status: string } | undefined;
      if (!workspace) throw new LibraryError('NOT_FOUND', 'The Workspace no longer exists.');
      if (workspace.status === 'archived') {
        throw new LibraryError('CONFLICT', 'Archived Workspaces cannot be changed.');
      }
      this.require(repositoryId);
      const duplicate = this.database
        .prepare(
          'SELECT 1 FROM workspace_repositories WHERE workspace_id = ? AND repository_id = ?',
        )
        .get(workspaceId, repositoryId);
      if (duplicate) {
        throw new LibraryError('CONFLICT', 'That repository is already in this Workspace.');
      }
      const order = this.database
        .prepare(
          `SELECT coalesce(max(sort_order), -1) + 1 AS next_order
           FROM workspace_repositories WHERE workspace_id = ?`,
        )
        .get(workspaceId) as { readonly next_order: number };
      const addedAt = new Date().toISOString();
      this.database
        .prepare(
          `INSERT INTO workspace_repositories (workspace_id, repository_id, added_at, sort_order)
           VALUES (?, ?, ?, ?)`,
        )
        .run(workspaceId, repositoryId, addedAt, order.next_order);
      return { ...this.require(repositoryId), workspaceId, addedAt, sortOrder: order.next_order };
    });
    return add();
  }

  public removeFromWorkspace(workspaceId: string, repositoryId: string): boolean {
    return (
      this.database
        .prepare('DELETE FROM workspace_repositories WHERE workspace_id = ? AND repository_id = ?')
        .run(workspaceId, repositoryId).changes === 1
    );
  }

  public listForWorkspace(workspaceId: string): readonly WorkspaceRepositoryRef[] {
    const workspace = this.database
      .prepare('SELECT 1 FROM workspaces WHERE id = ?')
      .get(workspaceId);
    if (!workspace) throw new LibraryError('NOT_FOUND', 'The Workspace no longer exists.');
    const rows = this.database
      .prepare(
        `SELECT rr.id, rr.display_name, rr.canonical_root, rr.kind, rr.git_root,
                rr.current_branch, rr.head_commit, rr.remote_summary_json, rr.availability,
                rr.last_error_code, rr.last_observed_at, rr.created_at, rr.updated_at,
                rr.row_version, wr.workspace_id, wr.added_at, wr.sort_order
         FROM workspace_repositories wr
         JOIN repository_references rr ON rr.id = wr.repository_id
         WHERE wr.workspace_id = ?
         ORDER BY wr.sort_order ASC
         LIMIT 100`,
      )
      .all(workspaceId) as WorkspaceRepositoryRow[];
    return rows.map((row) => ({
      ...mapRepository(row),
      workspaceId: row.workspace_id,
      addedAt: row.added_at,
      sortOrder: row.sort_order,
    }));
  }

  public delete(id: string): boolean {
    return (
      this.database.prepare('DELETE FROM repository_references WHERE id = ?').run(id).changes === 1
    );
  }

  private require(id: string): RepositoryRef {
    const repository = this.get(id);
    if (!repository) throw new LibraryError('NOT_FOUND', 'Repository reference missing.');
    return repository;
  }
}

function mapRepository(row: RepositoryRow): RepositoryRef {
  return {
    id: row.id,
    displayName: row.display_name,
    canonicalRoot: row.canonical_root,
    kind: row.kind,
    gitRoot: row.git_root,
    currentBranch: row.current_branch,
    headCommit: row.head_commit,
    remotes: parseRemotes(row.remote_summary_json),
    availability: row.availability,
    lastErrorCode: row.last_error_code,
    lastObservedAt: row.last_observed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}

function serializeRemotes(remotes: readonly RepositoryRemoteSummary[]): string {
  return JSON.stringify(remotes.slice(0, 20));
}

function parseRemotes(value: string): readonly RepositoryRemoteSummary[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[]).filter(isRemoteSummary);
  } catch {
    return [];
  }
}

function isRemoteSummary(value: unknown): value is RepositoryRemoteSummary {
  if (typeof value !== 'object' || value === null) return false;
  const remote = value as Record<string, unknown>;
  return typeof remote.name === 'string' && typeof remote.url === 'string';
}
