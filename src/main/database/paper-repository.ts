import type Database from 'better-sqlite3';

import type {
  PaperDetails,
  PaperFileInfo,
  PaperListQuery,
  PaperListResult,
  PaperMetadataUpdate,
  PaperStatus,
  PaperSummary,
} from '../../shared/contracts/library';
import { LibraryError } from '../library/errors';
import type { CreateImportedPaperResult, ImportedPaperRecord } from '../library/paper-data-gateway';

interface PaperRow {
  readonly id: string;
  readonly title: string;
  readonly abstract: string | null;
  readonly year: number | null;
  readonly doi: string | null;
  readonly venue: string | null;
  readonly language: string | null;
  readonly status: PaperStatus;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
  readonly file_id: string;
  readonly original_filename: string;
  readonly internal_filename: string;
  readonly byte_size: number;
  readonly sha256: string;
  readonly mime_type: 'application/pdf';
  readonly imported_at: string;
}

const PAPER_SELECT = `
  SELECT
    p.id,
    p.title,
    p.abstract,
    p.year,
    p.doi,
    p.venue,
    p.language,
    p.status,
    p.created_at,
    p.updated_at,
    p.row_version,
    pf.id AS file_id,
    pf.original_filename,
    pf.internal_filename,
    pf.byte_size,
    pf.sha256,
    pf.mime_type,
    pf.imported_at
  FROM papers p
  JOIN paper_files pf ON pf.id = p.active_file_id
`;

function mapFile(row: PaperRow): PaperFileInfo {
  return {
    id: row.file_id,
    originalFilename: row.original_filename,
    internalFilename: row.internal_filename,
    byteSize: row.byte_size,
    sha256: row.sha256,
    mimeType: row.mime_type,
    importedAt: row.imported_at,
  };
}

function mapSummary(row: PaperRow, authors: readonly string[] = []): PaperSummary {
  return {
    id: row.id,
    title: row.title,
    year: row.year,
    authors,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
    file: mapFile(row),
  };
}

export class PaperRepository {
  public constructor(private readonly database: Database.Database) {}

  public list(query: PaperListQuery = {}): PaperListResult {
    const search = query.search?.trim() ?? '';
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const like = `%${search.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
    const filter = search.length > 0 ? "AND p.title LIKE ? ESCAPE '\\'" : '';
    const parameters = search.length > 0 ? [like, limit, offset] : [limit, offset];
    const rows = this.database
      .prepare(
        `${PAPER_SELECT} WHERE p.status = 'ready' ${filter} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...parameters) as PaperRow[];
    const totalRow = this.database
      .prepare(`SELECT count(*) AS total FROM papers p WHERE p.status = 'ready' ${filter}`)
      .get(...(search.length > 0 ? [like] : [])) as { readonly total: number };

    return {
      items: rows.map((row) => mapSummary(row, this.listAuthors(row.id))),
      total: totalRow.total,
    };
  }

  public getById(id: string): PaperDetails | null {
    const row = this.database
      .prepare(`${PAPER_SELECT} WHERE p.id = ? AND p.status = 'ready'`)
      .get(id) as PaperRow | undefined;
    return row ? this.mapDetails(row) : null;
  }

  public findByHash(sha256: string): PaperDetails | null {
    const row = this.database
      .prepare(`${PAPER_SELECT} WHERE pf.sha256 = ? AND p.status = 'ready'`)
      .get(sha256) as PaperRow | undefined;
    return row ? this.mapDetails(row) : null;
  }

  public createImported(input: ImportedPaperRecord): CreateImportedPaperResult {
    const create = this.database.transaction((): CreateImportedPaperResult => {
      const duplicate = this.findByHash(input.sha256);
      if (duplicate) {
        return { status: 'duplicate', paper: duplicate };
      }

      this.database
        .prepare(
          `INSERT INTO papers (
            id, title, status, metadata_source, created_at, updated_at, row_version
          ) VALUES (?, ?, 'importing', 'manual', ?, ?, 1)`,
        )
        .run(input.paperId, input.title, input.importedAt, input.importedAt);
      this.database
        .prepare(
          `INSERT INTO paper_files (
            id, paper_id, sha256, relative_path, internal_filename, original_filename,
            byte_size, mime_type, is_encrypted, imported_at, verified_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'application/pdf', 0, ?, ?)`,
        )
        .run(
          input.paperFileId,
          input.paperId,
          input.sha256,
          input.relativePath,
          input.internalFilename,
          input.originalFilename,
          input.byteSize,
          input.importedAt,
          input.importedAt,
        );
      this.database
        .prepare("UPDATE papers SET active_file_id = ?, status = 'ready' WHERE id = ?")
        .run(input.paperFileId, input.paperId);

      const paper = this.getById(input.paperId);
      if (!paper) {
        throw new LibraryError('DATABASE_ERROR', 'Imported paper could not be read back.');
      }
      return { status: 'created', paper };
    });

    return create();
  }

  public updateMetadata(input: PaperMetadataUpdate): PaperDetails {
    const result = this.database
      .prepare(
        `UPDATE papers
         SET title = ?, abstract = ?, year = ?, doi = ?, venue = ?, language = ?,
             updated_at = ?, row_version = row_version + 1
         WHERE id = ? AND row_version = ? AND status = 'ready'`,
      )
      .run(
        input.title,
        input.abstract,
        input.year,
        input.doi,
        input.venue,
        input.language,
        new Date().toISOString(),
        input.id,
        input.rowVersion,
      );

    if (result.changes === 0) {
      if (!this.getById(input.id)) {
        throw new LibraryError('NOT_FOUND', 'The paper no longer exists.');
      }
      throw new LibraryError('CONFLICT', 'The paper changed elsewhere. Reload it and try again.');
    }

    const paper = this.getById(input.id);
    if (!paper) {
      throw new LibraryError('DATABASE_ERROR', 'Updated paper could not be read back.');
    }
    return paper;
  }

  public remove(id: string): PaperDetails {
    const paper = this.getById(id);
    if (!paper) {
      throw new LibraryError('NOT_FOUND', 'The paper no longer exists.');
    }

    const remove = this.database.transaction(() => {
      const result = this.database.prepare('DELETE FROM papers WHERE id = ?').run(id);
      if (result.changes !== 1) {
        throw new LibraryError('DATABASE_ERROR', 'The paper record could not be removed.');
      }
    });
    remove();
    return paper;
  }

  private mapDetails(row: PaperRow): PaperDetails {
    return {
      ...mapSummary(row, this.listAuthors(row.id)),
      abstract: row.abstract,
      doi: row.doi,
      venue: row.venue,
      language: row.language,
      tags: this.listStrings(
        `SELECT t.name AS value
         FROM tags t JOIN paper_tags pt ON pt.tag_id = t.id
         WHERE pt.paper_id = ? ORDER BY t.name COLLATE NOCASE`,
        row.id,
      ),
      collections: this.listStrings(
        `SELECT c.name AS value
         FROM collections c JOIN collection_papers cp ON cp.collection_id = c.id
         WHERE cp.paper_id = ? ORDER BY c.sort_order, c.name COLLATE NOCASE`,
        row.id,
      ),
    };
  }

  private listAuthors(paperId: string): readonly string[] {
    return this.listStrings(
      `SELECT a.display_name AS value
       FROM authors a JOIN paper_authors pa ON pa.author_id = a.id
       WHERE pa.paper_id = ? ORDER BY pa.position`,
      paperId,
    );
  }

  private listStrings(sql: string, paperId: string): readonly string[] {
    return (this.database.prepare(sql).all(paperId) as { readonly value: string }[]).map(
      ({ value }) => value,
    );
  }
}
