import { z } from 'zod';

const objectKeySchema = z.string().regex(/^[23456789ABCDEFGHIJKLMNPQRSTUVWXYZ]{8}$/u);
const serverIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u);
const requestIdSchema = z.uuid();

export const zoteroLibraryRefSchema = z
  .object({
    type: z.enum(['user', 'group']),
    id: z.string().regex(/^\d+$/u),
  })
  .strict();

export const zoteroItemRefSchema = z
  .object({
    serverId: serverIdSchema,
    library: zoteroLibraryRefSchema,
    itemKey: objectKeySchema,
  })
  .strict();

export const zoteroCollectionRefSchema = z
  .object({
    serverId: serverIdSchema,
    library: zoteroLibraryRefSchema,
    collectionKey: objectKeySchema,
  })
  .strict();

export const zoteroConnectionStatusSchema = z
  .object({
    available: z.boolean(),
    apiVersion: z.number().int().positive().nullable(),
    serverIdentity: z
      .object({
        serverId: serverIdSchema,
        schemaVersion: z.number().int().nonnegative().nullable(),
        kind: z.enum(['library_fallback', 'server']),
      })
      .strict()
      .nullable(),
    error: z
      .object({
        code: z.enum([
          'api_disabled',
          'invalid_response',
          'not_running',
          'server_error',
          'timeout',
          'unsupported_version',
        ]),
        message: z.string().min(1).max(500),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((status, context) => {
    if (status.available && (!status.apiVersion || !status.serverIdentity || status.error)) {
      context.addIssue({ code: 'custom', message: 'Connected Zotero status is incomplete.' });
    }
    if (!status.available && !status.error) {
      context.addIssue({ code: 'custom', message: 'Unavailable Zotero status needs an error.' });
    }
  });

const zoteroPdfAvailabilitySchema = z
  .object({
    hasPdf: z.boolean(),
    state: z.enum(['available', 'missing', 'none', 'not_local']),
    storageMode: z.enum(['linked', 'stored']).nullable(),
  })
  .strict();

const zoteroCreatorSchema = z
  .object({ creatorType: z.string().max(80), name: z.string().max(500) })
  .strict();

export const zoteroItemSummarySchema = z
  .object({
    ref: zoteroItemRefSchema,
    itemType: z.string().min(1).max(80),
    title: z.string().max(2_000),
    creators: z.array(zoteroCreatorSchema).max(200),
    date: z.string().max(500).nullable(),
    year: z.number().int().min(1000).max(2999).nullable(),
    publication: z.string().max(2_000).nullable(),
    pdf: zoteroPdfAvailabilitySchema,
    version: z.number().int().nonnegative(),
  })
  .strict();

export const zoteroItemDetailsSchema = zoteroItemSummarySchema
  .extend({
    doi: z.string().max(500).nullable(),
    abstract: z.string().max(500_000).nullable(),
    url: z.string().max(10_000).nullable(),
    tags: z.array(z.string().max(500)).max(1_000),
    collections: z.array(zoteroCollectionRefSchema).max(1_000),
  })
  .strict();

export const zoteroCollectionSchema = z
  .object({
    ref: zoteroCollectionRefSchema,
    name: z.string().max(2_000),
    parent: zoteroCollectionRefSchema.nullable(),
    version: z.number().int().nonnegative(),
  })
  .strict();

export const zoteroAttachmentSchema = z
  .object({
    ref: zoteroItemRefSchema,
    parentItemRef: zoteroItemRefSchema,
    title: z.string().max(2_000),
    filename: z.string().max(2_000).nullable(),
    contentType: z.string().max(500).nullable(),
    linkMode: z.enum(['imported_file', 'imported_url', 'linked_file', 'linked_url', 'unknown']),
    isPdf: z.boolean(),
    pdf: zoteroPdfAvailabilitySchema,
    version: z.number().int().nonnegative(),
  })
  .strict();

export const zoteroItemListSchema = z.array(zoteroItemSummarySchema).max(100);
export const zoteroPageRequestSchema = z
  .object({
    requestId: requestIdSchema,
    start: z.number().int().min(0).max(1_000_000),
    limit: z.number().int().min(1).max(25),
  })
  .strict();
export const zoteroSearchRequestSchema = zoteroPageRequestSchema
  .extend({ query: z.string().trim().min(1).max(500) })
  .strict();
export const zoteroItemPageSchema = z
  .object({
    items: zoteroItemListSchema,
    start: z.number().int().min(0).max(1_000_000),
    limit: z.number().int().min(1).max(25),
    total: z.number().int().nonnegative().nullable(),
    hasNext: z.boolean(),
  })
  .strict();
export const zoteroRequestIdSchema = requestIdSchema;
export const zoteroCancelResultSchema = z.object({ cancelled: z.boolean() }).strict();
export const zoteroCollectionListSchema = z.array(zoteroCollectionSchema).max(100);
export const zoteroAttachmentListSchema = z.array(zoteroAttachmentSchema).max(100);
export { zoteroPdfAvailabilitySchema };
