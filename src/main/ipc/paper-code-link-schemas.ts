import { z } from 'zod';

import { zoteroItemDetailsSchema, zoteroItemRefSchema } from './zotero-schemas';

const id = z.uuid();
const relationType = z.enum(['implements', 'corresponds_to', 'extends', 'uses']);
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
    'Code location must stay inside its authorized repository.',
  );
const textAnchor = z
  .object({
    exact: z.string().trim().min(1).max(2_000),
    prefix: z.string().max(500),
    suffix: z.string().max(500),
  })
  .strict();
const codeLocation = {
  repositoryId: id,
  codeSnapshotIdentity: snapshot,
  language,
  relativePath,
  symbolKind: symbolKind.nullable(),
  symbolName: z.string().min(1).max(500).nullable(),
  startLine: z.number().int().positive().max(10_000_000),
  endLine: z.number().int().positive().max(10_000_000),
  contentHash: hash,
};

export const createPaperCodeLinkSchema = z
  .object({
    workspaceId: id,
    itemRef: zoteroItemRefSchema,
    pageNumber: z.number().int().positive().max(100_000).optional(),
    locationLabel: z.string().trim().max(300),
    textAnchor: textAnchor.optional(),
    ...codeLocation,
    relationType,
    label: z.string().trim().max(300),
    description: z.string().trim().max(4_000),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.pageNumber === undefined &&
      input.locationLabel.length === 0 &&
      input.textAnchor === undefined
    ) {
      context.addIssue({
        code: 'custom',
        message: 'A paper page, location label, or text anchor is required.',
      });
    }
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

export const paperCodeLinkIdentitySchema = z.object({ id, workspaceId: id }).strict();
export const deletePaperCodeLinkSchema = paperCodeLinkIdentitySchema
  .extend({ confirmation: z.literal('DELETE_LINK') })
  .strict();
export const listPaperCodeLinksSchema = id;
export const listPaperCodeLinksForPaperSchema = z
  .object({ workspaceId: id, itemRef: zoteroItemRefSchema })
  .strict();
export const listPaperCodeLinksForCodeSchema = z
  .object({ workspaceId: id, repositoryId: id, relativePath: relativePath.optional() })
  .strict();
export const updatePaperCodeLinkSchema = z
  .object({
    id,
    workspaceId: id,
    relationType,
    label: z.string().trim().max(300),
    description: z.string().trim().max(4_000),
    rowVersion: z.number().int().positive(),
  })
  .strict();

const pdfAvailability = z
  .object({
    hasPdf: z.boolean(),
    state: z.enum(['available', 'missing', 'none', 'not_local']),
    storageMode: z.enum(['linked', 'stored']).nullable(),
  })
  .strict();

export const paperCodeLinkSchema = z
  .object({
    id,
    workspaceId: id,
    itemRef: zoteroItemRefSchema,
    itemVersion: z.number().int().nonnegative(),
    paperSnapshotIdentity: snapshot,
    pageNumber: z.number().int().positive().nullable(),
    locationLabel: z.string().max(300),
    textAnchor: textAnchor.nullable(),
    repositoryId: id,
    repositoryName: z.string().max(500).nullable(),
    codeSnapshotIdentity: snapshot,
    currentCodeSnapshotIdentity: snapshot.nullable(),
    language,
    relativePath,
    symbolKind: symbolKind.nullable(),
    symbolName: z.string().min(1).max(500).nullable(),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    contentHash: hash,
    relationType,
    label: z.string().max(300),
    description: z.string().max(4_000),
    provenance: z.enum(['manual', 'ai_proposed_confirmed']),
    paperAvailability: availability,
    paperAvailabilityReason: z.string().max(500).nullable(),
    codeAvailability: availability,
    codeAvailabilityReason: z.string().max(500).nullable(),
    item: zoteroItemDetailsSchema.nullable(),
    pdf: pdfAvailability.nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    rowVersion: z.number().int().positive(),
  })
  .strict();

export const paperCodeLinkListSchema = z.array(paperCodeLinkSchema).max(500);
export const deletedPaperCodeLinkSchema = z.object({ id }).strict();
export const paperCodeLinkNavigationResultSchema = z
  .object({
    id,
    opened: z.boolean(),
    target: z.enum(['code', 'zotero_item', 'zotero_pdf']),
    reason: z.string().max(500).nullable(),
  })
  .strict();
