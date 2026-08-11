import { z } from 'zod';

import { zoteroItemDetailsSchema, zoteroItemRefSchema } from './zotero-schemas';

const id = z.uuid();
const status = z.enum(['unresolved', 'investigating', 'blocked', 'understood', 'closed']);
const priority = z.enum(['low', 'normal', 'high', 'critical']);
const availability = z.enum(['available', 'stale', 'unavailable']);
const language = z.enum(['python', 'javascript', 'typescript', 'unsupported']);
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
const hash = z.string().regex(/^[0-9a-f]{64}$/u);
const snapshot = z.string().min(1).max(300);
const relativePath = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !value.startsWith('\\') &&
      !/^[A-Za-z]:/u.test(value) &&
      !value.split(/[\\/]/u).some((segment) => segment === '..'),
    'Code Evidence must use a path inside its authorized repository.',
  );

const questionFields = {
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(10_000),
  priority,
};

export const createQuestionSchema = z.object({ workspaceId: id, ...questionFields }).strict();
export const getQuestionSchema = z.object({ workspaceId: id, questionId: id }).strict();
export const listQuestionsSchema = id;
export const updateQuestionSchema = z
  .object({ id, workspaceId: id, rowVersion: z.number().int().positive(), ...questionFields })
  .strict();
export const setQuestionStatusSchema = z
  .object({ id, workspaceId: id, status, rowVersion: z.number().int().positive() })
  .strict();
export const archiveQuestionSchema = z
  .object({ id, workspaceId: id, archived: z.boolean(), rowVersion: z.number().int().positive() })
  .strict();
export const deleteQuestionSchema = z
  .object({ workspaceId: id, questionId: id, confirmation: z.literal('DELETE_QUESTION') })
  .strict();

const textAnchorSchema = z
  .object({
    exact: z.string().trim().min(1).max(2_000),
    prefix: z.string().max(500),
    suffix: z.string().max(500),
  })
  .strict();

export const addZoteroEvidenceSchema = z
  .object({
    workspaceId: id,
    questionId: id,
    itemRef: zoteroItemRefSchema,
    pageNumber: z.number().int().min(1).max(100_000).optional(),
    textAnchor: textAnchorSchema.optional(),
    note: z.string().trim().max(4_000),
  })
  .strict();

export const addCodeEvidenceSchema = z
  .object({
    workspaceId: id,
    questionId: id,
    repositoryId: id,
    sourceSnapshotIdentity: snapshot,
    language,
    relativePath,
    symbolKind: symbolKind.nullable(),
    symbolName: z.string().min(1).max(500).nullable(),
    startLine: z.number().int().positive().max(10_000_000),
    endLine: z.number().int().positive().max(10_000_000),
    contentHash: hash,
    note: z.string().trim().max(4_000),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.endLine < input.startLine) {
      context.addIssue({ code: 'custom', message: 'End line must not precede start line.' });
    }
    if ((input.symbolKind === null) !== (input.symbolName === null)) {
      context.addIssue({
        code: 'custom',
        message: 'Symbol kind and name must be supplied together.',
      });
    }
  });

export const evidenceIdentitySchema = z
  .object({ workspaceId: id, questionId: id, evidenceId: id })
  .strict();
export const reorderEvidenceSchema = z
  .object({ workspaceId: id, questionId: id, evidenceIds: z.array(id).max(500) })
  .strict()
  .refine((input) => new Set(input.evidenceIds).size === input.evidenceIds.length, {
    message: 'Evidence IDs must be unique.',
  });

export const researchQuestionSchema = z
  .object({
    id,
    workspaceId: id,
    title: z.string().min(1).max(300),
    description: z.string().max(10_000),
    status,
    priority,
    archivedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    rowVersion: z.number().int().positive(),
  })
  .strict();

const evidenceBase = {
  id,
  questionId: id,
  workspaceId: id,
  note: z.string().max(4_000),
  sourceSnapshotIdentity: snapshot,
  sortOrder: z.number().int().nonnegative().max(500),
  availability,
  availabilityReason: z.string().max(500).nullable(),
  createdAt: z.iso.datetime(),
};
const pdfAvailabilitySchema = z
  .object({
    hasPdf: z.boolean(),
    state: z.enum(['available', 'missing', 'none', 'not_local']),
    storageMode: z.enum(['linked', 'stored']).nullable(),
  })
  .strict();
const zoteroEvidenceSchema = z
  .object({
    ...evidenceBase,
    kind: z.literal('zotero_paper'),
    itemRef: zoteroItemRefSchema,
    itemVersion: z.number().int().nonnegative(),
    pageNumber: z.number().int().positive().nullable(),
    textAnchor: textAnchorSchema.nullable(),
    item: zoteroItemDetailsSchema.nullable(),
    pdf: pdfAvailabilitySchema.nullable(),
  })
  .strict();
const codeEvidenceSchema = z
  .object({
    ...evidenceBase,
    kind: z.literal('code'),
    repositoryId: id,
    repositoryName: z.string().max(500).nullable(),
    language,
    relativePath,
    symbolKind: symbolKind.nullable(),
    symbolName: z.string().min(1).max(500).nullable(),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    contentHash: hash,
    currentSnapshotIdentity: snapshot.nullable(),
  })
  .strict();

export const questionDetailsSchema = z
  .object({
    question: researchQuestionSchema,
    evidence: z
      .array(z.discriminatedUnion('kind', [zoteroEvidenceSchema, codeEvidenceSchema]))
      .max(500),
  })
  .strict();
export const questionListSchema = z.array(researchQuestionSchema).max(500);
export const deletedQuestionSchema = z.object({ id }).strict();
export const openEvidenceResultSchema = z
  .object({
    evidenceId: id,
    opened: z.boolean(),
    target: z.enum(['code', 'zotero_item', 'zotero_pdf']),
    reason: z.string().max(500).nullable(),
  })
  .strict();
