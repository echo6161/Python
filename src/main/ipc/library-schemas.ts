import { z } from 'zod';

const nullableLimitedText = (maximum: number) => z.string().trim().max(maximum).nullable();

export const paperIdSchema = z.uuid();

export const paperListQuerySchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).max(1_000_000).optional(),
  })
  .strict()
  .default({});

export const droppedPdfPathsSchema = z
  .object({
    filePaths: z.array(z.string().min(1).max(32_767)).min(1).max(20),
  })
  .strict();

export const paperMetadataUpdateSchema = z
  .object({
    id: paperIdSchema,
    rowVersion: z.number().int().min(1),
    title: z.string().trim().min(1).max(500),
    abstract: nullableLimitedText(100_000),
    year: z.number().int().min(1000).max(9999).nullable(),
    doi: nullableLimitedText(300),
    venue: nullableLimitedText(500),
    language: nullableLimitedText(35),
  })
  .strict();

export const paperRemovalSchema = z
  .object({
    id: paperIdSchema,
    mode: z.enum(['record-only', 'record-and-managed-file']),
    confirmation: z.literal('REMOVE_PAPER'),
  })
  .strict();

const paperFileSchema = z
  .object({
    id: paperIdSchema,
    originalFilename: z.string(),
    internalFilename: z.string(),
    byteSize: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    mimeType: z.literal('application/pdf'),
    importedAt: z.string(),
  })
  .strict();

const paperSummarySchema = z
  .object({
    id: paperIdSchema,
    title: z.string(),
    year: z.number().int().nullable(),
    authors: z.array(z.string()),
    status: z.enum(['importing', 'ready', 'failed', 'trashed']),
    createdAt: z.string(),
    updatedAt: z.string(),
    rowVersion: z.number().int().positive(),
    file: paperFileSchema,
  })
  .strict();

export const paperDetailsSchema = paperSummarySchema
  .extend({
    abstract: z.string().nullable(),
    doi: z.string().nullable(),
    venue: z.string().nullable(),
    language: z.string().nullable(),
    tags: z.array(z.string()),
    collections: z.array(z.string()),
  })
  .strict();

export const paperListResultSchema = z
  .object({ items: z.array(paperSummarySchema), total: z.number().int().min(0) })
  .strict();

const apiErrorSchema = z
  .object({
    code: z.enum([
      'CONFLICT',
      'DATABASE_ERROR',
      'DUPLICATE_PAPER',
      'FILE_NOT_FOUND',
      'IMPORT_FAILED',
      'INVALID_INPUT',
      'INVALID_PDF',
      'NOT_FOUND',
      'PERMISSION_DENIED',
      'STORAGE_ERROR',
    ]),
    message: z.string(),
  })
  .strict();

export const paperImportBatchSchema = z
  .object({
    cancelled: z.boolean(),
    items: z.array(
      z
        .object({
          originalFilename: z.string(),
          status: z.enum(['imported', 'duplicate', 'failed']),
          paper: paperDetailsSchema.nullable(),
          error: apiErrorSchema.nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export const paperRemovalResultSchema = z
  .object({ id: paperIdSchema, managedFileDeleted: z.boolean() })
  .strict();
