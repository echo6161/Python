import { z } from 'zod';

import { knowledgeProvenanceSchema, openKnowledgeResultOutputSchema } from './knowledge-schemas';

const id = z.uuid();
const contentType = z.enum(['note', 'memory']);
const noteStatus = z.enum(['draft', 'active', 'archived']);
const memoryStatus = z.enum(['draft', 'confirmed', 'retired']);
const title = z.string().trim().min(1).max(300);
const body = z.string().max(1_000_000);
const date = z.iso.datetime();

export const listResearchContentInputSchema = z
  .object({
    workspaceId: id,
    query: z.string().trim().max(500).optional(),
    types: z
      .array(contentType)
      .max(2)
      .refine((values) => new Set(values).size === values.length)
      .optional(),
    statuses: z
      .array(z.enum(['draft', 'active', 'archived', 'confirmed', 'retired']))
      .max(5)
      .refine((values) => new Set(values).size === values.length)
      .optional(),
  })
  .strict();

export const researchContentIdentitySchema = z
  .object({ workspaceId: id, type: contentType, id })
  .strict();
export const createResearchContentSchema = z
  .object({ workspaceId: id, type: contentType, title, bodyMarkdown: body })
  .strict();
export const updateResearchContentSchema = z
  .object({
    workspaceId: id,
    type: contentType,
    id,
    title,
    bodyMarkdown: body,
    status: z.union([noteStatus, memoryStatus]),
    rowVersion: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.type === 'note' && !noteStatus.safeParse(value.status).success)
      context.addIssue({ code: 'custom', path: ['status'], message: 'Invalid Note status.' });
    if (value.type === 'memory' && !memoryStatus.safeParse(value.status).success)
      context.addIssue({ code: 'custom', path: ['status'], message: 'Invalid Memory status.' });
  });
export const deleteResearchContentSchema = researchContentIdentitySchema
  .extend({ confirmation: z.literal('DELETE_RESEARCH_CONTENT') })
  .strict();
export const addResearchReferenceSchema = researchContentIdentitySchema
  .extend({ chunkId: id })
  .strict();
export const researchReferenceIdentitySchema = researchContentIdentitySchema
  .extend({ referenceId: id })
  .strict();

const referenceSchema = z
  .object({
    id,
    workspaceId: id,
    ownerType: z.enum(['note', 'memory', 'proposal']),
    ownerId: id,
    chunkId: id.nullable(),
    sourceType: z.enum(['paper', 'code', 'question', 'link']),
    title: z.string().min(1).max(1_000),
    citation: z.string().min(1).max(500),
    snippet: z.string().min(1).max(1_200),
    provenance: knowledgeProvenanceSchema,
    createdAt: date,
    displayOrder: z.number().int().nonnegative(),
  })
  .strict();

const contentBase = {
  id,
  workspaceId: id,
  title,
  bodyMarkdown: body,
  createdAt: date,
  updatedAt: date,
  rowVersion: z.number().int().positive(),
  references: z.array(referenceSchema).max(200),
};
export const workspaceNoteSchema = z
  .object({ ...contentBase, type: z.literal('note'), status: noteStatus })
  .strict();
export const researchMemoryEntrySchema = z
  .object({
    ...contentBase,
    type: z.literal('memory'),
    status: memoryStatus,
    provenance: z.enum(['manual', 'ai-proposed-confirmed']),
    confirmedAt: date.nullable(),
  })
  .strict();
export const researchContentItemSchema = z.discriminatedUnion('type', [
  workspaceNoteSchema,
  researchMemoryEntrySchema,
]);
export const researchContentSummarySchema = z
  .object({
    id,
    type: contentType,
    title,
    status: z.union([noteStatus, memoryStatus]),
    referenceCount: z.number().int().nonnegative(),
    updatedAt: date,
  })
  .strict();

export const searchResearchSourcesSchema = z
  .object({ workspaceId: id, query: z.string().trim().min(1).max(500) })
  .strict();
export const researchSourceSearchResultSchema = z
  .object({
    chunkId: id,
    sourceType: z.enum(['paper', 'code', 'question', 'link']),
    title: z.string().min(1).max(1_000),
    citation: z.string().min(1).max(500),
    snippet: z.string().min(1).max(1_200),
  })
  .strict();

export const createResearchMemoryProposalSchema = z
  .object({ workspaceId: id, sourceNoteId: id, reason: z.string().trim().min(1).max(1_000) })
  .strict();
export const reviewResearchMemoryProposalSchema = z
  .object({
    workspaceId: id,
    proposalId: id,
    title,
    bodyMarkdown: z.string().min(1).max(1_000_000),
    rowVersion: z.number().int().positive(),
  })
  .strict();
export const rejectResearchMemoryProposalSchema = z
  .object({ workspaceId: id, proposalId: id, rowVersion: z.number().int().positive() })
  .strict();
export const researchMemoryProposalSchema = z
  .object({
    id,
    workspaceId: id,
    sourceNoteId: id.nullable(),
    title,
    bodyMarkdown: z.string().min(1).max(1_000_000),
    reason: z.string().min(1).max(1_000),
    providerId: z.enum(['openai', 'codex']),
    model: z.string().min(1).max(120),
    status: z.enum(['pending', 'confirmed', 'rejected']),
    confirmedMemoryId: id.nullable(),
    createdAt: date,
    reviewedAt: date.nullable(),
    rowVersion: z.number().int().positive(),
    references: z.array(referenceSchema).max(200),
  })
  .strict();

export const researchMemoryExportPreviewSchema = z
  .object({
    id,
    item: researchContentSummarySchema,
    vaultName: z.string().min(1).max(300),
    relativePath: z.string().min(1).max(1_000),
    markdown: z.string().max(1_100_000),
    conflict: z.boolean(),
    existingPreview: z.string().max(4_000).nullable(),
    expiresAt: date,
  })
  .strict();
export const confirmResearchMemoryExportSchema = z
  .object({ previewId: id, confirmation: z.literal('EXPORT_NEW_FILE') })
  .strict();
export const researchMemoryExportResultSchema = z
  .object({ filename: z.string().min(1).max(300), relativePath: z.string().min(1).max(1_000) })
  .strict();
export { openKnowledgeResultOutputSchema };
