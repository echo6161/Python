import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type {
  CodeFileSearchResult,
  CodeIndexStatus,
  CodeSearchInput,
  CodeSearchPage,
  CodeSymbolSearchResult,
  CodeTextSearchResult,
} from '../../shared/contracts/code-intelligence';
import { LibraryError } from '../library/errors';
import type {
  CodeIndexFailureInput,
  CompleteCodeIndexInput,
  StoredCodeFileHash,
} from '../code-intelligence/code-index-data-gateway';

interface CodeIndexStateRow {
  readonly repository_id: string;
  readonly status: Exclude<CodeIndexStatus['status'], 'stale' | 'unindexed'> | 'stale';
  readonly snapshot_identity: string | null;
  readonly dirty: number;
  readonly parser_version: string;
  readonly file_count: number;
  readonly symbol_count: number;
  readonly chunk_count: number;
  readonly processed_files: number;
  readonly total_files: number;
  readonly last_error_code: string | null;
  readonly last_error_message: string | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly updated_at: string;
}

const STATUS_SELECT = `
  SELECT repository_id, status, snapshot_identity, dirty, parser_version,
         file_count, symbol_count, chunk_count, processed_files, total_files,
         last_error_code, last_error_message, started_at, completed_at, updated_at
  FROM code_index_states
`;

export class CodeIndexRepository {
  public constructor(private readonly database: Database.Database) {}

  public recoverInterrupted(updatedAt: string): number {
    return this.database
      .prepare(
        `UPDATE code_index_states
         SET status = 'cancelled', active_request_id = NULL,
             last_error_code = 'INDEX_INTERRUPTED',
             last_error_message = 'The previous indexing task was interrupted and can be retried.',
             updated_at = ?
         WHERE status = 'indexing'`,
      )
      .run(updatedAt).changes;
  }

  public getStatus(repositoryId: string): CodeIndexStatus | null {
    const row = this.database
      .prepare(`${STATUS_SELECT} WHERE repository_id = ?`)
      .get(repositoryId) as CodeIndexStateRow | undefined;
    return row ? mapStatus(row) : null;
  }

  public listFileHashes(repositoryId: string): readonly StoredCodeFileHash[] {
    return (
      this.database
        .prepare(
          `SELECT relative_path, content_hash
           FROM code_index_files WHERE repository_id = ? ORDER BY relative_path`,
        )
        .all(repositoryId) as { readonly relative_path: string; readonly content_hash: string }[]
    ).map((row) => ({ relativePath: row.relative_path, contentHash: row.content_hash }));
  }

  public begin(
    repositoryId: string,
    requestId: string,
    parserVersion: string,
    totalFiles: number,
    startedAt: string,
  ): CodeIndexStatus {
    const operation = this.database.transaction(() => {
      this.requireRepository(repositoryId);
      const current = this.database
        .prepare('SELECT status FROM code_index_states WHERE repository_id = ?')
        .get(repositoryId) as { readonly status: string } | undefined;
      if (current?.status === 'indexing') {
        throw new LibraryError('CONFLICT', 'A code indexing task is already active.');
      }
      this.database
        .prepare(
          `INSERT INTO code_index_states (
           repository_id, status, snapshot_identity, dirty, parser_version,
           file_count, symbol_count, chunk_count, processed_files, total_files,
           active_request_id, last_error_code, last_error_message, started_at,
           completed_at, updated_at
         ) VALUES (?, 'indexing', NULL, 0, ?, 0, 0, 0, 0, ?, ?, NULL, NULL, ?, NULL, ?)
         ON CONFLICT(repository_id) DO UPDATE SET
           status = 'indexing', parser_version = excluded.parser_version,
           processed_files = 0, total_files = excluded.total_files,
           active_request_id = excluded.active_request_id,
           last_error_code = NULL, last_error_message = NULL,
           started_at = excluded.started_at, updated_at = excluded.updated_at`,
        )
        .run(repositoryId, parserVersion, totalFiles, requestId, startedAt, startedAt);
    });
    operation();
    return this.requireStatus(repositoryId);
  }

  public updateProgress(
    repositoryId: string,
    requestId: string,
    processedFiles: number,
    totalFiles: number,
    updatedAt: string,
  ): void {
    const result = this.database
      .prepare(
        `UPDATE code_index_states
         SET processed_files = ?, total_files = ?, updated_at = ?
         WHERE repository_id = ? AND status = 'indexing' AND active_request_id = ?`,
      )
      .run(processedFiles, totalFiles, updatedAt, repositoryId, requestId);
    if (result.changes !== 1)
      throw new LibraryError('CONFLICT', 'Code index task is no longer active.');
  }

  public complete(input: CompleteCodeIndexInput): CodeIndexStatus {
    const operation = this.database.transaction(() => {
      this.requireActive(input.repositoryId, input.requestId);
      if (input.mode === 'rebuild') {
        this.database
          .prepare('DELETE FROM code_index_files WHERE repository_id = ?')
          .run(input.repositoryId);
      } else {
        for (const relativePath of [
          ...input.removedPaths,
          ...input.changedFiles.map((file) => file.relativePath),
        ]) {
          this.database
            .prepare('DELETE FROM code_index_files WHERE repository_id = ? AND relative_path = ?')
            .run(input.repositoryId, relativePath);
        }
        this.database
          .prepare(
            'UPDATE code_index_files SET snapshot_identity = ?, indexed_at = ? WHERE repository_id = ?',
          )
          .run(input.snapshotIdentity, input.completedAt, input.repositoryId);
        this.database
          .prepare('UPDATE code_index_symbols SET snapshot_identity = ? WHERE repository_id = ?')
          .run(input.snapshotIdentity, input.repositoryId);
        this.database
          .prepare('UPDATE code_index_chunks SET snapshot_identity = ? WHERE repository_id = ?')
          .run(input.snapshotIdentity, input.repositoryId);
      }
      for (const file of input.changedFiles) this.insertFile(input, file);
      const counts = this.database
        .prepare(
          `SELECT
             (SELECT count(*) FROM code_index_files WHERE repository_id = ?) AS files,
             (SELECT count(*) FROM code_index_symbols WHERE repository_id = ?) AS symbols,
             (SELECT count(*) FROM code_index_chunks WHERE repository_id = ?) AS chunks`,
        )
        .get(input.repositoryId, input.repositoryId, input.repositoryId) as {
        readonly files: number;
        readonly symbols: number;
        readonly chunks: number;
      };
      this.database
        .prepare(
          `UPDATE code_index_states
           SET status = 'ready', snapshot_identity = ?, dirty = ?, parser_version = ?,
               file_count = ?, symbol_count = ?, chunk_count = ?, processed_files = ?,
               total_files = ?, active_request_id = NULL, last_error_code = NULL,
               last_error_message = NULL, completed_at = ?, updated_at = ?
           WHERE repository_id = ? AND active_request_id = ?`,
        )
        .run(
          input.snapshotIdentity,
          input.dirty ? 1 : 0,
          input.parserVersion,
          counts.files,
          counts.symbols,
          counts.chunks,
          counts.files,
          counts.files,
          input.completedAt,
          input.completedAt,
          input.repositoryId,
          input.requestId,
        );
    });
    operation();
    return this.requireStatus(input.repositoryId);
  }

  public cancel(input: CodeIndexFailureInput): CodeIndexStatus {
    return this.finishFailure('cancelled', input);
  }

  public fail(input: CodeIndexFailureInput): CodeIndexStatus {
    return this.finishFailure('failed', input);
  }

  public markStale(repositoryId: string, updatedAt: string): CodeIndexStatus {
    this.database
      .prepare(
        `UPDATE code_index_states SET status = 'stale', updated_at = ?
         WHERE repository_id = ? AND status <> 'indexing'`,
      )
      .run(updatedAt, repositoryId);
    return this.requireStatus(repositoryId);
  }

  public searchFiles(input: CodeSearchInput): CodeSearchPage<CodeFileSearchResult> {
    const query = `%${escapeLike(input.query)}%`;
    const prefix = `${escapeLike(input.query)}%`;
    const { offset, limit } = page(input);
    const total = count(
      this.database,
      "SELECT count(*) AS total FROM code_index_files WHERE repository_id = ? AND relative_path LIKE ? ESCAPE '\\'",
      input.repositoryId,
      query,
    );
    const rows = this.database
      .prepare(
        `SELECT repository_id, relative_path, language, snapshot_identity, content_hash,
                parse_mode, line_count
         FROM code_index_files
         WHERE repository_id = ? AND relative_path LIKE ? ESCAPE '\\'
         ORDER BY CASE WHEN lower(relative_path) = lower(?) THEN 0
                       WHEN relative_path LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END,
                  length(relative_path), relative_path
         LIMIT ? OFFSET ?`,
      )
      .all(input.repositoryId, query, input.query, prefix, limit, offset) as FileSearchRow[];
    return {
      results: rows.map((row) => ({
        repositoryId: row.repository_id,
        relativePath: row.relative_path,
        language: row.language,
        snapshotIdentity: row.snapshot_identity,
        currentSnapshotIdentity: null,
        stale: false,
        contentHash: row.content_hash,
        startLine: 1,
        endLine: Math.max(row.line_count, 1),
        parseMode: row.parse_mode,
        snippet: row.relative_path.slice(0, 400),
      })),
      offset,
      limit,
      total,
    };
  }

  public searchSymbols(input: CodeSearchInput): CodeSearchPage<CodeSymbolSearchResult> {
    const query = `%${escapeLike(input.query)}%`;
    const prefix = `${escapeLike(input.query)}%`;
    const { offset, limit } = page(input);
    const total = count(
      this.database,
      `SELECT count(*) AS total FROM code_index_symbols
       WHERE repository_id = ? AND (name LIKE ? ESCAPE '\\' OR qualified_name LIKE ? ESCAPE '\\')`,
      input.repositoryId,
      query,
      query,
    );
    const rows = this.database
      .prepare(
        `SELECT s.repository_id, f.relative_path, f.language, s.snapshot_identity,
                s.content_hash, s.symbol_kind, s.name, s.qualified_name,
                s.start_line, s.end_line,
                coalesce((SELECT content FROM code_index_chunks c WHERE c.symbol_id = s.id LIMIT 1), s.qualified_name) AS snippet
         FROM code_index_symbols s JOIN code_index_files f ON f.id = s.file_id
         WHERE s.repository_id = ? AND (s.name LIKE ? ESCAPE '\\' OR s.qualified_name LIKE ? ESCAPE '\\')
         ORDER BY CASE WHEN lower(s.name) = lower(?) THEN 0
                       WHEN s.name LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END,
                  length(s.qualified_name), s.qualified_name, f.relative_path
         LIMIT ? OFFSET ?`,
      )
      .all(
        input.repositoryId,
        query,
        query,
        input.query,
        prefix,
        limit,
        offset,
      ) as SymbolSearchRow[];
    return { results: rows.map(mapSymbolResult), offset, limit, total };
  }

  public searchText(input: CodeSearchInput): CodeSearchPage<CodeTextSearchResult> {
    const ftsQuery = toFtsQuery(input.query);
    const { offset, limit } = page(input);
    if (!ftsQuery) return { results: [], offset, limit, total: 0 };
    const total = count(
      this.database,
      'SELECT count(*) AS total FROM code_index_text_fts WHERE repository_id = ? AND code_index_text_fts MATCH ?',
      input.repositoryId,
      ftsQuery,
    );
    const rows = this.database
      .prepare(
        `SELECT c.repository_id, f.relative_path, f.language, c.snapshot_identity,
                c.content_hash, c.start_line, c.end_line, s.symbol_kind, s.name,
                snippet(code_index_text_fts, 0, '', '', ' ... ', 24) AS snippet,
                bm25(code_index_text_fts) AS rank
         FROM code_index_text_fts
         JOIN code_index_chunks c ON c.id = code_index_text_fts.chunk_id
         JOIN code_index_files f ON f.id = c.file_id
         LEFT JOIN code_index_symbols s ON s.id = c.symbol_id
         WHERE code_index_text_fts.repository_id = ? AND code_index_text_fts MATCH ?
         ORDER BY rank, f.relative_path, c.start_line
         LIMIT ? OFFSET ?`,
      )
      .all(input.repositoryId, ftsQuery, limit, offset) as TextSearchRow[];
    return {
      results: rows.map((row) => ({
        repositoryId: row.repository_id,
        relativePath: row.relative_path,
        language: row.language,
        snapshotIdentity: row.snapshot_identity,
        currentSnapshotIdentity: null,
        stale: false,
        contentHash: row.content_hash,
        startLine: row.start_line,
        endLine: row.end_line,
        symbolKind: row.symbol_kind,
        symbolName: row.name,
        snippet: row.snippet.slice(0, 400),
      })),
      offset,
      limit,
      total,
    };
  }

  private insertFile(
    input: CompleteCodeIndexInput,
    file: CompleteCodeIndexInput['changedFiles'][number],
  ): void {
    const fileId = randomUUID();
    this.database
      .prepare(
        `INSERT INTO code_index_files (
           id, repository_id, relative_path, language, snapshot_identity, content_hash,
           parser_version, parse_mode, byte_size, line_count, indexed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        fileId,
        input.repositoryId,
        file.relativePath,
        file.language,
        input.snapshotIdentity,
        file.contentHash,
        input.parserVersion,
        file.parseMode,
        file.byteSize,
        file.lineCount,
        input.completedAt,
      );
    const symbolIds: string[] = [];
    for (const symbol of file.symbols) {
      const symbolId = randomUUID();
      symbolIds.push(symbolId);
      this.database
        .prepare(
          `INSERT INTO code_index_symbols (
             id, repository_id, file_id, snapshot_identity, symbol_kind, name,
             qualified_name, start_line, end_line, content_hash, parser_version
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          symbolId,
          input.repositoryId,
          fileId,
          input.snapshotIdentity,
          symbol.kind,
          symbol.name,
          symbol.qualifiedName,
          symbol.startLine,
          symbol.endLine,
          symbol.contentHash,
          input.parserVersion,
        );
    }
    for (const chunk of file.chunks) {
      this.database
        .prepare(
          `INSERT INTO code_index_chunks (
             id, repository_id, file_id, symbol_id, snapshot_identity, start_line,
             end_line, content_hash, parser_version, content
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          input.repositoryId,
          fileId,
          chunk.symbolIndex === null ? null : (symbolIds[chunk.symbolIndex] ?? null),
          input.snapshotIdentity,
          chunk.startLine,
          chunk.endLine,
          chunk.contentHash,
          input.parserVersion,
          chunk.content,
        );
    }
  }

  private finishFailure(
    status: 'cancelled' | 'failed',
    input: CodeIndexFailureInput,
  ): CodeIndexStatus {
    const result = this.database
      .prepare(
        `UPDATE code_index_states
         SET status = ?, active_request_id = NULL, last_error_code = ?,
             last_error_message = ?, updated_at = ?
         WHERE repository_id = ? AND active_request_id = ?`,
      )
      .run(
        status,
        input.code,
        input.message.slice(0, 500),
        input.updatedAt,
        input.repositoryId,
        input.requestId,
      );
    if (result.changes !== 1)
      throw new LibraryError('CONFLICT', 'Code index task is no longer active.');
    return this.requireStatus(input.repositoryId);
  }

  private requireActive(repositoryId: string, requestId: string): void {
    const row = this.database
      .prepare(
        `SELECT 1 FROM code_index_states
         WHERE repository_id = ? AND status = 'indexing' AND active_request_id = ?`,
      )
      .get(repositoryId, requestId);
    if (!row) throw new LibraryError('CONFLICT', 'Code index task is no longer active.');
  }

  private requireRepository(repositoryId: string): void {
    if (
      !this.database.prepare('SELECT 1 FROM repository_references WHERE id = ?').get(repositoryId)
    ) {
      throw new LibraryError('NOT_FOUND', 'Repository reference missing.');
    }
  }

  private requireStatus(repositoryId: string): CodeIndexStatus {
    const status = this.getStatus(repositoryId);
    if (!status) throw new LibraryError('NOT_FOUND', 'Code index state missing.');
    return status;
  }
}

interface FileSearchRow {
  readonly repository_id: string;
  readonly relative_path: string;
  readonly language: CodeFileSearchResult['language'];
  readonly snapshot_identity: string;
  readonly content_hash: string;
  readonly parse_mode: CodeFileSearchResult['parseMode'];
  readonly line_count: number;
}

interface SymbolSearchRow {
  readonly repository_id: string;
  readonly relative_path: string;
  readonly language: CodeSymbolSearchResult['language'];
  readonly snapshot_identity: string;
  readonly content_hash: string;
  readonly symbol_kind: CodeSymbolSearchResult['symbolKind'];
  readonly name: string;
  readonly qualified_name: string;
  readonly start_line: number;
  readonly end_line: number;
  readonly snippet: string;
}

interface TextSearchRow {
  readonly repository_id: string;
  readonly relative_path: string;
  readonly language: CodeTextSearchResult['language'];
  readonly snapshot_identity: string;
  readonly content_hash: string;
  readonly start_line: number;
  readonly end_line: number;
  readonly symbol_kind: CodeTextSearchResult['symbolKind'];
  readonly name: string | null;
  readonly snippet: string;
}

function mapStatus(row: CodeIndexStateRow): CodeIndexStatus {
  return {
    repositoryId: row.repository_id,
    status: row.status,
    snapshotIdentity: row.snapshot_identity,
    currentSnapshotIdentity: null,
    dirty: row.dirty === 1,
    parserVersion: row.parser_version,
    fileCount: row.file_count,
    symbolCount: row.symbol_count,
    chunkCount: row.chunk_count,
    processedFiles: row.processed_files,
    totalFiles: row.total_files,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

function mapSymbolResult(row: SymbolSearchRow): CodeSymbolSearchResult {
  return {
    repositoryId: row.repository_id,
    relativePath: row.relative_path,
    language: row.language,
    snapshotIdentity: row.snapshot_identity,
    currentSnapshotIdentity: null,
    stale: false,
    contentHash: row.content_hash,
    startLine: row.start_line,
    endLine: row.end_line,
    symbolKind: row.symbol_kind,
    symbolName: row.name,
    qualifiedName: row.qualified_name,
    snippet: row.snippet.slice(0, 400),
  };
}

function page(input: CodeSearchInput): { readonly offset: number; readonly limit: number } {
  return { offset: input.offset ?? 0, limit: Math.min(input.limit ?? 20, 50) };
}

function count(
  database: Database.Database,
  sql: string,
  ...parameters: readonly unknown[]
): number {
  return (database.prepare(sql).get(...parameters) as { readonly total: number }).total;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

function toFtsQuery(value: string): string {
  return (
    value
      .normalize('NFKC')
      .match(/[\p{L}\p{N}_]{1,64}/gu)
      ?.slice(0, 10)
      .map((token) => `"${token.replaceAll('"', '""')}"`)
      .join(' AND ') ?? ''
  );
}
