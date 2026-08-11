import { z } from 'zod';

const repositoryId = z.uuid();
const requestId = z.uuid();
const language = z.enum(['python', 'javascript', 'typescript', 'unsupported']);
const snapshot = z.string().min(1).max(200);
const hash = z.string().regex(/^[0-9a-f]{64}$/u);

export const codeRepositoryIdSchema = repositoryId;
export const runCodeIndexSchema = z
  .object({ repositoryId, requestId, mode: z.enum(['incremental', 'rebuild']) })
  .strict();
export const codeSearchInputSchema = z
  .object({
    repositoryId,
    query: z.string().trim().min(1).max(200),
    offset: z.number().int().min(0).max(1_000_000).default(0),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();
export const codeIndexStatusSchema = z
  .object({
    repositoryId,
    status: z.enum(['unindexed', 'indexing', 'ready', 'cancelled', 'failed', 'stale']),
    snapshotIdentity: snapshot.nullable(),
    currentSnapshotIdentity: snapshot.nullable(),
    dirty: z.boolean(),
    parserVersion: z.string().min(1).max(100),
    fileCount: z.number().int().nonnegative().max(2_000),
    symbolCount: z.number().int().nonnegative().max(500_000),
    chunkCount: z.number().int().nonnegative().max(500_000),
    processedFiles: z.number().int().nonnegative().max(2_000),
    totalFiles: z.number().int().nonnegative().max(2_000),
    lastErrorCode: z.string().max(100).nullable(),
    lastErrorMessage: z.string().max(500).nullable(),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime().nullable(),
  })
  .strict();
export const codeIndexProgressSchema = z
  .object({
    requestId,
    repositoryId,
    phase: z.enum(['discovering', 'parsing', 'saving']),
    processedFiles: z.number().int().nonnegative().max(2_000),
    totalFiles: z.number().int().nonnegative().max(2_000),
    currentFile: z.string().max(4096).nullable(),
  })
  .strict();
export const codeIndexCancelSchema = z.object({ requestId, cancelled: z.boolean() }).strict();

const resultBase = {
  repositoryId,
  relativePath: z.string().min(1).max(4096),
  language,
  snapshotIdentity: snapshot,
  currentSnapshotIdentity: snapshot.nullable(),
  stale: z.boolean(),
  contentHash: hash,
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  snippet: z.string().max(400),
};
const fileResult = z
  .object({ ...resultBase, parseMode: z.enum(['structured', 'fallback']) })
  .strict();
const symbolKind = z.enum([
  'module',
  'class',
  'function',
  'method',
  'interface',
  'type',
  'import',
  'export',
]);
const symbolResult = z
  .object({
    ...resultBase,
    symbolKind,
    symbolName: z.string().min(1).max(500),
    qualifiedName: z.string().min(1).max(1000),
  })
  .strict();
const textResult = z
  .object({
    ...resultBase,
    symbolKind: symbolKind.nullable(),
    symbolName: z.string().min(1).max(500).nullable(),
  })
  .strict();

function page<T extends z.ZodType>(result: T) {
  return z
    .object({
      results: z.array(result).max(50),
      offset: z.number().int().nonnegative(),
      limit: z.number().int().min(1).max(50),
      total: z.number().int().nonnegative(),
    })
    .strict();
}

export const codeFileSearchPageSchema = page(fileResult);
export const codeSymbolSearchPageSchema = page(symbolResult);
export const codeTextSearchPageSchema = page(textResult);
