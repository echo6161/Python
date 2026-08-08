import { z } from 'zod';

import { paperIdSchema } from './library-schemas';

export const annotationColorSchema = z.enum(['yellow', 'green', 'blue', 'pink']);
export const annotationTypeSchema = z.enum(['highlight', 'underline']);

const boundingRectSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .strict()
  .refine(({ x, width }) => x + width <= 1.001, 'Rectangle exceeds page width.')
  .refine(({ y, height }) => y + height <= 1.001, 'Rectangle exceeds page height.');

export const createAnnotationSchema = z
  .object({
    paperId: paperIdSchema,
    pageNumber: z.number().int().min(1).max(100_000),
    selectedText: z.string().trim().min(1).max(20_000),
    textQuotePrefix: z.string().max(250),
    textQuoteSuffix: z.string().max(250),
    textStart: z.number().int().min(0).max(100_000_000),
    textEnd: z.number().int().min(1).max(100_000_000),
    boundingRects: z.array(boundingRectSchema).min(1).max(100),
    annotationType: annotationTypeSchema,
    color: annotationColorSchema,
    comment: z.string().trim().max(20_000).nullable(),
  })
  .strict()
  .refine(({ textStart, textEnd }) => textEnd > textStart, 'Text range must not be empty.');

export const updateAnnotationSchema = z
  .object({
    id: paperIdSchema,
    rowVersion: z.number().int().min(1),
    annotationType: annotationTypeSchema,
    color: annotationColorSchema,
    comment: z.string().trim().max(20_000).nullable(),
  })
  .strict();

export const deleteAnnotationSchema = z
  .object({ id: paperIdSchema, rowVersion: z.number().int().min(1) })
  .strict();

export const saveReadingStateSchema = z
  .object({
    paperId: paperIdSchema,
    pageNumber: z.number().int().min(1).max(100_000),
    scale: z.number().min(0.25).max(5),
  })
  .strict();

export const readingStateSchema = saveReadingStateSchema
  .extend({ updatedAt: z.iso.datetime() })
  .strict();

export const annotationSchema = z
  .object({
    id: paperIdSchema,
    paperId: paperIdSchema,
    paperFileId: paperIdSchema,
    pageNumber: z.number().int().min(1),
    selectedText: z.string(),
    textQuotePrefix: z.string(),
    textQuoteSuffix: z.string(),
    textStart: z.number().int().min(0),
    textEnd: z.number().int().min(1),
    boundingRects: z.array(boundingRectSchema),
    annotationType: annotationTypeSchema,
    color: annotationColorSchema,
    comment: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    rowVersion: z.number().int().min(1),
  })
  .strict();

export const annotationListSchema = z.array(annotationSchema);
export const pdfAccessSchema = z
  .object({ url: z.string().startsWith('papermind-pdf://') })
  .strict();
export const annotationExportRequestSchema = z
  .object({ paperId: paperIdSchema, format: z.enum(['markdown', 'json']) })
  .strict();
export const annotationExportResultSchema = z
  .object({
    cancelled: z.boolean(),
    filename: z.string().nullable(),
    annotationCount: z.number().int().min(0),
  })
  .strict();
export const deletedAnnotationSchema = z.object({ id: paperIdSchema }).strict();
