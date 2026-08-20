import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type { KnowledgeProvenance, KnowledgeSourceType } from '../../shared/contracts/knowledge';
import type {
  CreateResearchContentInput,
  ListResearchContentInput,
  ResearchContentIdentityInput,
  ResearchContentItem,
  ResearchContentSummary,
  ResearchContentType,
  ResearchMemoryEntry,
  ResearchMemoryProposal,
  ResearchMemoryProposalStatus,
  ResearchMemoryStatus,
  ResearchReference,
  UpdateResearchContentInput,
  WorkspaceNote,
  WorkspaceNoteStatus,
} from '../../shared/contracts/research-memory';
import { LibraryError } from '../library/errors';
import type {
  ConfirmStoredProposalInput,
  CreateStoredProposalInput,
  RecordResearchExportInput,
  StoredResearchReferenceInput,
} from '../research-memory/research-memory-data-gateway';

interface ContentRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly title: string;
  readonly body_markdown: string;
  readonly status: string;
  readonly provenance?: 'ai-proposed-confirmed' | 'manual';
  readonly confirmed_at?: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface SummaryRow {
  readonly id: string;
  readonly type: ResearchContentType;
  readonly title: string;
  readonly status: string;
  readonly updated_at: string;
  readonly reference_count: number;
}

interface ReferenceRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly note_id: string | null;
  readonly memory_id: string | null;
  readonly proposal_id: string | null;
  readonly knowledge_chunk_id: string | null;
  readonly source_type: KnowledgeSourceType;
  readonly title: string;
  readonly citation: string;
  readonly snippet: string;
  readonly provenance_json: string;
  readonly display_order: number;
  readonly created_at: string;
}

interface ProposalRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly source_note_id: string | null;
  readonly title: string;
  readonly body_markdown: string;
  readonly reason: string;
  readonly provider_id: 'codex' | 'openai';
  readonly model_name: string;
  readonly status: ResearchMemoryProposalStatus;
  readonly confirmed_memory_id: string | null;
  readonly created_at: string;
  readonly reviewed_at: string | null;
  readonly row_version: number;
}

const NOTE_SELECT = `SELECT id, workspace_id, title, body_markdown, status,
  created_at, updated_at, row_version FROM workspace_notes`;
const MEMORY_SELECT = `SELECT id, workspace_id, title, body_markdown, status, provenance,
  confirmed_at, created_at, updated_at, row_version FROM research_memory_entries`;
const REFERENCE_SELECT = `SELECT id, workspace_id, note_id, memory_id, proposal_id,
  knowledge_chunk_id, source_type, title, citation, snippet, provenance_json,
  display_order, created_at FROM research_memory_references`;
const PROPOSAL_SELECT = `SELECT id, workspace_id, source_note_id, title, body_markdown,
  reason, provider_id, model_name, status, confirmed_memory_id, created_at,
  reviewed_at, row_version FROM research_memory_proposals`;

export class ResearchMemoryRepository {
  public constructor(private readonly database: Database.Database) {}

  public list(input: ListResearchContentInput): readonly ResearchContentSummary[] {
    this.requireWorkspace(input.workspaceId);
    const values: unknown[] = [input.workspaceId];
    const filters: string[] = [];
    const query = input.query?.trim();
    if (query) {
      filters.push('(lower({alias}.title) LIKE ? OR lower({alias}.body_markdown) LIKE ?)');
      const pattern = `%${escapeLike(query.toLowerCase())}%`;
      values.push(pattern, pattern);
    }
    if (input.statuses?.length) {
      filters.push(`{alias}.status IN (${input.statuses.map(() => '?').join(', ')})`);
      values.push(...input.statuses);
    }
    const suffix = (alias: string) =>
      filters.length ? ` AND ${filters.join(' AND ').replaceAll('{alias}', alias)}` : '';
    const types = input.types?.length ? input.types : (['note', 'memory'] as const);
    const rows: SummaryRow[] = [];
    if (types.includes('note')) {
      rows.push(
        ...(this.database
          .prepare(
            `SELECT n.id, 'note' AS type, n.title, n.status, n.updated_at,
              COUNT(r.id) AS reference_count
             FROM workspace_notes n LEFT JOIN research_memory_references r ON r.note_id = n.id
             WHERE n.workspace_id = ?${suffix('n')}
             GROUP BY n.id`,
          )
          .all(...values) as SummaryRow[]),
      );
    }
    if (types.includes('memory')) {
      rows.push(
        ...(this.database
          .prepare(
            `SELECT m.id, 'memory' AS type, m.title, m.status, m.updated_at,
              COUNT(r.id) AS reference_count
             FROM research_memory_entries m LEFT JOIN research_memory_references r ON r.memory_id = m.id
             WHERE m.workspace_id = ?${suffix('m')}
             GROUP BY m.id`,
          )
          .all(...values) as SummaryRow[]),
      );
    }
    return rows
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
      .map(mapSummary);
  }

  public get(input: ResearchContentIdentityInput): ResearchContentItem | null {
    const row = this.database
      .prepare(
        `${input.type === 'note' ? NOTE_SELECT : MEMORY_SELECT} WHERE id = ? AND workspace_id = ?`,
      )
      .get(input.id, input.workspaceId) as ContentRow | undefined;
    if (!row) return null;
    const references = this.listReferences(input.workspaceId, input.type, input.id);
    return input.type === 'note' ? mapNote(row, references) : mapMemory(row, references);
  }

  public create(input: CreateResearchContentInput): ResearchContentItem {
    this.requireMutableWorkspace(input.workspaceId);
    const id = randomUUID();
    const now = new Date().toISOString();
    if (input.type === 'note') {
      this.database
        .prepare(
          `INSERT INTO workspace_notes
           (id, workspace_id, title, body_markdown, status, created_at, updated_at, row_version)
           VALUES (?, ?, ?, ?, 'active', ?, ?, 1)`,
        )
        .run(id, input.workspaceId, input.title, input.bodyMarkdown, now, now);
    } else {
      this.database
        .prepare(
          `INSERT INTO research_memory_entries
           (id, workspace_id, title, body_markdown, status, provenance, confirmed_at,
            created_at, updated_at, row_version)
           VALUES (?, ?, ?, ?, 'draft', 'manual', NULL, ?, ?, 1)`,
        )
        .run(id, input.workspaceId, input.title, input.bodyMarkdown, now, now);
    }
    return this.require(input.workspaceId, input.type, id);
  }

  public update(input: UpdateResearchContentInput): ResearchContentItem {
    this.requireMutableWorkspace(input.workspaceId);
    const table = input.type === 'note' ? 'workspace_notes' : 'research_memory_entries';
    const current = this.require(input.workspaceId, input.type, input.id);
    if (input.type === 'note' && !['active', 'archived', 'draft'].includes(input.status)) {
      throw new LibraryError('INVALID_INPUT', 'The Note status is invalid.');
    }
    if (input.type === 'memory' && !['confirmed', 'draft', 'retired'].includes(input.status)) {
      throw new LibraryError('INVALID_INPUT', 'The Memory status is invalid.');
    }
    const confirmedAt =
      input.type === 'memory' && input.status === 'confirmed'
        ? ((current as ResearchMemoryEntry).confirmedAt ?? new Date().toISOString())
        : input.type === 'memory'
          ? (current as ResearchMemoryEntry).confirmedAt
          : null;
    const sql =
      input.type === 'memory'
        ? `UPDATE ${table} SET title = ?, body_markdown = ?, status = ?, confirmed_at = ?,
           updated_at = ?, row_version = row_version + 1
           WHERE id = ? AND workspace_id = ? AND row_version = ?`
        : `UPDATE ${table} SET title = ?, body_markdown = ?, status = ?, updated_at = ?,
           row_version = row_version + 1 WHERE id = ? AND workspace_id = ? AND row_version = ?`;
    const now = new Date().toISOString();
    const result =
      input.type === 'memory'
        ? this.database
            .prepare(sql)
            .run(
              input.title,
              input.bodyMarkdown,
              input.status,
              confirmedAt,
              now,
              input.id,
              input.workspaceId,
              input.rowVersion,
            )
        : this.database
            .prepare(sql)
            .run(
              input.title,
              input.bodyMarkdown,
              input.status,
              now,
              input.id,
              input.workspaceId,
              input.rowVersion,
            );
    if (result.changes !== 1) this.throwConflict(input.workspaceId, input.type, input.id);
    return this.require(input.workspaceId, input.type, input.id);
  }

  public delete(input: ResearchContentIdentityInput): boolean {
    this.requireMutableWorkspace(input.workspaceId);
    const table = input.type === 'note' ? 'workspace_notes' : 'research_memory_entries';
    return (
      this.database
        .prepare(`DELETE FROM ${table} WHERE id = ? AND workspace_id = ?`)
        .run(input.id, input.workspaceId).changes === 1
    );
  }

  public addReference(input: StoredResearchReferenceInput): ResearchReference {
    this.requireMutableWorkspace(input.workspaceId);
    if (input.ownerType === 'proposal') {
      this.requireProposal(input.workspaceId, input.ownerId);
    } else {
      this.require(input.workspaceId, input.ownerType, input.ownerId);
    }
    const ownerColumn = ownerColumnFor(input.ownerType);
    const orderRow = this.database
      .prepare(
        `SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order
         FROM research_memory_references WHERE workspace_id = ? AND ${ownerColumn} = ?`,
      )
      .get(input.workspaceId, input.ownerId) as { readonly next_order: number };
    try {
      this.database
        .prepare(
          `INSERT INTO research_memory_references
           (id, workspace_id, note_id, memory_id, proposal_id, knowledge_chunk_id,
            source_type, title, citation, snippet, provenance_json, display_order, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.id,
          input.workspaceId,
          input.ownerType === 'note' ? input.ownerId : null,
          input.ownerType === 'memory' ? input.ownerId : null,
          input.ownerType === 'proposal' ? input.ownerId : null,
          input.chunkId,
          input.sourceType,
          input.title,
          input.citation,
          input.snippet,
          input.provenanceJson,
          orderRow.next_order,
          input.createdAt,
        );
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new LibraryError('CONFLICT', 'That source is already attached.', { cause: error });
      }
      throw error;
    }
    return this.requireReference(input.workspaceId, input.ownerType, input.ownerId, input.id);
  }

  public removeReference(input: {
    readonly workspaceId: string;
    readonly ownerType: 'memory' | 'note';
    readonly ownerId: string;
    readonly referenceId: string;
  }): boolean {
    this.requireMutableWorkspace(input.workspaceId);
    this.require(input.workspaceId, input.ownerType, input.ownerId);
    return (
      this.database
        .prepare(
          `DELETE FROM research_memory_references
         WHERE id = ? AND workspace_id = ? AND ${ownerColumnFor(input.ownerType)} = ?`,
        )
        .run(input.referenceId, input.workspaceId, input.ownerId).changes === 1
    );
  }

  public getReference(input: {
    readonly workspaceId: string;
    readonly ownerType: 'memory' | 'note';
    readonly ownerId: string;
    readonly referenceId: string;
  }): ResearchReference | null {
    const row = this.database
      .prepare(
        `${REFERENCE_SELECT} WHERE id = ? AND workspace_id = ? AND ${ownerColumnFor(input.ownerType)} = ?`,
      )
      .get(input.referenceId, input.workspaceId, input.ownerId) as ReferenceRow | undefined;
    return row ? mapReference(row) : null;
  }

  public createProposal(input: CreateStoredProposalInput): ResearchMemoryProposal {
    return this.database.transaction(() => {
      const note = input.sourceNoteId
        ? this.require(input.workspaceId, 'note', input.sourceNoteId)
        : null;
      this.requireMutableWorkspace(input.workspaceId);
      this.database
        .prepare(
          `INSERT INTO research_memory_proposals
           (id, workspace_id, source_note_id, title, body_markdown, reason, provider_id,
            model_name, status, confirmed_memory_id, created_at, reviewed_at, row_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, NULL, 1)`,
        )
        .run(
          input.id,
          input.workspaceId,
          note?.id ?? null,
          input.title,
          input.bodyMarkdown,
          input.reason,
          input.providerId,
          input.model,
          input.createdAt,
        );
      for (const reference of note?.references ?? []) {
        this.addReference({
          id: randomUUID(),
          workspaceId: input.workspaceId,
          ownerType: 'proposal',
          ownerId: input.id,
          chunkId: reference.chunkId,
          sourceType: reference.sourceType,
          title: reference.title,
          citation: reference.citation,
          snippet: reference.snippet,
          provenanceJson: JSON.stringify(reference.provenance),
          createdAt: input.createdAt,
        });
      }
      return this.requireProposal(input.workspaceId, input.id);
    })();
  }

  public listProposals(workspaceId: string): readonly ResearchMemoryProposal[] {
    this.requireWorkspace(workspaceId);
    const rows = this.database
      .prepare(`${PROPOSAL_SELECT} WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 200`)
      .all(workspaceId) as ProposalRow[];
    return rows.map((row) =>
      mapProposal(row, this.listReferences(workspaceId, 'proposal', row.id)),
    );
  }

  public getProposal(workspaceId: string, proposalId: string): ResearchMemoryProposal | null {
    const row = this.database
      .prepare(`${PROPOSAL_SELECT} WHERE id = ? AND workspace_id = ?`)
      .get(proposalId, workspaceId) as ProposalRow | undefined;
    return row ? mapProposal(row, this.listReferences(workspaceId, 'proposal', proposalId)) : null;
  }

  public confirmProposal(input: ConfirmStoredProposalInput): ResearchMemoryEntry {
    return this.database.transaction(() => {
      this.requireMutableWorkspace(input.workspaceId);
      const proposal = this.requireProposal(input.workspaceId, input.proposalId);
      if (proposal.status !== 'pending')
        throw new LibraryError('CONFLICT', 'The proposal was already reviewed.');
      if (proposal.rowVersion !== input.rowVersion)
        throw new LibraryError('CONFLICT', 'The proposal changed. Refresh and try again.');
      const id = randomUUID();
      const now = new Date().toISOString();
      this.database
        .prepare(
          `INSERT INTO research_memory_entries
           (id, workspace_id, title, body_markdown, status, provenance, confirmed_at,
            created_at, updated_at, row_version)
           VALUES (?, ?, ?, ?, 'confirmed', 'ai-proposed-confirmed', ?, ?, ?, 1)`,
        )
        .run(id, input.workspaceId, input.title, input.bodyMarkdown, now, now, now);
      this.database
        .prepare(
          `INSERT INTO research_memory_references
           (id, workspace_id, note_id, memory_id, proposal_id, knowledge_chunk_id,
            source_type, title, citation, snippet, provenance_json, display_order, created_at)
           SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
             substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) ||
             substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
             workspace_id, NULL, ?, NULL, knowledge_chunk_id, source_type, title, citation,
             snippet, provenance_json, display_order, ?
           FROM research_memory_references WHERE proposal_id = ? AND workspace_id = ?`,
        )
        .run(id, now, input.proposalId, input.workspaceId);
      const result = this.database
        .prepare(
          `UPDATE research_memory_proposals SET status = 'confirmed', confirmed_memory_id = ?,
           reviewed_at = ?, row_version = row_version + 1
           WHERE id = ? AND workspace_id = ? AND status = 'pending' AND row_version = ?`,
        )
        .run(id, now, input.proposalId, input.workspaceId, input.rowVersion);
      if (result.changes !== 1)
        throw new LibraryError('CONFLICT', 'The proposal changed. Refresh and try again.');
      return this.require(input.workspaceId, 'memory', id) as ResearchMemoryEntry;
    })();
  }

  public rejectProposal(input: {
    readonly workspaceId: string;
    readonly proposalId: string;
    readonly rowVersion: number;
  }): ResearchMemoryProposal {
    this.requireMutableWorkspace(input.workspaceId);
    const result = this.database
      .prepare(
        `UPDATE research_memory_proposals SET status = 'rejected', reviewed_at = ?,
         row_version = row_version + 1
         WHERE id = ? AND workspace_id = ? AND status = 'pending' AND row_version = ?`,
      )
      .run(new Date().toISOString(), input.proposalId, input.workspaceId, input.rowVersion);
    if (result.changes !== 1)
      throw new LibraryError('CONFLICT', 'The proposal changed or was already reviewed.');
    return this.requireProposal(input.workspaceId, input.proposalId);
  }

  public recordExport(input: RecordResearchExportInput): void {
    this.database
      .prepare(
        `INSERT INTO research_memory_exports
         (id, workspace_id, owner_type, owner_id, vault_name, relative_path, content_hash, exported_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.workspaceId,
        input.ownerType,
        input.ownerId,
        input.vaultName,
        input.relativePath,
        input.contentHash,
        input.exportedAt,
      );
  }
  public getLatestExport(workspaceId: string, ownerType: 'memory' | 'note', ownerId: string) {
    return this.database
      .prepare(
        `SELECT id,workspace_id,owner_type,owner_id,vault_name,relative_path,content_hash,exported_at FROM research_memory_exports WHERE workspace_id=? AND owner_type=? AND owner_id=? ORDER BY exported_at DESC,id DESC LIMIT 1`,
      )
      .get(workspaceId, ownerType, ownerId) as
      | {
          id: string;
          workspace_id: string;
          owner_type: 'memory' | 'note';
          owner_id: string;
          vault_name: string;
          relative_path: string;
          content_hash: string;
          exported_at: string;
        }
      | undefined;
  }

  private require(workspaceId: string, type: ResearchContentType, id: string): ResearchContentItem {
    const item = this.get({ workspaceId, type, id });
    if (!item)
      throw new LibraryError(
        'NOT_FOUND',
        `${type === 'note' ? 'Note' : 'Memory'} was not found in this Workspace.`,
      );
    return item;
  }

  private requireReference(
    workspaceId: string,
    ownerType: 'memory' | 'note' | 'proposal',
    ownerId: string,
    id: string,
  ): ResearchReference {
    const row = this.database
      .prepare(
        `${REFERENCE_SELECT} WHERE id = ? AND workspace_id = ? AND ${ownerColumnFor(ownerType)} = ?`,
      )
      .get(id, workspaceId, ownerId) as ReferenceRow | undefined;
    if (!row) throw new LibraryError('NOT_FOUND', 'The source reference was not found.');
    return mapReference(row);
  }

  private requireProposal(workspaceId: string, proposalId: string): ResearchMemoryProposal {
    const proposal = this.getProposal(workspaceId, proposalId);
    if (!proposal) throw new LibraryError('NOT_FOUND', 'The Memory proposal was not found.');
    return proposal;
  }

  private listReferences(
    workspaceId: string,
    ownerType: 'memory' | 'note' | 'proposal',
    ownerId: string,
  ): readonly ResearchReference[] {
    return (
      this.database
        .prepare(
          `${REFERENCE_SELECT} WHERE workspace_id = ? AND ${ownerColumnFor(ownerType)} = ? ORDER BY display_order LIMIT 200`,
        )
        .all(workspaceId, ownerId) as ReferenceRow[]
    ).map(mapReference);
  }

  private requireWorkspace(workspaceId: string): void {
    if (!this.database.prepare('SELECT 1 FROM workspaces WHERE id = ?').get(workspaceId)) {
      throw new LibraryError('NOT_FOUND', 'The Workspace does not exist.');
    }
  }

  private requireMutableWorkspace(workspaceId: string): void {
    const row = this.database
      .prepare('SELECT status FROM workspaces WHERE id = ?')
      .get(workspaceId) as { readonly status: string } | undefined;
    if (!row) throw new LibraryError('NOT_FOUND', 'The Workspace does not exist.');
    if (row.status === 'archived')
      throw new LibraryError('CONFLICT', 'Archived Workspaces are read-only.');
  }

  private throwConflict(workspaceId: string, type: ResearchContentType, id: string): never {
    if (!this.get({ workspaceId, type, id }))
      throw new LibraryError('NOT_FOUND', 'The research item no longer exists.');
    throw new LibraryError('CONFLICT', 'The research item changed. Refresh and try again.');
  }
}

function ownerColumnFor(type: 'memory' | 'note' | 'proposal'): string {
  return type === 'note' ? 'note_id' : type === 'memory' ? 'memory_id' : 'proposal_id';
}

function mapSummary(row: SummaryRow): ResearchContentSummary {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    status: row.status as ResearchContentSummary['status'],
    referenceCount: row.reference_count,
    updatedAt: row.updated_at,
  };
}

function mapNote(row: ContentRow, references: readonly ResearchReference[]): WorkspaceNote {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    type: 'note',
    title: row.title,
    bodyMarkdown: row.body_markdown,
    status: row.status as WorkspaceNoteStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
    references,
  };
}

function mapMemory(row: ContentRow, references: readonly ResearchReference[]): ResearchMemoryEntry {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    type: 'memory',
    title: row.title,
    bodyMarkdown: row.body_markdown,
    status: row.status as ResearchMemoryStatus,
    provenance: row.provenance ?? 'manual',
    confirmedAt: row.confirmed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
    references,
  };
}

function mapReference(row: ReferenceRow): ResearchReference {
  const ownerType = row.note_id ? 'note' : row.memory_id ? 'memory' : 'proposal';
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ownerType,
    ownerId: row.note_id ?? row.memory_id ?? row.proposal_id ?? '',
    chunkId: row.knowledge_chunk_id,
    sourceType: row.source_type,
    title: row.title,
    citation: row.citation,
    snippet: row.snippet,
    provenance: JSON.parse(row.provenance_json) as KnowledgeProvenance,
    displayOrder: row.display_order,
    createdAt: row.created_at,
  };
}

function mapProposal(
  row: ProposalRow,
  references: readonly ResearchReference[],
): ResearchMemoryProposal {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sourceNoteId: row.source_note_id,
    title: row.title,
    bodyMarkdown: row.body_markdown,
    reason: row.reason,
    providerId: row.provider_id,
    model: row.model_name,
    status: row.status,
    confirmedMemoryId: row.confirmed_memory_id,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    rowVersion: row.row_version,
    references,
  };
}

function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}
