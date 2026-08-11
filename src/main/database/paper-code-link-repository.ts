import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type { UpdatePaperCodeLinkInput } from '../../shared/contracts/paper-code-link';
import { LibraryError } from '../library/errors';
import type {
  CreateStoredPaperCodeLinkInput,
  StoredPaperCodeLink,
} from '../paper-code-link/paper-code-link-data-gateway';

interface PaperCodeLinkRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly zotero_server_id: string;
  readonly zotero_library_type: 'group' | 'user';
  readonly zotero_library_id: string;
  readonly zotero_item_key: string;
  readonly zotero_item_version: number;
  readonly paper_snapshot_identity: string;
  readonly page_number: number | null;
  readonly location_label: string;
  readonly text_anchor_exact: string | null;
  readonly text_anchor_prefix: string | null;
  readonly text_anchor_suffix: string | null;
  readonly repository_id: string;
  readonly code_snapshot_identity: string;
  readonly code_language: StoredPaperCodeLink['language'];
  readonly relative_path: string;
  readonly symbol_kind: StoredPaperCodeLink['symbolKind'];
  readonly symbol_name: string | null;
  readonly start_line: number;
  readonly end_line: number;
  readonly content_hash: string;
  readonly relation_type: StoredPaperCodeLink['relationType'];
  readonly label: string;
  readonly description: string;
  readonly provenance: StoredPaperCodeLink['provenance'];
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

const SELECT = `SELECT id, workspace_id, zotero_server_id, zotero_library_type,
  zotero_library_id, zotero_item_key, zotero_item_version, paper_snapshot_identity,
  page_number, location_label, text_anchor_exact, text_anchor_prefix, text_anchor_suffix,
  repository_id, code_snapshot_identity, code_language, relative_path, symbol_kind,
  symbol_name, start_line, end_line, content_hash, relation_type, label, description,
  provenance, created_at, updated_at, row_version FROM paper_code_links`;

export class PaperCodeLinkRepository {
  public constructor(private readonly database: Database.Database) {}

  public create(input: CreateStoredPaperCodeLinkInput): StoredPaperCodeLink {
    return this.database.transaction(() => {
      this.requireMutableWorkspace(input.workspaceId);
      this.requireMemberships(input);
      if (!this.matchesCodeLocation(input)) {
        throw new LibraryError(
          'INVALID_INPUT',
          'The code location does not match the current trusted index.',
        );
      }
      const id = randomUUID();
      const now = new Date().toISOString();
      this.database
        .prepare(
          `INSERT INTO paper_code_links (
            id, workspace_id, zotero_server_id, zotero_library_type, zotero_library_id,
            zotero_item_key, zotero_item_version, paper_snapshot_identity, page_number,
            location_label, text_anchor_exact, text_anchor_prefix, text_anchor_suffix,
            repository_id, code_snapshot_identity, code_language, relative_path,
            symbol_kind, symbol_name, start_line, end_line, content_hash, relation_type,
            label, description, provenance, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.workspaceId,
          input.itemRef.serverId,
          input.itemRef.library.type,
          input.itemRef.library.id,
          input.itemRef.itemKey,
          input.itemVersion,
          input.paperSnapshotIdentity,
          input.pageNumber,
          input.locationLabel,
          input.textAnchor?.exact ?? null,
          input.textAnchor?.prefix ?? null,
          input.textAnchor?.suffix ?? null,
          input.repositoryId,
          input.codeSnapshotIdentity,
          input.language,
          input.relativePath,
          input.symbolKind,
          input.symbolName,
          input.startLine,
          input.endLine,
          input.contentHash,
          input.relationType,
          input.label,
          input.description,
          input.provenance,
          now,
          now,
        );
      return this.require(input.workspaceId, id);
    })();
  }

  public get(workspaceId: string, id: string): StoredPaperCodeLink | null {
    const row = this.database
      .prepare(`${SELECT} WHERE workspace_id = ? AND id = ?`)
      .get(workspaceId, id) as PaperCodeLinkRow | undefined;
    return row ? mapRow(row) : null;
  }

  public list(workspaceId: string): readonly StoredPaperCodeLink[] {
    this.requireWorkspace(workspaceId);
    return (
      this.database
        .prepare(`${SELECT} WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 500`)
        .all(workspaceId) as PaperCodeLinkRow[]
    ).map(mapRow);
  }

  public update(input: UpdatePaperCodeLinkInput): StoredPaperCodeLink {
    this.requireMutableWorkspace(input.workspaceId);
    const now = new Date().toISOString();
    const changes = this.database
      .prepare(
        `UPDATE paper_code_links SET relation_type = ?, label = ?, description = ?,
          updated_at = ?, row_version = row_version + 1
        WHERE id = ? AND workspace_id = ? AND row_version = ?`,
      )
      .run(
        input.relationType,
        input.label,
        input.description,
        now,
        input.id,
        input.workspaceId,
        input.rowVersion,
      ).changes;
    if (changes !== 1) this.throwConflict(input.workspaceId, input.id);
    return this.require(input.workspaceId, input.id);
  }

  public delete(workspaceId: string, id: string): boolean {
    this.requireMutableWorkspace(workspaceId);
    return (
      this.database
        .prepare('DELETE FROM paper_code_links WHERE workspace_id = ? AND id = ?')
        .run(workspaceId, id).changes === 1
    );
  }

  public codeLocationExists(link: StoredPaperCodeLink): boolean {
    return this.matchesCodeLocation(link);
  }

  private requireMemberships(input: CreateStoredPaperCodeLinkInput): void {
    const paper = this.database
      .prepare(
        `SELECT 1 FROM workspace_zotero_items wzi
          JOIN zotero_item_references zir ON zir.id = wzi.zotero_ref_id
        WHERE wzi.workspace_id = ? AND zir.server_id = ? AND zir.library_type = ?
          AND zir.library_id = ? AND zir.item_key = ?`,
      )
      .get(
        input.workspaceId,
        input.itemRef.serverId,
        input.itemRef.library.type,
        input.itemRef.library.id,
        input.itemRef.itemKey,
      );
    if (!paper)
      throw new LibraryError('INVALID_INPUT', 'The Zotero item is not in this Workspace.');
    const repository = this.database
      .prepare('SELECT 1 FROM workspace_repositories WHERE workspace_id = ? AND repository_id = ?')
      .get(input.workspaceId, input.repositoryId);
    if (!repository)
      throw new LibraryError('INVALID_INPUT', 'The repository is not in this Workspace.');
  }

  private matchesCodeLocation(
    input: Pick<
      CreateStoredPaperCodeLinkInput,
      | 'repositoryId'
      | 'codeSnapshotIdentity'
      | 'relativePath'
      | 'contentHash'
      | 'startLine'
      | 'endLine'
      | 'symbolKind'
      | 'symbolName'
    >,
  ): boolean {
    if (input.symbolKind && input.symbolName) {
      return Boolean(
        this.database
          .prepare(
            `SELECT 1 FROM code_index_symbols s
              JOIN code_index_files f ON f.id = s.file_id
            WHERE s.repository_id = ? AND s.snapshot_identity = ? AND f.relative_path = ?
              AND s.content_hash = ? AND s.start_line = ? AND s.end_line = ?
              AND s.symbol_kind = ? AND s.name = ?`,
          )
          .get(
            input.repositoryId,
            input.codeSnapshotIdentity,
            input.relativePath,
            input.contentHash,
            input.startLine,
            input.endLine,
            input.symbolKind,
            input.symbolName,
          ),
      );
    }
    return Boolean(
      this.database
        .prepare(
          `SELECT 1 FROM code_index_files
          WHERE repository_id = ? AND snapshot_identity = ? AND relative_path = ?
            AND content_hash = ? AND ? >= 1 AND ? <= line_count`,
        )
        .get(
          input.repositoryId,
          input.codeSnapshotIdentity,
          input.relativePath,
          input.contentHash,
          input.startLine,
          input.endLine,
        ),
    );
  }

  private requireWorkspace(id: string): void {
    if (!this.database.prepare('SELECT 1 FROM workspaces WHERE id = ?').get(id)) {
      throw new LibraryError('NOT_FOUND', 'The Workspace no longer exists.');
    }
  }

  private requireMutableWorkspace(id: string): void {
    const row = this.database.prepare('SELECT status FROM workspaces WHERE id = ?').get(id) as
      { readonly status: string } | undefined;
    if (!row) throw new LibraryError('NOT_FOUND', 'The Workspace no longer exists.');
    if (row.status === 'archived')
      throw new LibraryError('CONFLICT', 'Archived Workspaces cannot be changed.');
  }

  private require(workspaceId: string, id: string): StoredPaperCodeLink {
    const link = this.get(workspaceId, id);
    if (!link) throw new LibraryError('NOT_FOUND', 'The Paper-Code Link no longer exists.');
    return link;
  }

  private throwConflict(workspaceId: string, id: string): never {
    this.require(workspaceId, id);
    throw new LibraryError('CONFLICT', 'The Paper-Code Link changed elsewhere. Reload and retry.');
  }
}

function mapRow(row: PaperCodeLinkRow): StoredPaperCodeLink {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    itemRef: {
      serverId: row.zotero_server_id,
      library: { type: row.zotero_library_type, id: row.zotero_library_id },
      itemKey: row.zotero_item_key,
    },
    itemVersion: row.zotero_item_version,
    paperSnapshotIdentity: row.paper_snapshot_identity,
    pageNumber: row.page_number,
    locationLabel: row.location_label,
    textAnchor:
      row.text_anchor_exact === null
        ? null
        : {
            exact: row.text_anchor_exact,
            prefix: row.text_anchor_prefix ?? '',
            suffix: row.text_anchor_suffix ?? '',
          },
    repositoryId: row.repository_id,
    codeSnapshotIdentity: row.code_snapshot_identity,
    language: row.code_language,
    relativePath: row.relative_path,
    symbolKind: row.symbol_kind,
    symbolName: row.symbol_name,
    startLine: row.start_line,
    endLine: row.end_line,
    contentHash: row.content_hash,
    relationType: row.relation_type,
    label: row.label,
    description: row.description,
    provenance: row.provenance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}
