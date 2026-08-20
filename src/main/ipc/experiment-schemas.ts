import { z } from 'zod';
const id = z.uuid(),
  text = (max: number) => z.string().trim().min(1).max(max),
  nullableId = id.nullable();
export const experimentIdentitySchema = z.object({ workspaceId: id, experimentId: id }).strict();
const status = z.enum(['planned', 'in_progress', 'paused', 'completed', 'archived']),
  runStatus = z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']),
  outcome = z.enum(['supports', 'refutes', 'inconclusive']),
  conclusionStatus = z.enum(['draft', 'confirmed', 'retired']);
const metric = z
  .object({
    name: text(120),
    value: z.number(),
    unit: z.string().trim().max(40).nullable(),
  })
  .strict();
const result = z
  .object({
    id,
    runId: id,
    summary: text(20000),
    outcome,
    metrics: z.array(metric).max(50),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    rowVersion: z.number().int().positive(),
  })
  .strict();
const run = z
  .object({
    id,
    experimentId: id,
    label: text(300),
    toolName: text(120),
    externalRunId: text(500),
    status: runStatus,
    configSummary: z.string().max(10000),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    result: result.nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    rowVersion: z.number().int().positive(),
  })
  .strict();
const conclusion = z
  .object({
    id,
    experimentId: id,
    resultId: nullableId,
    statement: text(20000),
    status: conclusionStatus,
    provenance: z.enum(['manual', 'ai-proposed-confirmed']),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    rowVersion: z.number().int().positive(),
  })
  .strict();
export const conclusionProposalSchema = z
  .object({
    id,
    experimentId: id,
    statement: text(20000),
    rationale: text(4000),
    providerId: z.enum(['openai', 'codex']),
    model: text(120),
    status: z.enum(['pending', 'confirmed', 'rejected']),
    confirmedConclusionId: nullableId,
    createdAt: z.iso.datetime(),
    reviewedAt: z.iso.datetime().nullable(),
    rowVersion: z.number().int().positive(),
  })
  .strict();
export const experimentSchema = z
  .object({
    id,
    workspaceId: id,
    questionId: nullableId,
    title: text(300),
    hypothesis: text(10000),
    status,
    repositoryId: nullableId,
    codeSnapshotIdentity: z.string().max(500).nullable(),
    configSummary: z.string().max(10000),
    runs: z.array(run).max(200),
    conclusions: z.array(conclusion).max(100),
    proposals: z.array(conclusionProposalSchema).max(100),
    availability: z
      .object({
        question: z.enum(['available', 'unavailable']),
        repository: z.enum(['available', 'stale', 'unavailable']),
        reason: z.string().max(1000).nullable(),
      })
      .strict(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    rowVersion: z.number().int().positive(),
  })
  .strict();
export const createExperimentSchema = z
  .object({
    workspaceId: id,
    questionId: nullableId,
    title: text(300),
    hypothesis: text(10000),
    repositoryId: nullableId,
    codeSnapshotIdentity: z.string().trim().min(1).max(500).nullable(),
    configSummary: z.string().max(10000),
  })
  .strict();
export const updateExperimentSchema = createExperimentSchema
  .extend({ id, rowVersion: z.number().int().positive() })
  .strict();
export const setExperimentStatusSchema = experimentIdentitySchema
  .extend({ status, rowVersion: z.number().int().positive() })
  .strict();
export const deleteExperimentSchema = experimentIdentitySchema
  .extend({ confirmation: z.literal('DELETE_EXPERIMENT') })
  .strict();
export const addRunSchema = experimentIdentitySchema
  .extend({
    label: text(300),
    toolName: text(120),
    externalRunId: text(500),
    configSummary: z.string().max(10000),
    startedAt: z.iso.datetime().nullable(),
  })
  .strict();
export const updateRunSchema = experimentIdentitySchema
  .extend({
    runId: id,
    label: text(300),
    status: runStatus,
    configSummary: z.string().max(10000),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    rowVersion: z.number().int().positive(),
  })
  .strict();
export const deleteRunSchema = experimentIdentitySchema
  .extend({ runId: id, confirmation: z.literal('DELETE_EXPERIMENT_RUN') })
  .strict();
export const recordResultSchema = experimentIdentitySchema
  .extend({ runId: id, summary: text(20000), outcome, metrics: z.array(metric).max(50) })
  .strict();
export const createConclusionSchema = experimentIdentitySchema
  .extend({ resultId: nullableId, statement: text(20000) })
  .strict();
export const updateConclusionSchema = experimentIdentitySchema
  .extend({
    conclusionId: id,
    statement: text(20000),
    status: conclusionStatus,
    rowVersion: z.number().int().positive(),
  })
  .strict();
export const generateProposalSchema = experimentIdentitySchema
  .extend({ instruction: text(4000) })
  .strict();
export const confirmProposalSchema = experimentIdentitySchema
  .extend({ proposalId: id, statement: text(20000), rowVersion: z.number().int().positive() })
  .strict();
export const rejectProposalSchema = experimentIdentitySchema
  .extend({ proposalId: id, rowVersion: z.number().int().positive() })
  .strict();
