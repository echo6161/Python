import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type {
  AddCodeEvidenceInput,
  ArchiveResearchQuestionInput,
  CreateResearchQuestionInput,
  ResearchQuestion,
  ResearchQuestionPriority,
  ResearchQuestionStatus,
  SetResearchQuestionStatusInput,
  UpdateResearchQuestionInput,
} from '../../shared/contracts/question';
import type { CodeLanguage, CodeSymbolKind } from '../../shared/contracts/code-intelligence';
import type {
  CreateStoredZoteroEvidenceInput,
  StoredCodeEvidence,
  StoredEvidence,
  StoredZoteroEvidence,
} from '../question/question-data-gateway';
import { LibraryError } from '../library/errors';

interface QuestionRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly title: string;
  readonly description: string;
  readonly status: ResearchQuestionStatus;
  readonly priority: ResearchQuestionPriority;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface EvidenceRow {
  readonly id: string;
  readonly question_id: string;
  readonly workspace_id: string;
  readonly kind: 'code' | 'zotero_paper';
  readonly note: string;
  readonly source_snapshot_identity: string;
  readonly sort_order: number;
  readonly created_at: string;
  readonly zotero_server_id: string | null;
  readonly zotero_library_type: 'group' | 'user' | null;
  readonly zotero_library_id: string | null;
  readonly zotero_item_key: string | null;
  readonly zotero_item_version: number | null;
  readonly page_number: number | null;
  readonly text_anchor_exact: string | null;
  readonly text_anchor_prefix: string | null;
  readonly text_anchor_suffix: string | null;
  readonly repository_id: string | null;
  readonly code_language: CodeLanguage | null;
  readonly relative_path: string | null;
  readonly symbol_kind: CodeSymbolKind | null;
  readonly symbol_name: string | null;
  readonly start_line: number | null;
  readonly end_line: number | null;
  readonly content_hash: string | null;
}

const QUESTION_SELECT = `SELECT id, workspace_id, title, description, status, priority,
  archived_at, created_at, updated_at, row_version FROM research_questions`;
const EVIDENCE_SELECT = `SELECT id, question_id, workspace_id, kind, note,
  source_snapshot_identity, sort_order, created_at, zotero_server_id,
  zotero_library_type, zotero_library_id, zotero_item_key, zotero_item_version,
  page_number, text_anchor_exact, text_anchor_prefix, text_anchor_suffix,
  repository_id, code_language, relative_path, symbol_kind, symbol_name,
  start_line, end_line, content_hash FROM question_evidence`;

export class QuestionRepository {
  public constructor(private readonly database: Database.Database) {}

  public create(input: CreateResearchQuestionInput): ResearchQuestion {
    this.requireMutableWorkspace(input.workspaceId);
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO research_questions (
        id, workspace_id, title, description, status, priority,
        archived_at, created_at, updated_at, row_version
      ) VALUES (?, ?, ?, ?, 'unresolved', ?, NULL, ?, ?, 1)`,
      )
      .run(id, input.workspaceId, input.title, input.description, input.priority, now, now);
    return this.require(input.workspaceId, id);
  }

  public get(workspaceId: string, questionId: string): ResearchQuestion | null {
    const row = this.database
      .prepare(`${QUESTION_SELECT} WHERE id = ? AND workspace_id = ?`)
      .get(questionId, workspaceId) as QuestionRow | undefined;
    return row ? mapQuestion(row) : null;
  }

  public list(workspaceId: string): readonly ResearchQuestion[] {
    this.requireWorkspace(workspaceId);
    const rows = this.database
      .prepare(
        `${QUESTION_SELECT} WHERE workspace_id = ?
        ORDER BY archived_at IS NOT NULL, CASE priority
          WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
          updated_at DESC LIMIT 500`,
      )
      .all(workspaceId) as QuestionRow[];
    return rows.map(mapQuestion);
  }

  public update(input: UpdateResearchQuestionInput): ResearchQuestion {
    this.requireMutableQuestion(input.workspaceId, input.id);
    const result = this.database
      .prepare(
        `UPDATE research_questions SET title = ?, description = ?, priority = ?,
        updated_at = ?, row_version = row_version + 1
        WHERE id = ? AND workspace_id = ? AND row_version = ?`,
      )
      .run(
        input.title,
        input.description,
        input.priority,
        new Date().toISOString(),
        input.id,
        input.workspaceId,
        input.rowVersion,
      );
    if (result.changes !== 1) this.throwConflict(input.workspaceId, input.id);
    return this.require(input.workspaceId, input.id);
  }

  public setStatus(input: SetResearchQuestionStatusInput): ResearchQuestion {
    this.requireMutableQuestion(input.workspaceId, input.id);
    const result = this.database
      .prepare(
        `UPDATE research_questions SET status = ?, updated_at = ?,
        row_version = row_version + 1
        WHERE id = ? AND workspace_id = ? AND row_version = ?`,
      )
      .run(input.status, new Date().toISOString(), input.id, input.workspaceId, input.rowVersion);
    if (result.changes !== 1) this.throwConflict(input.workspaceId, input.id);
    return this.require(input.workspaceId, input.id);
  }

  public archive(input: ArchiveResearchQuestionInput): ResearchQuestion {
    this.requireMutableWorkspace(input.workspaceId);
    const current = this.require(input.workspaceId, input.id);
    if ((current.archivedAt !== null) === input.archived) {
      if (current.rowVersion !== input.rowVersion) this.throwConflict(input.workspaceId, input.id);
      return current;
    }
    const result = this.database
      .prepare(
        `UPDATE research_questions SET archived_at = ?, updated_at = ?,
        row_version = row_version + 1
        WHERE id = ? AND workspace_id = ? AND row_version = ?`,
      )
      .run(
        input.archived ? new Date().toISOString() : null,
        new Date().toISOString(),
        input.id,
        input.workspaceId,
        input.rowVersion,
      );
    if (result.changes !== 1) this.throwConflict(input.workspaceId, input.id);
    return this.require(input.workspaceId, input.id);
  }

  public delete(workspaceId: string, questionId: string): boolean {
    this.requireMutableWorkspace(workspaceId);
    return (
      this.database
        .prepare('DELETE FROM research_questions WHERE id = ? AND workspace_id = ?')
        .run(questionId, workspaceId).changes === 1
    );
  }

  public listEvidence(workspaceId: string, questionId: string): readonly StoredEvidence[] {
    this.require(workspaceId, questionId);
    return (
      this.database
        .prepare(
          `${EVIDENCE_SELECT} WHERE question_id = ? AND workspace_id = ? ORDER BY sort_order LIMIT 500`,
        )
        .all(questionId, workspaceId) as EvidenceRow[]
    ).map(mapEvidence);
  }

  public addZoteroEvidence(input: CreateStoredZoteroEvidenceInput): StoredZoteroEvidence {
    const operation = this.database.transaction(() => {
      this.requireMutableQuestion(input.workspaceId, input.questionId);
      const membership = this.database
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
      if (!membership)
        throw new LibraryError('INVALID_INPUT', 'The Zotero item is not in this Workspace.');
      const id = randomUUID();
      const now = new Date().toISOString();
      this.database
        .prepare(
          `INSERT INTO question_evidence (
        id, question_id, workspace_id, kind, note, source_snapshot_identity,
        sort_order, created_at, zotero_server_id, zotero_library_type,
        zotero_library_id, zotero_item_key, zotero_item_version, page_number,
        text_anchor_exact, text_anchor_prefix, text_anchor_suffix
      ) VALUES (?, ?, ?, 'zotero_paper', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.questionId,
          input.workspaceId,
          input.note,
          input.sourceSnapshotIdentity,
          this.nextOrder(input.questionId),
          now,
          input.itemRef.serverId,
          input.itemRef.library.type,
          input.itemRef.library.id,
          input.itemRef.itemKey,
          input.itemVersion,
          input.pageNumber,
          input.textAnchor?.exact ?? null,
          input.textAnchor?.prefix ?? null,
          input.textAnchor?.suffix ?? null,
        );
      return this.requireEvidence(input.workspaceId, input.questionId, id) as StoredZoteroEvidence;
    });
    return operation();
  }

  public addCodeEvidence(input: AddCodeEvidenceInput): StoredCodeEvidence {
    const operation = this.database.transaction(() => {
      this.requireMutableQuestion(input.workspaceId, input.questionId);
      const membership = this.database
        .prepare(
          `SELECT 1 FROM workspace_repositories
        WHERE workspace_id = ? AND repository_id = ?`,
        )
        .get(input.workspaceId, input.repositoryId);
      if (!membership)
        throw new LibraryError('INVALID_INPUT', 'The repository is not in this Workspace.');
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
          `INSERT INTO question_evidence (
        id, question_id, workspace_id, kind, note, source_snapshot_identity,
        sort_order, created_at, repository_id, code_language, relative_path,
        symbol_kind, symbol_name, start_line, end_line, content_hash
      ) VALUES (?, ?, ?, 'code', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.questionId,
          input.workspaceId,
          input.note,
          input.sourceSnapshotIdentity,
          this.nextOrder(input.questionId),
          now,
          input.repositoryId,
          input.language,
          input.relativePath,
          input.symbolKind,
          input.symbolName,
          input.startLine,
          input.endLine,
          input.contentHash,
        );
      return this.requireEvidence(input.workspaceId, input.questionId, id) as StoredCodeEvidence;
    });
    return operation();
  }

  public removeEvidence(workspaceId: string, questionId: string, evidenceId: string): boolean {
    const operation = this.database.transaction(() => {
      this.requireMutableQuestion(workspaceId, questionId);
      const removed =
        this.database
          .prepare(
            `DELETE FROM question_evidence
        WHERE id = ? AND question_id = ? AND workspace_id = ?`,
          )
          .run(evidenceId, questionId, workspaceId).changes === 1;
      if (removed) this.compactOrder(questionId);
      return removed;
    });
    return operation();
  }

  public reorderEvidence(
    workspaceId: string,
    questionId: string,
    evidenceIds: readonly string[],
  ): void {
    const operation = this.database.transaction(() => {
      this.requireMutableQuestion(workspaceId, questionId);
      const current = this.listEvidence(workspaceId, questionId).map(({ id }) => id);
      if (
        current.length !== evidenceIds.length ||
        new Set(evidenceIds).size !== evidenceIds.length ||
        current.some((id) => !evidenceIds.includes(id))
      ) {
        throw new LibraryError(
          'INVALID_INPUT',
          'Evidence order must contain every current evidence ID exactly once.',
        );
      }
      const temporaryOffset = evidenceIds.length + 1;
      this.database
        .prepare('UPDATE question_evidence SET sort_order = sort_order + ? WHERE question_id = ?')
        .run(temporaryOffset, questionId);
      evidenceIds.forEach((id, index) => {
        this.database
          .prepare('UPDATE question_evidence SET sort_order = ? WHERE id = ? AND question_id = ?')
          .run(index, id, questionId);
      });
    });
    operation();
  }

  public getEvidence(
    workspaceId: string,
    questionId: string,
    evidenceId: string,
  ): StoredEvidence | null {
    const row = this.database
      .prepare(`${EVIDENCE_SELECT} WHERE id = ? AND question_id = ? AND workspace_id = ?`)
      .get(evidenceId, questionId, workspaceId) as EvidenceRow | undefined;
    return row ? mapEvidence(row) : null;
  }

  public codeLocationExists(evidence: StoredCodeEvidence): boolean {
    return this.matchesCodeLocation({
      ...evidence,
      sourceSnapshotIdentity: evidence.sourceSnapshotIdentity,
    });
  }

  private matchesCodeLocation(
    input: Pick<
      AddCodeEvidenceInput,
      | 'repositoryId'
      | 'sourceSnapshotIdentity'
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
            input.sourceSnapshotIdentity,
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
          input.sourceSnapshotIdentity,
          input.relativePath,
          input.contentHash,
          input.startLine,
          input.endLine,
        ),
    );
  }

  private nextOrder(questionId: string): number {
    return (
      this.database
        .prepare(
          `SELECT coalesce(max(sort_order), -1) + 1 AS value
      FROM question_evidence WHERE question_id = ?`,
        )
        .get(questionId) as { readonly value: number }
    ).value;
  }

  private compactOrder(questionId: string): void {
    const ids = this.database
      .prepare('SELECT id FROM question_evidence WHERE question_id = ? ORDER BY sort_order')
      .all(questionId) as { readonly id: string }[];
    ids.forEach(({ id }, index) =>
      this.database
        .prepare('UPDATE question_evidence SET sort_order = ? WHERE id = ?')
        .run(index, id),
    );
  }

  private requireMutableWorkspace(id: string): void {
    const row = this.database.prepare('SELECT status FROM workspaces WHERE id = ?').get(id) as
      { readonly status: string } | undefined;
    if (!row) throw new LibraryError('NOT_FOUND', 'The Workspace no longer exists.');
    if (row.status === 'archived')
      throw new LibraryError('CONFLICT', 'Archived Workspaces cannot be changed.');
  }

  private requireWorkspace(id: string): void {
    if (!this.database.prepare('SELECT 1 FROM workspaces WHERE id = ?').get(id))
      throw new LibraryError('NOT_FOUND', 'The Workspace no longer exists.');
  }

  private requireMutableQuestion(workspaceId: string, questionId: string): ResearchQuestion {
    this.requireMutableWorkspace(workspaceId);
    const question = this.require(workspaceId, questionId);
    if (question.archivedAt)
      throw new LibraryError('CONFLICT', 'Archived Questions cannot be changed.');
    return question;
  }

  private require(workspaceId: string, questionId: string): ResearchQuestion {
    const question = this.get(workspaceId, questionId);
    if (!question) throw new LibraryError('NOT_FOUND', 'The Research Question no longer exists.');
    return question;
  }

  private requireEvidence(
    workspaceId: string,
    questionId: string,
    evidenceId: string,
  ): StoredEvidence {
    const evidence = this.getEvidence(workspaceId, questionId, evidenceId);
    if (!evidence) throw new LibraryError('NOT_FOUND', 'The Evidence no longer exists.');
    return evidence;
  }

  private throwConflict(workspaceId: string, questionId: string): never {
    this.require(workspaceId, questionId);
    throw new LibraryError(
      'CONFLICT',
      'The Research Question changed elsewhere. Reload it and try again.',
    );
  }
}

function mapQuestion(row: QuestionRow): ResearchQuestion {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
  };
}

function mapEvidence(row: EvidenceRow): StoredEvidence {
  const base = {
    id: row.id,
    questionId: row.question_id,
    workspaceId: row.workspace_id,
    note: row.note,
    sourceSnapshotIdentity: row.source_snapshot_identity,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
  if (row.kind === 'zotero_paper') {
    if (
      !row.zotero_server_id ||
      !row.zotero_library_type ||
      !row.zotero_library_id ||
      !row.zotero_item_key ||
      row.zotero_item_version === null
    )
      throw new Error('Invalid Zotero evidence row.');
    return {
      ...base,
      kind: 'zotero_paper',
      itemRef: {
        serverId: row.zotero_server_id,
        library: { type: row.zotero_library_type, id: row.zotero_library_id },
        itemKey: row.zotero_item_key,
      },
      itemVersion: row.zotero_item_version,
      pageNumber: row.page_number,
      textAnchor: row.text_anchor_exact
        ? {
            exact: row.text_anchor_exact,
            prefix: row.text_anchor_prefix ?? '',
            suffix: row.text_anchor_suffix ?? '',
          }
        : null,
    };
  }
  if (
    !row.repository_id ||
    !row.code_language ||
    !row.relative_path ||
    !row.content_hash ||
    row.start_line === null ||
    row.end_line === null
  )
    throw new Error('Invalid code evidence row.');
  return {
    ...base,
    kind: 'code',
    repositoryId: row.repository_id,
    language: row.code_language,
    relativePath: row.relative_path,
    symbolKind: row.symbol_kind,
    symbolName: row.symbol_name,
    startLine: row.start_line,
    endLine: row.end_line,
    contentHash: row.content_hash,
  };
}
