import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type {
  CreateWorkspaceInput,
  SetWorkspaceStatusInput,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceStatus,
} from '../../shared/contracts/workspace';
import type { ZoteroItemRef } from '../../shared/contracts/zotero';
import { LibraryError } from '../library/errors';
import type { StoredWorkspaceZoteroPaper } from '../workspace/workspace-data-gateway';

interface WorkspaceRow {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly research_goal: string;
  readonly status: WorkspaceStatus;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface WorkspacePaperRow {
  readonly workspace_id: string;
  readonly server_id: string;
  readonly library_type: ZoteroItemRef['library']['type'];
  readonly library_id: string;
  readonly item_key: string;
  readonly added_at: string;
  readonly sort_order: number;
}

const WORKSPACE_SELECT = `
  SELECT id, name, description, research_goal, status, created_at, updated_at, row_version
  FROM workspaces
`;

const WORKSPACE_PAPER_SELECT = `
  SELECT
    wzi.workspace_id,
    zir.server_id,
    zir.library_type,
    zir.library_id,
    zir.item_key,
    wzi.added_at,
    wzi.sort_order
  FROM workspace_zotero_items wzi
  JOIN zotero_item_references zir ON zir.id = wzi.zotero_ref_id
`;

export class WorkspaceRepository {
  public constructor(private readonly database: Database.Database) {}

  public create(input: CreateWorkspaceInput): Workspace {
    const id = randomUUID();
    const now = new Date().toISOString();
    const create = this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO workspaces (
             id, name, description, research_goal, status, created_at, updated_at, row_version
           ) VALUES (?, ?, ?, ?, 'active', ?, ?, 1)`,
        )
        .run(id, input.name, input.description, input.researchGoal, now, now);
      this.database
        .prepare(
          `UPDATE workspace_state
           SET last_active_workspace_id = ?, updated_at = ?
           WHERE id = 1 AND last_active_workspace_id IS NULL`,
        )
        .run(id, now);
      return this.require(id);
    });
    return create();
  }

  public get(id: string): Workspace | null {
    const row = this.database.prepare(`${WORKSPACE_SELECT} WHERE id = ?`).get(id) as
      WorkspaceRow | undefined;
    return row ? mapWorkspace(row) : null;
  }

  public list(): readonly Workspace[] {
    const rows = this.database
      .prepare(
        `${WORKSPACE_SELECT}
         ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
                  updated_at DESC,
                  id ASC`,
      )
      .all() as WorkspaceRow[];
    return rows.map(mapWorkspace);
  }

  public update(input: UpdateWorkspaceInput): Workspace {
    const result = this.database
      .prepare(
        `UPDATE workspaces
         SET name = ?, description = ?, research_goal = ?, updated_at = ?,
             row_version = row_version + 1
         WHERE id = ? AND row_version = ?`,
      )
      .run(
        input.name,
        input.description,
        input.researchGoal,
        new Date().toISOString(),
        input.id,
        input.rowVersion,
      );
    if (result.changes !== 1) this.throwMissingOrConflict(input.id);
    return this.require(input.id);
  }

  public setStatus(input: SetWorkspaceStatusInput): Workspace {
    const setStatus = this.database.transaction(() => {
      const now = new Date().toISOString();
      const result = this.database
        .prepare(
          `UPDATE workspaces
           SET status = ?, updated_at = ?, row_version = row_version + 1
           WHERE id = ? AND row_version = ?`,
        )
        .run(input.status, now, input.id, input.rowVersion);
      if (result.changes !== 1) this.throwMissingOrConflict(input.id);
      if (input.status === 'archived') {
        this.database
          .prepare(
            `UPDATE workspace_state
             SET last_active_workspace_id = NULL, updated_at = ?
             WHERE id = 1 AND last_active_workspace_id = ?`,
          )
          .run(now, input.id);
      }
      return this.require(input.id);
    });
    return setStatus();
  }

  public delete(id: string): boolean {
    return this.database.prepare('DELETE FROM workspaces WHERE id = ?').run(id).changes === 1;
  }

  public getLastActive(): Workspace | null {
    const row = this.database
      .prepare(
        `${WORKSPACE_SELECT}
         WHERE id = (SELECT last_active_workspace_id FROM workspace_state WHERE id = 1)`,
      )
      .get() as WorkspaceRow | undefined;
    return row ? mapWorkspace(row) : null;
  }

  public setLastActive(workspaceId: string | null): Workspace | null {
    if (workspaceId === null) {
      this.database
        .prepare(
          `UPDATE workspace_state
           SET last_active_workspace_id = NULL, updated_at = ?
           WHERE id = 1`,
        )
        .run(new Date().toISOString());
      return null;
    }
    const workspace = this.require(workspaceId);
    if (workspace.status === 'archived') {
      throw new LibraryError('CONFLICT', 'An archived Workspace cannot become last active.');
    }
    this.database
      .prepare(
        `UPDATE workspace_state
         SET last_active_workspace_id = ?, updated_at = ?
         WHERE id = 1`,
      )
      .run(workspaceId, new Date().toISOString());
    return workspace;
  }

  public addZoteroPaper(workspaceId: string, itemRef: ZoteroItemRef): StoredWorkspaceZoteroPaper {
    const add = this.database.transaction(() => {
      const workspace = this.require(workspaceId);
      if (workspace.status === 'archived') {
        throw new LibraryError('CONFLICT', 'Archived Workspaces cannot be changed.');
      }
      const referenceId = this.findOrCreateReference(itemRef);
      const duplicate = this.database
        .prepare(
          `SELECT 1 FROM workspace_zotero_items
           WHERE workspace_id = ? AND zotero_ref_id = ?`,
        )
        .get(workspaceId, referenceId);
      if (duplicate) {
        throw new LibraryError('CONFLICT', 'That Zotero item is already in this Workspace.');
      }
      const orderRow = this.database
        .prepare(
          `SELECT coalesce(max(sort_order), -1) + 1 AS next_order
           FROM workspace_zotero_items WHERE workspace_id = ?`,
        )
        .get(workspaceId) as { readonly next_order: number };
      const addedAt = new Date().toISOString();
      this.database
        .prepare(
          `INSERT INTO workspace_zotero_items (
             workspace_id, zotero_ref_id, added_at, sort_order
           ) VALUES (?, ?, ?, ?)`,
        )
        .run(workspaceId, referenceId, addedAt, orderRow.next_order);
      return { workspaceId, itemRef, addedAt, sortOrder: orderRow.next_order };
    });
    return add();
  }

  public removeZoteroPaper(workspaceId: string, itemRef: ZoteroItemRef): boolean {
    this.require(workspaceId);
    const reference = this.database
      .prepare(
        `SELECT id FROM zotero_item_references
         WHERE server_id = ? AND library_type = ? AND library_id = ? AND item_key = ?`,
      )
      .get(itemRef.serverId, itemRef.library.type, itemRef.library.id, itemRef.itemKey) as
      { readonly id: string } | undefined;
    if (!reference) return false;
    return (
      this.database
        .prepare(
          `DELETE FROM workspace_zotero_items
           WHERE workspace_id = ? AND zotero_ref_id = ?`,
        )
        .run(workspaceId, reference.id).changes === 1
    );
  }

  public listZoteroPapers(workspaceId: string): readonly StoredWorkspaceZoteroPaper[] {
    this.require(workspaceId);
    const rows = this.database
      .prepare(
        `${WORKSPACE_PAPER_SELECT}
         WHERE wzi.workspace_id = ?
         ORDER BY wzi.sort_order ASC
         LIMIT 500`,
      )
      .all(workspaceId) as WorkspacePaperRow[];
    return rows.map((row) => ({
      workspaceId: row.workspace_id,
      itemRef: {
        serverId: row.server_id,
        library: { type: row.library_type, id: row.library_id },
        itemKey: row.item_key,
      },
      addedAt: row.added_at,
      sortOrder: row.sort_order,
    }));
  }

  private findOrCreateReference(itemRef: ZoteroItemRef): string {
    const existing = this.database
      .prepare(
        `SELECT id FROM zotero_item_references
         WHERE server_id = ? AND library_type = ? AND library_id = ? AND item_key = ?`,
      )
      .get(itemRef.serverId, itemRef.library.type, itemRef.library.id, itemRef.itemKey) as
      { readonly id: string } | undefined;
    if (existing) return existing.id;
    const id = randomUUID();
    this.database
      .prepare(
        `INSERT INTO zotero_item_references (
           id, server_id, library_type, library_id, item_key, created_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        itemRef.serverId,
        itemRef.library.type,
        itemRef.library.id,
        itemRef.itemKey,
        new Date().toISOString(),
      );
    return id;
  }

  private require(id: string): Workspace {
    const workspace = this.get(id);
    if (!workspace) throw new LibraryError('NOT_FOUND', 'The Workspace no longer exists.');
    return workspace;
  }

  private throwMissingOrConflict(id: string): never {
    if (!this.get(id)) throw new LibraryError('NOT_FOUND', 'The Workspace no longer exists.');
    throw new LibraryError('CONFLICT', 'The Workspace changed elsewhere. Reload it and try again.');
  }
}

function mapWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    researchGoal: row.research_goal,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}
