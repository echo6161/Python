import { z } from 'zod';

const repositoryId = z.uuid();
const workspaceId = z.uuid();
const requestId = z.uuid();
const relativePath = z.string().max(4096);

export const repositoryIdSchema = repositoryId;
export const workspaceRepositoryInputSchema = z.object({ workspaceId, repositoryId }).strict();
export const deleteRepositoryRefSchema = z
  .object({ repositoryId, confirmation: z.literal('DELETE_REPOSITORY_REF') })
  .strict();
export const repositoryRequestSchema = z.object({ repositoryId, requestId }).strict();
export const repositoryTreeRequestSchema = z
  .object({
    repositoryId,
    requestId,
    relativePath,
    start: z.number().int().min(0).max(1_000_000).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();
export const repositorySourceRequestSchema = z
  .object({ repositoryId, requestId, relativePath: relativePath.min(1) })
  .strict();
export const openRepositoryInVscodeSchema = z
  .object({
    repositoryId,
    relativePath: relativePath.min(1).optional(),
    line: z.number().int().min(1).max(1_000_000).optional(),
    column: z.number().int().min(1).max(10_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.line !== undefined || value.column !== undefined) &&
      value.relativePath === undefined
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Line and column require a repository-relative file.',
      });
    }
    if (value.column !== undefined && value.line === undefined) {
      context.addIssue({ code: 'custom', message: 'Column requires a line.' });
    }
  });

const remoteSchema = z.object({ name: z.string().max(200), url: z.string().max(2048) }).strict();
export const repositorySchema = z
  .object({
    id: repositoryId,
    displayName: z.string().min(1).max(200),
    canonicalRoot: z.string().min(1).max(32767),
    kind: z.enum(['git', 'source_folder']),
    gitRoot: z.string().min(1).max(32767).nullable(),
    currentBranch: z.string().max(1024).nullable(),
    headCommit: z
      .string()
      .regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u)
      .nullable(),
    remotes: z.array(remoteSchema).max(20),
    availability: z.enum(['available', 'missing', 'permission_denied', 'unavailable']),
    lastErrorCode: z.string().max(100).nullable(),
    lastObservedAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    rowVersion: z.number().int().positive(),
  })
  .strict();
export const workspaceRepositorySchema = repositorySchema.extend({
  workspaceId,
  addedAt: z.iso.datetime(),
  sortOrder: z.number().int().nonnegative(),
});
export const workspaceRepositoryListSchema = z.array(workspaceRepositorySchema).max(100);
export const repositoryTreePageSchema = z
  .object({
    repositoryId,
    directory: relativePath,
    entries: z
      .array(
        z
          .object({
            name: z.string().min(1).max(255),
            relativePath: relativePath.min(1),
            kind: z.enum(['directory', 'file', 'symlink']),
            byteSize: z.number().int().nonnegative().nullable(),
            modifiedAt: z.iso.datetime().nullable(),
          })
          .strict(),
      )
      .max(100),
    start: z.number().int().nonnegative(),
    limit: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative().max(5000),
    hasNext: z.boolean(),
  })
  .strict();
export const repositorySourceFileSchema = z
  .object({
    repositoryId,
    relativePath: relativePath.min(1),
    language: z.string().min(1).max(50),
    encoding: z.enum(['utf-8', 'utf-16be', 'utf-16le']),
    byteSize: z
      .number()
      .int()
      .nonnegative()
      .max(1024 * 1024),
    lineCount: z.number().int().nonnegative().max(1_000_001),
    content: z.string().max(1024 * 1024),
  })
  .strict();
export const removedRepositorySchema = z.object({ removed: z.boolean() }).strict();
export const deletedRepositorySchema = z.object({ repositoryId }).strict();
export const openedRepositorySchema = z.object({ opened: z.literal(true) }).strict();
export const cancelledRepositorySchema = z.object({ requestId, cancelled: z.boolean() }).strict();
