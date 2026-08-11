import type Database from 'better-sqlite3';

import type { KnowledgeIndexStatus, KnowledgeSourceType } from '../../shared/contracts/knowledge';
import type {
  BeginKnowledgeIndexInput,
  CompleteKnowledgeIndexInput,
  KnowledgeIndexFailureInput,
  KnowledgeKeywordSearchInput,
  KnowledgeSourceFingerprint,
  StoredKnowledgeChunk,
  UpdateKnowledgeIndexProgressInput,
} from '../knowledge/knowledge-data-gateway';

interface StatusRow {
  readonly workspace_id: string;
  readonly status: KnowledgeIndexStatus['status'];
  readonly index_version: string;
  readonly embedding_provider: string | null;
  readonly source_count: number;
  readonly chunk_count: number;
  readonly processed_sources: number;
  readonly total_sources: number;
  readonly active_request_id: string | null;
  readonly last_error_code: string | null;
  readonly last_error_message: string | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly updated_at: string | null;
}

interface ChunkRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly source_type: KnowledgeSourceType;
  readonly source_identity: string;
  readonly snapshot_identity: string;
  readonly title: string;
  readonly provenance_json: string;
  readonly citation: string;
  readonly unavailable_reason: string | null;
  readonly indexed_at: string;
  readonly content: string;
  readonly embedding_json: string | null;
  readonly rank: number | null;
}

export class KnowledgeRepository {
  public constructor(private readonly database: Database.Database) {}

  public recoverInterrupted(updatedAt: string): number {
    return this.database
      .prepare(
        `UPDATE knowledge_index_states
         SET status = 'cancelled', active_request_id = NULL,
             last_error_code = 'INTERRUPTED', last_error_message = 'Indexing was interrupted.',
             updated_at = ? WHERE status = 'indexing'`,
      )
      .run(updatedAt).changes;
  }

  public getStatus(workspaceId: string): KnowledgeIndexStatus | null {
    const row = this.database
      .prepare('SELECT * FROM knowledge_index_states WHERE workspace_id = ?')
      .get(workspaceId) as StatusRow | undefined;
    return row ? mapStatus(row) : null;
  }

  public listFingerprints(workspaceId: string): readonly KnowledgeSourceFingerprint[] {
    return this.database
      .prepare(
        `SELECT source_type AS sourceType, source_identity AS sourceIdentity, fingerprint
         FROM knowledge_sources WHERE workspace_id = ? ORDER BY source_type, source_identity`,
      )
      .all(workspaceId) as KnowledgeSourceFingerprint[];
  }

  public begin(input: BeginKnowledgeIndexInput): KnowledgeIndexStatus {
    this.database
      .prepare(
        `INSERT INTO knowledge_index_states (
           workspace_id, status, index_version, embedding_provider, processed_sources,
           total_sources, active_request_id, started_at, updated_at
         ) VALUES (?, 'indexing', ?, ?, 0, ?, ?, ?, ?)
         ON CONFLICT(workspace_id) DO UPDATE SET
           status = 'indexing', index_version = excluded.index_version,
           embedding_provider = excluded.embedding_provider, processed_sources = 0,
           total_sources = excluded.total_sources, active_request_id = excluded.active_request_id,
           last_error_code = NULL, last_error_message = NULL, started_at = excluded.started_at,
           updated_at = excluded.updated_at`,
      )
      .run(
        input.workspaceId,
        input.indexVersion,
        input.embeddingProvider,
        input.totalSources,
        input.requestId,
        input.startedAt,
        input.startedAt,
      );
    return this.requireActive(input.workspaceId, input.requestId);
  }

  public updateProgress(input: UpdateKnowledgeIndexProgressInput): KnowledgeIndexStatus {
    this.database
      .prepare(
        `UPDATE knowledge_index_states SET processed_sources = ?, total_sources = ?, updated_at = ?
         WHERE workspace_id = ? AND status = 'indexing' AND active_request_id = ?`,
      )
      .run(
        input.processedSources,
        input.totalSources,
        input.updatedAt,
        input.workspaceId,
        input.requestId,
      );
    return this.requireActive(input.workspaceId, input.requestId);
  }

  public complete(input: CompleteKnowledgeIndexInput): KnowledgeIndexStatus {
    this.database.transaction(() => {
      this.requireActive(input.workspaceId, input.requestId);
      const remove = this.database.prepare(
        'DELETE FROM knowledge_sources WHERE workspace_id = ? AND source_type = ? AND source_identity = ?',
      );
      for (const source of [...input.removed, ...input.changed]) {
        remove.run(input.workspaceId, source.sourceType, source.sourceIdentity);
      }
      const insertSource = this.database.prepare(
        `INSERT INTO knowledge_sources (
           id, workspace_id, source_type, source_identity, snapshot_identity, title,
           fingerprint, provenance_json, unavailable_reason, indexed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertChunk = this.database.prepare(
        `INSERT INTO knowledge_chunks (
           id, source_id, workspace_id, source_type, ordinal, content_hash, content,
           citation, provenance_json, embedding_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const source of input.changed) {
        insertSource.run(
          source.id,
          input.workspaceId,
          source.sourceType,
          source.sourceIdentity,
          source.snapshotIdentity,
          source.title,
          source.fingerprint,
          source.provenanceJson,
          source.unavailableReason,
          source.indexedAt,
        );
        for (const chunk of source.chunks) {
          insertChunk.run(
            chunk.id,
            source.id,
            input.workspaceId,
            source.sourceType,
            chunk.ordinal,
            chunk.contentHash,
            chunk.content,
            chunk.citation,
            chunk.provenanceJson,
            chunk.embeddingJson,
          );
        }
      }
      const counts = this.database
        .prepare(
          `SELECT
             (SELECT count(*) FROM knowledge_sources WHERE workspace_id = ?) AS sources,
             (SELECT count(*) FROM knowledge_chunks WHERE workspace_id = ?) AS chunks`,
        )
        .get(input.workspaceId, input.workspaceId) as {
        readonly sources: number;
        readonly chunks: number;
      };
      this.database
        .prepare(
          `UPDATE knowledge_index_states SET status = 'ready', index_version = ?,
             embedding_provider = ?, source_count = ?, chunk_count = ?,
             processed_sources = ?, total_sources = ?, active_request_id = NULL,
             last_error_code = NULL, last_error_message = NULL, completed_at = ?, updated_at = ?
           WHERE workspace_id = ? AND active_request_id = ?`,
        )
        .run(
          input.indexVersion,
          input.embeddingProvider,
          counts.sources,
          counts.chunks,
          counts.sources,
          counts.sources,
          input.completedAt,
          input.completedAt,
          input.workspaceId,
          input.requestId,
        );
    })();
    return this.requireStatus(input.workspaceId);
  }

  public cancel(input: KnowledgeIndexFailureInput): KnowledgeIndexStatus {
    return this.finishFailure('cancelled', input);
  }

  public fail(input: KnowledgeIndexFailureInput): KnowledgeIndexStatus {
    return this.finishFailure('failed', input);
  }

  public remove(workspaceId: string): boolean {
    return this.database.transaction(() => {
      const removed = this.database
        .prepare('DELETE FROM knowledge_index_states WHERE workspace_id = ?')
        .run(workspaceId).changes;
      this.database
        .prepare('DELETE FROM knowledge_sources WHERE workspace_id = ?')
        .run(workspaceId);
      return removed > 0;
    })();
  }

  public searchKeyword(input: KnowledgeKeywordSearchInput): readonly StoredKnowledgeChunk[] {
    const query = toFtsQuery(input.query);
    if (!query) return [];
    const { clause, values } = sourceTypeClause(input.sourceTypes, 'f.source_type');
    const rows = this.database
      .prepare(
        `SELECT c.id, c.workspace_id, s.source_type, s.source_identity, s.snapshot_identity,
                s.title, c.provenance_json, c.citation, s.unavailable_reason, s.indexed_at,
                c.content, c.embedding_json, bm25(knowledge_chunks_fts) AS rank
         FROM knowledge_chunks_fts f
         JOIN knowledge_chunks c ON c.id = f.chunk_id
         JOIN knowledge_sources s ON s.id = c.source_id
         WHERE f.workspace_id = ? AND knowledge_chunks_fts MATCH ? ${clause}
         ORDER BY rank, s.title, c.ordinal LIMIT ?`,
      )
      .all(input.workspaceId, query, ...values, input.limit) as ChunkRow[];
    return rows.map(mapChunk);
  }

  public listSemanticCandidates(
    workspaceId: string,
    sourceTypes: readonly KnowledgeSourceType[],
    limit: number,
  ): readonly StoredKnowledgeChunk[] {
    const { clause, values } = sourceTypeClause(sourceTypes, 's.source_type');
    const rows = this.database
      .prepare(
        `SELECT c.id, c.workspace_id, s.source_type, s.source_identity, s.snapshot_identity,
                s.title, c.provenance_json, c.citation, s.unavailable_reason, s.indexed_at,
                c.content, c.embedding_json, NULL AS rank
         FROM knowledge_chunks c JOIN knowledge_sources s ON s.id = c.source_id
         WHERE c.workspace_id = ? AND c.embedding_json IS NOT NULL ${clause}
         ORDER BY s.source_type, s.source_identity, c.ordinal LIMIT ?`,
      )
      .all(workspaceId, ...values, limit) as ChunkRow[];
    return rows.map(mapChunk);
  }

  public getChunk(workspaceId: string, chunkId: string): StoredKnowledgeChunk | null {
    const row = this.database
      .prepare(
        `SELECT c.id, c.workspace_id, s.source_type, s.source_identity, s.snapshot_identity,
                s.title, c.provenance_json, c.citation, s.unavailable_reason, s.indexed_at,
                c.content, c.embedding_json, NULL AS rank
         FROM knowledge_chunks c JOIN knowledge_sources s ON s.id = c.source_id
         WHERE c.workspace_id = ? AND c.id = ?`,
      )
      .get(workspaceId, chunkId) as ChunkRow | undefined;
    return row ? mapChunk(row) : null;
  }

  private finishFailure(
    status: 'cancelled' | 'failed',
    input: KnowledgeIndexFailureInput,
  ): KnowledgeIndexStatus {
    this.database
      .prepare(
        `UPDATE knowledge_index_states SET status = ?, active_request_id = NULL,
           last_error_code = ?, last_error_message = ?, updated_at = ?
         WHERE workspace_id = ? AND active_request_id = ?`,
      )
      .run(
        status,
        input.errorCode,
        input.errorMessage,
        input.updatedAt,
        input.workspaceId,
        input.requestId,
      );
    return this.requireStatus(input.workspaceId);
  }

  private requireActive(workspaceId: string, requestId: string): KnowledgeIndexStatus {
    const status = this.requireStatus(workspaceId);
    if (status.status !== 'indexing' || status.activeRequestId !== requestId) {
      throw new Error('The Knowledge index request is no longer active.');
    }
    return status;
  }

  private requireStatus(workspaceId: string): KnowledgeIndexStatus {
    const status = this.getStatus(workspaceId);
    if (!status) throw new Error('Knowledge index status was not found.');
    return status;
  }
}

function mapStatus(row: StatusRow): KnowledgeIndexStatus {
  return {
    workspaceId: row.workspace_id,
    status: row.status,
    indexVersion: row.index_version,
    embeddingProvider: row.embedding_provider,
    sourceCount: row.source_count,
    chunkCount: row.chunk_count,
    processedSources: row.processed_sources,
    totalSources: row.total_sources,
    activeRequestId: row.active_request_id,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

function mapChunk(row: ChunkRow): StoredKnowledgeChunk {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sourceType: row.source_type,
    sourceIdentity: row.source_identity,
    snapshotIdentity: row.snapshot_identity,
    title: row.title,
    provenanceJson: row.provenance_json,
    citation: row.citation,
    unavailableReason: row.unavailable_reason,
    indexedAt: row.indexed_at,
    content: row.content,
    embeddingJson: row.embedding_json,
    keywordScore: row.rank === null ? 0 : 1 / (1 + Math.abs(row.rank)),
  };
}

function sourceTypeClause(
  sourceTypes: readonly KnowledgeSourceType[],
  column: string,
): { readonly clause: string; readonly values: readonly KnowledgeSourceType[] } {
  if (sourceTypes.length === 0) return { clause: '', values: [] };
  return {
    clause: `AND ${column} IN (${sourceTypes.map(() => '?').join(', ')})`,
    values: sourceTypes,
  };
}

function toFtsQuery(value: string): string {
  return (value.match(/[\p{L}\p{N}_-]+/gu) ?? [])
    .slice(0, 16)
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(' OR ');
}
