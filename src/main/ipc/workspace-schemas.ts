import { z } from 'zod';

import { zoteroItemDetailsSchema, zoteroItemRefSchema } from './zotero-schemas';

export const workspaceIdSchema = z.uuid();
export const workspaceStatusSchema = z.enum(['active', 'paused', 'archived']);

const workspaceFieldsSchema = {
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4_000),
  researchGoal: z.string().trim().max(10_000),
};

export const createWorkspaceSchema = z.object(workspaceFieldsSchema).strict();

export const updateWorkspaceSchema = z
  .object({
    id: workspaceIdSchema,
    rowVersion: z.number().int().positive(),
    ...workspaceFieldsSchema,
  })
  .strict();

export const setWorkspaceStatusSchema = z
  .object({
    id: workspaceIdSchema,
    rowVersion: z.number().int().positive(),
    status: workspaceStatusSchema,
  })
  .strict();

export const deleteWorkspaceSchema = z
  .object({ id: workspaceIdSchema, confirmation: z.literal('DELETE_WORKSPACE') })
  .strict();

export const setLastActiveWorkspaceSchema = z
  .object({ workspaceId: workspaceIdSchema.nullable() })
  .strict();

export const workspaceZoteroPaperInputSchema = z
  .object({ workspaceId: workspaceIdSchema, itemRef: zoteroItemRefSchema })
  .strict();

export const workspaceSchema = z
  .object({
    id: workspaceIdSchema,
    name: z.string().min(1).max(200),
    description: z.string().max(4_000),
    researchGoal: z.string().max(10_000),
    status: workspaceStatusSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    rowVersion: z.number().int().positive(),
  })
  .strict();

export const workspaceListSchema = z.array(workspaceSchema).max(1_000);

export const workspaceZoteroPaperSchema = z
  .object({
    workspaceId: workspaceIdSchema,
    itemRef: zoteroItemRefSchema,
    addedAt: z.iso.datetime(),
    sortOrder: z.number().int().nonnegative(),
    availability: z.enum(['available', 'missing', 'stale_identity', 'unavailable']),
    item: zoteroItemDetailsSchema.nullable(),
  })
  .strict();

export const workspaceZoteroPaperListSchema = z.array(workspaceZoteroPaperSchema).max(500);
export const deletedWorkspaceSchema = z.object({ id: workspaceIdSchema }).strict();
export const removedWorkspacePaperSchema = z.object({ removed: z.boolean() }).strict();
