import { z } from 'zod';

const nullableLimitedText = (maximum: number) => z.string().trim().max(maximum).nullable();
const uniqueIds = (maximum: number) =>
  z
    .array(z.uuid())
    .max(maximum)
    .refine((values) => new Set(values).size === values.length, 'IDs must be unique.');

export const paperIdSchema = z.uuid();
export const readingStatusSchema = z.enum(['unread', 'reading', 'completed', 'shelved']);
export const metadataReviewStatusSchema = z.enum(['pending', 'confirmed']);
export const metadataSourceSchema = z.enum([
  'manual',
  'pdf_metadata',
  'first_page',
  'filename',
  'legacy',
  'none',
]);
export const metadataConfidenceSchema = z.enum([
  'confirmed',
  'high',
  'medium',
  'low',
  'unconfirmed',
]);

export const paperListQuerySchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    title: z.string().trim().max(500).optional(),
    author: z.string().trim().max(300).optional(),
    year: z.number().int().min(1000).max(9999).optional(),
    tagIds: uniqueIds(50).optional(),
    collectionId: z.uuid().optional(),
    readingStatuses: z
      .array(readingStatusSchema)
      .max(4)
      .refine((values) => new Set(values).size === values.length, 'Statuses must be unique.')
      .optional(),
    favorite: z.boolean().optional(),
    fullText: z.string().trim().max(500).optional(),
    sortBy: z.enum(['updatedAt', 'importedAt', 'title', 'year', 'author']).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    limit: z.number().int().min(1).max(200).optional(),
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
    authors: z
      .array(z.string().trim().min(1).max(300))
      .max(100)
      .refine(
        (authors) =>
          new Set(authors.map((author) => author.toLocaleLowerCase())).size === authors.length,
        'Authors must be unique.',
      ),
    abstract: nullableLimitedText(100_000),
    year: z.number().int().min(1000).max(9999).nullable(),
    doi: nullableLimitedText(300),
    venue: nullableLimitedText(500),
    language: nullableLimitedText(35),
  })
  .strict();

export const paperOrganizationUpdateSchema = z
  .object({
    id: paperIdSchema,
    rowVersion: z.number().int().min(1),
    readingStatus: readingStatusSchema,
    isFavorite: z.boolean(),
    tagIds: uniqueIds(100),
    collectionIds: uniqueIds(100),
  })
  .strict();

export const paperDetailsUpdateSchema = z
  .object({
    metadata: paperMetadataUpdateSchema,
    organization: paperOrganizationUpdateSchema.omit({ id: true, rowVersion: true }),
  })
  .strict();

export const batchPaperUpdateSchema = z
  .object({
    ids: uniqueIds(200).refine((ids) => ids.length > 0, 'Select at least one paper.'),
    addTagIds: uniqueIds(100),
    readingStatus: readingStatusSchema.optional(),
  })
  .strict()
  .refine(
    ({ addTagIds, readingStatus }) => addTagIds.length > 0 || readingStatus !== undefined,
    'Choose a batch change.',
  );

export const createTagSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable(),
  })
  .strict();

export const createCollectionSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: nullableLimitedText(2_000),
  })
  .strict();

export const deleteOrganizationItemSchema = z
  .object({ id: z.uuid(), confirmation: z.literal('REMOVE_ORGANIZATION_ITEM') })
  .strict();

export const paperRemovalSchema = z
  .object({
    id: paperIdSchema,
    mode: z.enum(['record-only', 'record-and-managed-file']),
    confirmation: z.literal('REMOVE_PAPER'),
  })
  .strict();

export const tagSchema = z
  .object({ id: z.uuid(), name: z.string(), color: z.string().nullable() })
  .strict();

export const collectionSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    sortOrder: z.number().int(),
  })
  .strict();

const metadataEvidenceSchema = z
  .object({
    field: z.enum(['title', 'authors', 'abstract', 'year', 'doi']),
    source: metadataSourceSchema,
    confidence: metadataConfidenceSchema,
    userEdited: z.boolean(),
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
    pageCount: z.number().int().positive().nullable(),
    textExtractionStatus: z.enum(['pending', 'succeeded', 'partial', 'failed']),
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
    readingStatus: readingStatusSchema,
    isFavorite: z.boolean(),
    metadataReviewStatus: metadataReviewStatusSchema,
    tags: z.array(tagSchema),
    collections: z.array(collectionSchema),
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
    metadataEvidence: z.array(metadataEvidenceSchema),
  })
  .strict();

export const paperListResultSchema = z
  .object({ items: z.array(paperSummarySchema), total: z.number().int().min(0) })
  .strict();

export const libraryOrganizationSchema = z
  .object({ tags: z.array(tagSchema), collections: z.array(collectionSchema) })
  .strict();

export const batchPaperUpdateResultSchema = z.object({ updatedIds: z.array(z.uuid()) }).strict();

export const deletedOrganizationItemSchema = z.object({ id: z.uuid() }).strict();

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
          warning: z.string().nullable(),
          error: apiErrorSchema.nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export const paperRemovalResultSchema = z
  .object({ id: paperIdSchema, managedFileDeleted: z.boolean() })
  .strict();
