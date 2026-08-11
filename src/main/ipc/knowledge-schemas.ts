import { z } from 'zod';

const id = z.uuid();
const sourceType = z.enum(['paper', 'code', 'question', 'link']);
const itemRef = z
  .object({
    serverId: z.string().min(8).max(128),
    library: z.object({ type: z.enum(['user', 'group']), id: z.string().min(1).max(32) }).strict(),
    itemKey: z.string().regex(/^[23456789ABCDEFGHIJKLMNPQRSTUVWXYZ]{8}$/u),
  })
  .strict();

export const knowledgeWorkspaceIdSchema = id;
export const runKnowledgeIndexSchema = z
  .object({ workspaceId: id, requestId: id, mode: z.enum(['incremental', 'rebuild']) })
  .strict();
export const removeKnowledgeIndexSchema = z
  .object({ workspaceId: id, confirmation: z.literal('REMOVE_KNOWLEDGE_INDEX') })
  .strict();
export const knowledgeSearchInputSchema = z
  .object({
    workspaceId: id,
    query: z.string().trim().min(1).max(300),
    sourceTypes: z.array(sourceType).max(4).optional(),
    offset: z.number().int().min(0).max(10_000).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();
export const openKnowledgeResultSchema = z.object({ workspaceId: id, chunkId: id }).strict();
export const knowledgeIndexStatusSchema = z
  .object({
    workspaceId: id,
    status: z.enum(['unindexed', 'indexing', 'ready', 'cancelled', 'failed', 'stale']),
    indexVersion: z.string().min(1).max(100),
    embeddingProvider: z.string().min(1).max(100).nullable(),
    sourceCount: z.number().int().nonnegative().max(20_000),
    chunkCount: z.number().int().nonnegative().max(1_000_000),
    processedSources: z.number().int().nonnegative().max(20_000),
    totalSources: z.number().int().nonnegative().max(20_000),
    activeRequestId: id.nullable(),
    lastErrorCode: z.string().max(100).nullable(),
    lastErrorMessage: z.string().max(500).nullable(),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime().nullable(),
  })
  .strict();
export const knowledgeProgressSchema = z
  .object({
    workspaceId: id,
    requestId: id,
    phase: z.enum(['discovering', 'extracting', 'embedding', 'saving']),
    processedSources: z.number().int().nonnegative().max(20_000),
    totalSources: z.number().int().nonnegative().max(20_000),
    currentSource: z.string().max(1_000).nullable(),
  })
  .strict();

const provenanceBase = {
  sourceIdentity: z.string().min(1).max(5_000),
  snapshotIdentity: z.string().min(1).max(1_000),
  indexedAt: z.iso.datetime(),
};
const provenance = z.discriminatedUnion('sourceType', [
  z
    .object({
      ...provenanceBase,
      sourceType: z.literal('paper'),
      itemRef,
      attachmentKey: itemRef.shape.itemKey,
      pageNumber: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      ...provenanceBase,
      sourceType: z.literal('code'),
      repositoryId: id,
      repositoryName: z.string().min(1).max(500),
      language: z.enum(['python', 'javascript', 'typescript', 'unsupported']),
      relativePath: z.string().min(1).max(4_096),
      startLine: z.number().int().positive(),
      endLine: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      ...provenanceBase,
      sourceType: z.literal('question'),
      questionId: id,
      status: z.string().min(1).max(50),
    })
    .strict(),
  z
    .object({
      ...provenanceBase,
      sourceType: z.literal('link'),
      linkId: id,
      itemRef,
      repositoryId: id,
      relativePath: z.string().min(1).max(4_096),
      startLine: z.number().int().positive(),
      endLine: z.number().int().positive(),
      pageNumber: z.number().int().positive().nullable(),
    })
    .strict(),
]);
const searchResult = z
  .object({
    chunkId: id,
    sourceType,
    title: z.string().max(1_000),
    snippet: z.string().max(520),
    citation: z.string().min(1).max(500),
    score: z.number().min(0).max(1),
    keywordScore: z.number().min(0).max(1),
    semanticScore: z.number().min(0).max(1).nullable(),
    stale: z.boolean(),
    unavailableReason: z.string().max(500).nullable(),
    provenance,
  })
  .strict();
export const knowledgeSearchPageSchema = z
  .object({
    results: z.array(searchResult).max(50),
    mode: z.enum(['keyword', 'hybrid']),
    offset: z.number().int().nonnegative(),
    limit: z.number().int().min(1).max(50),
    total: z.number().int().nonnegative(),
  })
  .strict();
export const knowledgeCancelSchema = z.object({ requestId: id, cancelled: z.boolean() }).strict();
export const openKnowledgeResultOutputSchema = z
  .object({
    opened: z.boolean(),
    target: sourceType,
    relatedId: z.string().max(128).nullable(),
    reason: z.string().max(500).nullable(),
  })
  .strict();
