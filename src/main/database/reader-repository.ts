import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type {
  Annotation,
  BoundingRect,
  CreateAnnotationInput,
  ReadingState,
  SaveReadingStateInput,
  UpdateAnnotationInput,
} from '../../shared/contracts/reader';
import { LibraryError } from '../library/errors';
import type { ManagedPaperFileRecord } from '../library/paper-data-gateway';

interface AnnotationRow {
  readonly id: string;
  readonly paper_id: string;
  readonly paper_file_id: string;
  readonly kind: Annotation['annotationType'];
  readonly color: Annotation['color'];
  readonly body_markdown: string | null;
  readonly exact_text: string;
  readonly prefix_text: string;
  readonly suffix_text: string;
  readonly page_start: number;
  readonly text_spans_json: string;
  readonly rects_json: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface ReadingStateRow {
  readonly paper_id: string;
  readonly page_number: number;
  readonly scale: number;
  readonly updated_at: string;
}

const ANNOTATION_SELECT = `
  SELECT id, paper_id, paper_file_id, kind, color, body_markdown, exact_text,
         prefix_text, suffix_text, page_start, text_spans_json, rects_json,
         created_at, updated_at, row_version
  FROM annotations
`;

export class ReaderRepository {
  public constructor(private readonly database: Database.Database) {}

  public getManagedPaperFile(paperId: string): ManagedPaperFileRecord | null {
    const row = this.database
      .prepare(
        `SELECT p.id AS paper_id, pf.id AS paper_file_id, pf.relative_path,
                pf.byte_size, pf.sha256
         FROM papers p
         JOIN paper_files pf ON pf.id = p.active_file_id
         WHERE p.id = ? AND p.status = 'ready'`,
      )
      .get(paperId) as
      | {
          readonly paper_id: string;
          readonly paper_file_id: string;
          readonly relative_path: string;
          readonly byte_size: number;
          readonly sha256: string;
        }
      | undefined;
    return row
      ? {
          paperId: row.paper_id,
          paperFileId: row.paper_file_id,
          relativePath: row.relative_path,
          byteSize: row.byte_size,
          sha256: row.sha256,
        }
      : null;
  }

  public listAnnotations(paperId: string): readonly Annotation[] {
    const rows = this.database
      .prepare(
        `${ANNOTATION_SELECT}
         WHERE paper_id = ? AND deleted_at IS NULL
         ORDER BY page_start, created_at`,
      )
      .all(paperId) as AnnotationRow[];
    return rows.map(mapAnnotation);
  }

  public createAnnotation(input: CreateAnnotationInput): Annotation {
    const file = this.getManagedPaperFile(input.paperId);
    if (!file) {
      throw new LibraryError('NOT_FOUND', 'The paper no longer exists.');
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO annotations (
          id, paper_id, paper_file_id, kind, color, body_markdown, exact_text,
          prefix_text, suffix_text, page_start, page_end, text_spans_json,
          rects_json, anchor_status, created_at, updated_at, row_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'valid', ?, ?, 1)`,
      )
      .run(
        id,
        input.paperId,
        file.paperFileId,
        input.annotationType,
        input.color,
        input.comment,
        input.selectedText,
        input.textQuotePrefix,
        input.textQuoteSuffix,
        input.pageNumber,
        input.pageNumber,
        JSON.stringify({ start: input.textStart, end: input.textEnd }),
        JSON.stringify(input.boundingRects),
        now,
        now,
      );
    return this.requireAnnotation(id);
  }

  public updateAnnotation(input: UpdateAnnotationInput): Annotation {
    const now = new Date().toISOString();
    const result = this.database
      .prepare(
        `UPDATE annotations
         SET kind = ?, color = ?, body_markdown = ?, updated_at = ?, row_version = row_version + 1
         WHERE id = ? AND row_version = ? AND deleted_at IS NULL`,
      )
      .run(input.annotationType, input.color, input.comment, now, input.id, input.rowVersion);
    if (result.changes === 0) {
      this.throwMissingOrConflict(input.id);
    }
    return this.requireAnnotation(input.id);
  }

  public deleteAnnotation(id: string, rowVersion: number): void {
    const now = new Date().toISOString();
    const result = this.database
      .prepare(
        `UPDATE annotations
         SET deleted_at = ?, updated_at = ?, row_version = row_version + 1
         WHERE id = ? AND row_version = ? AND deleted_at IS NULL`,
      )
      .run(now, now, id, rowVersion);
    if (result.changes === 0) {
      this.throwMissingOrConflict(id);
    }
  }

  public getReadingState(paperId: string): ReadingState | null {
    const row = this.database
      .prepare(
        `SELECT paper_id, page_number, scale, updated_at
         FROM reading_states WHERE paper_id = ?`,
      )
      .get(paperId) as ReadingStateRow | undefined;
    return row ? mapReadingState(row) : null;
  }

  public saveReadingState(input: SaveReadingStateInput): ReadingState {
    if (!this.getManagedPaperFile(input.paperId)) {
      throw new LibraryError('NOT_FOUND', 'The paper no longer exists.');
    }
    const now = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO reading_states (paper_id, page_number, scale, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(paper_id) DO UPDATE SET
           page_number = excluded.page_number,
           scale = excluded.scale,
           updated_at = excluded.updated_at`,
      )
      .run(input.paperId, input.pageNumber, input.scale, now);
    const saved = this.getReadingState(input.paperId);
    if (!saved) {
      throw new LibraryError('DATABASE_ERROR', 'Reading state could not be read back.');
    }
    return saved;
  }

  private requireAnnotation(id: string): Annotation {
    const row = this.database
      .prepare(`${ANNOTATION_SELECT} WHERE id = ? AND deleted_at IS NULL`)
      .get(id) as AnnotationRow | undefined;
    if (!row) {
      throw new LibraryError('NOT_FOUND', 'The annotation no longer exists.');
    }
    return mapAnnotation(row);
  }

  private throwMissingOrConflict(id: string): never {
    const exists = this.database
      .prepare('SELECT 1 FROM annotations WHERE id = ? AND deleted_at IS NULL')
      .get(id);
    if (!exists) {
      throw new LibraryError('NOT_FOUND', 'The annotation no longer exists.');
    }
    throw new LibraryError(
      'CONFLICT',
      'The annotation changed elsewhere. Reload it and try again.',
    );
  }
}

function mapAnnotation(row: AnnotationRow): Annotation {
  try {
    const span = JSON.parse(row.text_spans_json) as {
      readonly start: number;
      readonly end: number;
    };
    const rects = JSON.parse(row.rects_json) as readonly BoundingRect[];
    return {
      id: row.id,
      paperId: row.paper_id,
      paperFileId: row.paper_file_id,
      pageNumber: row.page_start,
      selectedText: row.exact_text,
      textQuotePrefix: row.prefix_text,
      textQuoteSuffix: row.suffix_text,
      textStart: span.start,
      textEnd: span.end,
      boundingRects: rects,
      annotationType: row.kind,
      color: row.color,
      comment: row.body_markdown,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      rowVersion: row.row_version,
    };
  } catch (error) {
    throw new LibraryError('DATABASE_ERROR', 'Stored annotation anchors are invalid.', {
      cause: error,
    });
  }
}

function mapReadingState(row: ReadingStateRow): ReadingState {
  return {
    paperId: row.paper_id,
    pageNumber: row.page_number,
    scale: row.scale,
    updatedAt: row.updated_at,
  };
}
