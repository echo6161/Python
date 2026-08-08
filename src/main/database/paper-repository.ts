import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type {
  BatchPaperUpdate,
  BatchPaperUpdateResult,
  Collection,
  CreateCollectionInput,
  CreateTagInput,
  LibraryOrganization,
  MetadataEvidence,
  MetadataFieldName,
  PaperDetails,
  PaperDetailsUpdate,
  PaperFileInfo,
  PaperListQuery,
  PaperListResult,
  PaperMetadataUpdate,
  PaperOrganizationUpdate,
  PaperStatus,
  PaperSummary,
  Tag,
} from '../../shared/contracts/library';
import { LibraryError } from '../library/errors';
import type {
  CreateImportedPaperResult,
  ImportedMetadataField,
  ImportedMetadataValue,
  ImportedPaperRecord,
  PaperTextExtractionRecord,
  PendingPaperTextExtraction,
} from '../library/paper-data-gateway';

interface PaperRow {
  readonly id: string;
  readonly title: string;
  readonly abstract: string | null;
  readonly year: number | null;
  readonly doi: string | null;
  readonly venue: string | null;
  readonly language: string | null;
  readonly status: PaperStatus;
  readonly reading_status: PaperSummary['readingStatus'];
  readonly is_favorite: number;
  readonly metadata_review_status: PaperSummary['metadataReviewStatus'];
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
  readonly file_id: string;
  readonly original_filename: string;
  readonly internal_filename: string;
  readonly byte_size: number;
  readonly sha256: string;
  readonly mime_type: 'application/pdf';
  readonly page_count: number | null;
  readonly text_extraction_status: PaperFileInfo['textExtractionStatus'];
  readonly imported_at: string;
}

interface MetadataFieldRow {
  readonly field_name: MetadataFieldName;
  readonly value_json: string;
  readonly source: MetadataEvidence['source'];
  readonly confidence: MetadataEvidence['confidence'];
  readonly user_edited: number;
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
    p.reading_status,
    p.is_favorite,
    p.metadata_review_status,
    p.created_at,
    p.updated_at,
    p.row_version,
    pf.id AS file_id,
    pf.original_filename,
    pf.internal_filename,
    pf.byte_size,
    pf.sha256,
    pf.mime_type,
    pf.page_count,
    pf.text_extraction_status,
    pf.imported_at
  FROM papers p
  JOIN paper_files pf ON pf.id = p.active_file_id
`;

const SORT_COLUMNS = {
  updatedAt: 'p.updated_at',
  importedAt: 'pf.imported_at',
  title: 'p.title COLLATE NOCASE',
  year: 'p.year',
  author: `(SELECT a.display_name COLLATE NOCASE
            FROM authors a JOIN paper_authors pa ON pa.author_id = a.id
            WHERE pa.paper_id = p.id
            ORDER BY pa.position ASC
            LIMIT 1)`,
} as const;

function escapeLike(value: string): string {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
}

function buildFtsTerms(value: string): readonly string[] {
  const terms =
    value
      .normalize('NFKC')
      .match(/[\p{L}\p{N}]+/gu)
      ?.slice(0, 20) ?? [];
  return terms.map((term) => `"${term.replaceAll('"', '""')}"*`);
}

function normalizeName(value: string): string {
  return value.normalize('NFKC').trim().replaceAll(/\s+/g, ' ').toLocaleLowerCase();
}

function normalizeDoi(value: string | null): string | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[\s.,;]+$/g, '');
  if (!/^10\.\d{4,9}\/[\w.()/:;-]+$/i.test(normalized)) {
    throw new LibraryError('INVALID_INPUT', 'Enter a valid DOI or leave the field empty.');
  }
  return normalized.toLocaleLowerCase();
}

export class PaperRepository {
  public constructor(private readonly database: Database.Database) {}

  public list(query: PaperListQuery = {}): PaperListResult {
    const conditions = ["p.status = 'ready'"];
    const parameters: unknown[] = [];
    const addLikeFilter = (column: string, value: string | undefined) => {
      const trimmed = value?.trim();
      if (trimmed) {
        conditions.push(`${column} LIKE ? ESCAPE '\\'`);
        parameters.push(escapeLike(trimmed));
      }
    };

    const search = query.search?.trim();
    if (search) {
      conditions.push(`(
        p.title LIKE ? ESCAPE '\\'
        OR EXISTS (
          SELECT 1 FROM paper_authors pa
          JOIN authors a ON a.id = pa.author_id
          WHERE pa.paper_id = p.id AND a.display_name LIKE ? ESCAPE '\\'
        )
      )`);
      const like = escapeLike(search);
      parameters.push(like, like);
    }
    addLikeFilter('p.title', query.title);
    if (query.author?.trim()) {
      conditions.push(`EXISTS (
        SELECT 1 FROM paper_authors pa
        JOIN authors a ON a.id = pa.author_id
        WHERE pa.paper_id = p.id AND a.display_name LIKE ? ESCAPE '\\'
      )`);
      parameters.push(escapeLike(query.author.trim()));
    }
    if (query.year !== undefined) {
      conditions.push('p.year = ?');
      parameters.push(query.year);
    }
    if (query.tagIds && query.tagIds.length > 0) {
      const placeholders = query.tagIds.map(() => '?').join(', ');
      conditions.push(`(
        SELECT count(DISTINCT pt.tag_id) FROM paper_tags pt
        WHERE pt.paper_id = p.id AND pt.tag_id IN (${placeholders})
      ) = ?`);
      parameters.push(...query.tagIds, query.tagIds.length);
    }
    if (query.collectionId) {
      conditions.push(`EXISTS (
        SELECT 1 FROM collection_papers cp
        WHERE cp.paper_id = p.id AND cp.collection_id = ?
      )`);
      parameters.push(query.collectionId);
    }
    if (query.readingStatuses && query.readingStatuses.length > 0) {
      conditions.push(`p.reading_status IN (${query.readingStatuses.map(() => '?').join(', ')})`);
      parameters.push(...query.readingStatuses);
    }
    if (query.favorite !== undefined) {
      conditions.push('p.is_favorite = ?');
      parameters.push(query.favorite ? 1 : 0);
    }
    const fullText = query.fullText?.trim();
    if (fullText) {
      const terms = buildFtsTerms(fullText);
      if (terms.length > 0) {
        for (const term of terms) {
          conditions.push(
            `EXISTS (
              SELECT 1 FROM paper_full_text pft
              WHERE pft.paper_id = p.id AND paper_full_text MATCH ?
            )`,
          );
          parameters.push(term);
        }
      } else {
        conditions.push('0 = 1');
      }
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const sortBy = query.sortBy ?? 'updatedAt';
    const direction = query.sortDirection ?? (sortBy === 'title' ? 'asc' : 'desc');
    const nullOrdering =
      sortBy === 'year' || sortBy === 'author' ? `${SORT_COLUMNS[sortBy]} IS NULL, ` : '';
    const order = `${nullOrdering}${SORT_COLUMNS[sortBy]} ${direction.toUpperCase()}, p.id ASC`;
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const rows = this.database
      .prepare(`${PAPER_SELECT} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...parameters, limit, offset) as PaperRow[];
    const totalRow = this.database
      .prepare(
        `SELECT count(*) AS total FROM papers p JOIN paper_files pf ON pf.id = p.active_file_id ${where}`,
      )
      .get(...parameters) as { readonly total: number };

    return { items: rows.map((row) => this.mapSummary(row)), total: totalRow.total };
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
      if (duplicate) return { status: 'duplicate', paper: duplicate };

      const metadata = new Map(input.metadata.map((field) => [field.field, field]));
      const title = this.stringMetadata(metadata.get('title')) ?? input.fallbackTitle;
      const abstract = this.stringMetadata(metadata.get('abstract'));
      const year = this.numberMetadata(metadata.get('year'));
      const authors = this.authorsMetadata(metadata.get('authors'));
      const hasExtractedMetadata = input.metadata.some(
        ({ source }) => source === 'pdf_metadata' || source === 'first_page',
      );

      this.database
        .prepare(
          `INSERT INTO papers (
            id, title, abstract, year, status, metadata_source, created_at, updated_at,
            row_version, reading_status, is_favorite, metadata_review_status
          ) VALUES (?, ?, ?, ?, 'importing', ?, ?, ?, 1, 'unread', 0, 'pending')`,
        )
        .run(
          input.paperId,
          title,
          abstract,
          year,
          hasExtractedMetadata ? 'pdf' : 'manual',
          input.importedAt,
          input.importedAt,
        );
      this.database
        .prepare(
          `INSERT INTO paper_files (
            id, paper_id, sha256, relative_path, internal_filename, original_filename,
            byte_size, mime_type, page_count, is_encrypted, imported_at, verified_at,
            text_extraction_status, extraction_error_code
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'application/pdf', ?, 0, ?, ?, ?, ?)`,
        )
        .run(
          input.paperFileId,
          input.paperId,
          input.sha256,
          input.relativePath,
          input.internalFilename,
          input.originalFilename,
          input.byteSize,
          input.pageCount,
          input.importedAt,
          input.importedAt,
          input.textExtractionStatus,
          input.extractionErrorCode,
        );

      const insertMetadata = this.database.prepare(
        `INSERT INTO paper_metadata_fields (
          paper_id, field_name, value_json, source, confidence, user_edited, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, ?)`,
      );
      for (const field of input.metadata) {
        insertMetadata.run(
          input.paperId,
          field.field,
          JSON.stringify(field.value),
          field.source,
          field.confidence,
          input.importedAt,
        );
      }

      this.replaceAuthors(input.paperId, authors);
      this.insertTextExtraction({
        paperId: input.paperId,
        paperFileId: input.paperFileId,
        pages: input.pages,
        pageCount: input.pageCount,
        textExtractionStatus: input.textExtractionStatus,
        extractionErrorCode: input.extractionErrorCode,
        extractedAt: input.importedAt,
      });

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
    const update = this.database.transaction(() => {
      const doi = normalizeDoi(input.doi);
      if (doi) {
        const duplicate = this.database
          .prepare(
            "SELECT id FROM papers WHERE lower(doi) = lower(?) AND id <> ? AND status = 'ready'",
          )
          .get(doi, input.id) as { readonly id: string } | undefined;
        if (duplicate) {
          throw new LibraryError('CONFLICT', 'That DOI is already assigned to another paper.');
        }
      }
      const now = new Date().toISOString();
      const result = this.database
        .prepare(
          `UPDATE papers
           SET title = ?, abstract = ?, year = ?, doi = ?, venue = ?, language = ?,
               metadata_source = 'manual', metadata_review_status = 'confirmed',
               updated_at = ?, row_version = row_version + 1
           WHERE id = ? AND row_version = ? AND status = 'ready'`,
        )
        .run(
          input.title,
          input.abstract,
          input.year,
          doi,
          input.venue,
          input.language,
          now,
          input.id,
          input.rowVersion,
        );
      this.assertUpdated(result.changes, input.id);
      this.replaceAuthors(input.id, input.authors);

      const values: Readonly<Record<MetadataFieldName, ImportedMetadataValue>> = {
        title: input.title,
        authors: input.authors,
        abstract: input.abstract,
        year: input.year,
        doi,
      };
      const upsert = this.database.prepare(
        `INSERT INTO paper_metadata_fields (
          paper_id, field_name, value_json, source, confidence, user_edited, updated_at
        ) VALUES (?, ?, ?, 'manual', 'confirmed', 1, ?)
        ON CONFLICT(paper_id, field_name) DO UPDATE SET
          value_json = excluded.value_json,
          source = 'manual',
          confidence = 'confirmed',
          user_edited = 1,
          updated_at = excluded.updated_at`,
      );
      for (const [field, value] of Object.entries(values)) {
        upsert.run(input.id, field, JSON.stringify(value), now);
      }
    });
    update();
    return this.requirePaper(input.id, 'Updated paper could not be read back.');
  }

  public updateDetails(input: PaperDetailsUpdate): PaperDetails {
    const update = this.database.transaction(() => {
      const metadataPaper = this.updateMetadata(input.metadata);
      return this.updateOrganization({
        id: metadataPaper.id,
        rowVersion: metadataPaper.rowVersion,
        ...input.organization,
      });
    });
    return update();
  }

  public updateOrganization(input: PaperOrganizationUpdate): PaperDetails {
    const update = this.database.transaction(() => {
      this.assertOrganizationIds(input.tagIds, input.collectionIds);
      const now = new Date().toISOString();
      const result = this.database
        .prepare(
          `UPDATE papers
           SET reading_status = ?, is_favorite = ?, updated_at = ?, row_version = row_version + 1
           WHERE id = ? AND row_version = ? AND status = 'ready'`,
        )
        .run(input.readingStatus, input.isFavorite ? 1 : 0, now, input.id, input.rowVersion);
      this.assertUpdated(result.changes, input.id);
      this.database.prepare('DELETE FROM paper_tags WHERE paper_id = ?').run(input.id);
      this.database.prepare('DELETE FROM collection_papers WHERE paper_id = ?').run(input.id);
      const addTag = this.database.prepare(
        'INSERT INTO paper_tags (paper_id, tag_id, created_at) VALUES (?, ?, ?)',
      );
      for (const tagId of input.tagIds) addTag.run(input.id, tagId, now);
      const addCollection = this.database.prepare(
        'INSERT INTO collection_papers (collection_id, paper_id, added_at) VALUES (?, ?, ?)',
      );
      for (const collectionId of input.collectionIds) {
        addCollection.run(collectionId, input.id, now);
      }
    });
    update();
    return this.requirePaper(input.id, 'Updated paper could not be read back.');
  }

  public batchUpdate(input: BatchPaperUpdate): BatchPaperUpdateResult {
    const update = this.database.transaction(() => {
      this.assertOrganizationIds(input.addTagIds, []);
      const placeholders = input.ids.map(() => '?').join(', ');
      const count = this.database
        .prepare(
          `SELECT count(*) AS total FROM papers WHERE status = 'ready' AND id IN (${placeholders})`,
        )
        .get(...input.ids) as { readonly total: number };
      if (count.total !== input.ids.length) {
        throw new LibraryError('NOT_FOUND', 'One or more selected papers no longer exist.');
      }
      const now = new Date().toISOString();
      const addTag = this.database.prepare(
        'INSERT OR IGNORE INTO paper_tags (paper_id, tag_id, created_at) VALUES (?, ?, ?)',
      );
      for (const paperId of input.ids) {
        for (const tagId of input.addTagIds) addTag.run(paperId, tagId, now);
      }
      if (input.readingStatus) {
        this.database
          .prepare(
            `UPDATE papers SET reading_status = ?, updated_at = ?, row_version = row_version + 1
             WHERE id IN (${placeholders})`,
          )
          .run(input.readingStatus, now, ...input.ids);
      } else if (input.addTagIds.length > 0) {
        this.database
          .prepare(
            `UPDATE papers SET updated_at = ?, row_version = row_version + 1
             WHERE id IN (${placeholders})`,
          )
          .run(now, ...input.ids);
      }
    });
    update();
    return { updatedIds: input.ids };
  }

  public listOrganization(): LibraryOrganization {
    return {
      tags: this.database
        .prepare('SELECT id, name, color FROM tags ORDER BY name COLLATE NOCASE')
        .all()
        .map((row) => this.mapTag(row as { id: string; name: string; color: string | null })),
      collections: this.database
        .prepare(
          'SELECT id, name, description, sort_order FROM collections ORDER BY sort_order, name COLLATE NOCASE',
        )
        .all()
        .map((row) =>
          this.mapCollection(
            row as { id: string; name: string; description: string | null; sort_order: number },
          ),
        ),
    };
  }

  public createTag(input: CreateTagInput): Tag {
    const normalized = normalizeName(input.name);
    const existing = this.database
      .prepare('SELECT id, name, color FROM tags WHERE normalized_name = ?')
      .get(normalized) as { id: string; name: string; color: string | null } | undefined;
    if (existing) return this.mapTag(existing);
    const id = randomUUID();
    this.database
      .prepare(
        'INSERT INTO tags (id, name, normalized_name, color, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, input.name.trim(), normalized, input.color, new Date().toISOString());
    return { id, name: input.name.trim(), color: input.color };
  }

  public deleteTag(id: string): void {
    this.database.transaction(() => {
      this.database
        .prepare(
          `UPDATE papers
           SET updated_at = ?, row_version = row_version + 1
           WHERE id IN (SELECT paper_id FROM paper_tags WHERE tag_id = ?)`,
        )
        .run(new Date().toISOString(), id);
      if (this.database.prepare('DELETE FROM tags WHERE id = ?').run(id).changes !== 1) {
        throw new LibraryError('NOT_FOUND', 'The tag no longer exists.');
      }
    })();
  }

  public createCollection(input: CreateCollectionInput): Collection {
    const existing = this.database
      .prepare('SELECT id FROM collections WHERE name = ? COLLATE NOCASE')
      .get(input.name.trim()) as { readonly id: string } | undefined;
    if (existing) throw new LibraryError('CONFLICT', 'A collection with that name already exists.');
    const id = randomUUID();
    const now = new Date().toISOString();
    const row = this.database
      .prepare('SELECT COALESCE(max(sort_order), -1) + 1 AS next FROM collections')
      .get() as {
      readonly next: number;
    };
    this.database
      .prepare(
        `INSERT INTO collections (id, name, description, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.name.trim(), input.description, row.next, now, now);
    return { id, name: input.name.trim(), description: input.description, sortOrder: row.next };
  }

  public deleteCollection(id: string): void {
    this.database.transaction(() => {
      this.database
        .prepare(
          `UPDATE papers
           SET updated_at = ?, row_version = row_version + 1
           WHERE id IN (
             SELECT paper_id FROM collection_papers WHERE collection_id = ?
           )`,
        )
        .run(new Date().toISOString(), id);
      if (this.database.prepare('DELETE FROM collections WHERE id = ?').run(id).changes !== 1) {
        throw new LibraryError('NOT_FOUND', 'The collection no longer exists.');
      }
    })();
  }

  public listPendingTextExtractions(): readonly PendingPaperTextExtraction[] {
    return this.database
      .prepare(
        `SELECT pf.paper_id, pf.id AS paper_file_id, pf.relative_path
         FROM paper_files pf
         JOIN papers p ON p.id = pf.paper_id AND p.active_file_id = pf.id
         WHERE p.status = 'ready' AND pf.text_extraction_status = 'pending'
         ORDER BY pf.imported_at, pf.id`,
      )
      .all()
      .map((row) => {
        const value = row as {
          readonly paper_id: string;
          readonly paper_file_id: string;
          readonly relative_path: string;
        };
        return {
          paperId: value.paper_id,
          paperFileId: value.paper_file_id,
          relativePath: value.relative_path,
        };
      });
  }

  public saveTextExtraction(input: PaperTextExtractionRecord): void {
    const save = this.database.transaction(() => {
      const file = this.database
        .prepare('SELECT paper_id FROM paper_files WHERE id = ?')
        .get(input.paperFileId) as { readonly paper_id: string } | undefined;
      if (file?.paper_id !== input.paperId) {
        throw new LibraryError('NOT_FOUND', 'The paper file no longer exists.');
      }
      this.database
        .prepare('DELETE FROM document_pages WHERE paper_file_id = ?')
        .run(input.paperFileId);
      this.database.prepare('DELETE FROM paper_full_text WHERE paper_id = ?').run(input.paperId);
      this.insertTextExtraction(input);
      const result = this.database
        .prepare(
          `UPDATE paper_files
           SET page_count = ?, text_extraction_status = ?, extraction_error_code = ?
           WHERE id = ? AND paper_id = ?`,
        )
        .run(
          input.pageCount,
          input.textExtractionStatus,
          input.extractionErrorCode,
          input.paperFileId,
          input.paperId,
        );
      if (result.changes !== 1) {
        throw new LibraryError('DATABASE_ERROR', 'The text index status could not be saved.');
      }
    });
    save();
  }

  public remove(id: string): PaperDetails {
    const paper = this.getById(id);
    if (!paper) throw new LibraryError('NOT_FOUND', 'The paper no longer exists.');
    const remove = this.database.transaction(() => {
      this.database.prepare('DELETE FROM paper_full_text WHERE paper_id = ?').run(id);
      if (this.database.prepare('DELETE FROM papers WHERE id = ?').run(id).changes !== 1) {
        throw new LibraryError('DATABASE_ERROR', 'The paper record could not be removed.');
      }
      this.database
        .prepare(
          'DELETE FROM authors WHERE NOT EXISTS (SELECT 1 FROM paper_authors pa WHERE pa.author_id = authors.id)',
        )
        .run();
    });
    remove();
    return paper;
  }

  private mapFile(row: PaperRow): PaperFileInfo {
    return {
      id: row.file_id,
      originalFilename: row.original_filename,
      internalFilename: row.internal_filename,
      byteSize: row.byte_size,
      sha256: row.sha256,
      mimeType: row.mime_type,
      pageCount: row.page_count,
      textExtractionStatus: row.text_extraction_status,
      importedAt: row.imported_at,
    };
  }

  private mapSummary(row: PaperRow): PaperSummary {
    return {
      id: row.id,
      title: row.title,
      year: row.year,
      authors: this.listAuthors(row.id),
      status: row.status,
      readingStatus: row.reading_status,
      isFavorite: row.is_favorite === 1,
      metadataReviewStatus: row.metadata_review_status,
      tags: this.listTags(row.id),
      collections: this.listCollections(row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      rowVersion: row.row_version,
      file: this.mapFile(row),
    };
  }

  private mapDetails(row: PaperRow): PaperDetails {
    const metadata = this.listMetadata(row.id);
    const doiCandidate = this.metadataValue(metadata, 'doi');
    return {
      ...this.mapSummary(row),
      abstract: row.abstract,
      doi: row.doi ?? (typeof doiCandidate === 'string' ? doiCandidate : null),
      venue: row.venue,
      language: row.language,
      metadataEvidence: metadata.map(({ field_name, source, confidence, user_edited }) => ({
        field: field_name,
        source,
        confidence,
        userEdited: user_edited === 1,
      })),
    };
  }

  private listMetadata(paperId: string): readonly MetadataFieldRow[] {
    return this.database
      .prepare(
        `SELECT field_name, value_json, source, confidence, user_edited
         FROM paper_metadata_fields WHERE paper_id = ? ORDER BY field_name`,
      )
      .all(paperId) as MetadataFieldRow[];
  }

  private metadataValue(rows: readonly MetadataFieldRow[], field: MetadataFieldName): unknown {
    const value = rows.find(({ field_name }) => field_name === field)?.value_json;
    if (value === undefined) return null;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new LibraryError('DATABASE_ERROR', 'Stored metadata could not be decoded.');
    }
  }

  private listAuthors(paperId: string): readonly string[] {
    return (
      this.database
        .prepare(
          `SELECT a.display_name AS value
           FROM authors a JOIN paper_authors pa ON pa.author_id = a.id
           WHERE pa.paper_id = ? ORDER BY pa.position`,
        )
        .all(paperId) as { readonly value: string }[]
    ).map(({ value }) => value);
  }

  private listTags(paperId: string): readonly Tag[] {
    return (
      this.database
        .prepare(
          `SELECT t.id, t.name, t.color FROM tags t
           JOIN paper_tags pt ON pt.tag_id = t.id
           WHERE pt.paper_id = ? ORDER BY t.name COLLATE NOCASE`,
        )
        .all(paperId) as { id: string; name: string; color: string | null }[]
    ).map((row) => this.mapTag(row));
  }

  private listCollections(paperId: string): readonly Collection[] {
    return (
      this.database
        .prepare(
          `SELECT c.id, c.name, c.description, c.sort_order FROM collections c
           JOIN collection_papers cp ON cp.collection_id = c.id
           WHERE cp.paper_id = ? ORDER BY c.sort_order, c.name COLLATE NOCASE`,
        )
        .all(paperId) as {
        id: string;
        name: string;
        description: string | null;
        sort_order: number;
      }[]
    ).map((row) => this.mapCollection(row));
  }

  private replaceAuthors(paperId: string, authors: readonly string[]): void {
    this.database.prepare('DELETE FROM paper_authors WHERE paper_id = ?').run(paperId);
    const find = this.database.prepare('SELECT id FROM authors WHERE normalized_name = ?');
    const insertAuthor = this.database.prepare(
      `INSERT INTO authors (id, display_name, normalized_name, created_at) VALUES (?, ?, ?, ?)`,
    );
    const link = this.database.prepare(
      `INSERT INTO paper_authors (paper_id, author_id, position, role) VALUES (?, ?, ?, NULL)`,
    );
    authors.forEach((displayName, position) => {
      const normalized = normalizeName(displayName);
      const existing = find.get(normalized) as { readonly id: string } | undefined;
      const authorId = existing?.id ?? randomUUID();
      if (!existing) {
        insertAuthor.run(authorId, displayName.trim(), normalized, new Date().toISOString());
      }
      link.run(paperId, authorId, position);
    });
    this.database
      .prepare(
        'DELETE FROM authors WHERE NOT EXISTS (SELECT 1 FROM paper_authors pa WHERE pa.author_id = authors.id)',
      )
      .run();
  }

  private insertTextExtraction(input: PaperTextExtractionRecord): void {
    const insertPage = this.database.prepare(
      `INSERT INTO document_pages (
        paper_file_id, page_number, normalized_text, text_hash, extractor_version, extracted_at
      ) VALUES (?, ?, ?, ?, 'pdfjs-6.2.108-v1', ?)`,
    );
    const insertSearchPage = this.database.prepare(
      'INSERT INTO paper_full_text (paper_id, page_number, content) VALUES (?, ?, ?)',
    );
    for (const page of input.pages) {
      insertPage.run(
        input.paperFileId,
        page.pageNumber,
        page.normalizedText,
        page.textHash,
        input.extractedAt,
      );
      if (page.normalizedText.length > 0) {
        insertSearchPage.run(input.paperId, page.pageNumber, page.normalizedText);
      }
    }
  }

  private assertOrganizationIds(tagIds: readonly string[], collectionIds: readonly string[]): void {
    const countExisting = (table: 'tags' | 'collections', ids: readonly string[]) => {
      if (ids.length === 0) return;
      const row = this.database
        .prepare(
          `SELECT count(*) AS total FROM ${table} WHERE id IN (${ids.map(() => '?').join(', ')})`,
        )
        .get(...ids) as { readonly total: number };
      if (row.total !== ids.length) {
        throw new LibraryError('NOT_FOUND', `One or more ${table} no longer exist.`);
      }
    };
    countExisting('tags', tagIds);
    countExisting('collections', collectionIds);
  }

  private assertUpdated(changes: number, id: string): void {
    if (changes !== 0) return;
    if (!this.getById(id)) throw new LibraryError('NOT_FOUND', 'The paper no longer exists.');
    throw new LibraryError('CONFLICT', 'The paper changed elsewhere. Reload it and try again.');
  }

  private requirePaper(id: string, message: string): PaperDetails {
    const paper = this.getById(id);
    if (!paper) throw new LibraryError('DATABASE_ERROR', message);
    return paper;
  }

  private stringMetadata(field: ImportedMetadataField | undefined): string | null {
    return typeof field?.value === 'string' && field.value.trim() ? field.value.trim() : null;
  }

  private numberMetadata(field: ImportedMetadataField | undefined): number | null {
    return typeof field?.value === 'number' ? field.value : null;
  }

  private authorsMetadata(field: ImportedMetadataField | undefined): readonly string[] {
    return Array.isArray(field?.value)
      ? field.value.filter(
          (value): value is string => typeof value === 'string' && value.trim().length > 0,
        )
      : [];
  }

  private mapTag(row: { id: string; name: string; color: string | null }): Tag {
    return { id: row.id, name: row.name, color: row.color };
  }

  private mapCollection(row: {
    id: string;
    name: string;
    description: string | null;
    sort_order: number;
  }): Collection {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      sortOrder: row.sort_order,
    };
  }
}
