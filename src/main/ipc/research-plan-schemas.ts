import { z } from 'zod';

const id = z.uuid();
const date = z.iso.datetime();
const goal = z.string().trim().min(1).max(4_000);
const title = z.string().trim().min(1).max(300);
const description = z.string().max(10_000);
const rowVersion = z.number().int().positive();
const taskStatus = z.enum(['todo', 'in_progress', 'blocked', 'done', 'retired']);
const referenceType = z.enum(['paper', 'repository', 'question', 'memory']);
const itemRef = z
  .object({
    serverId: z.string().min(1).max(200),
    library: z.object({ type: z.enum(['user', 'group']), id: z.string().min(1).max(50) }).strict(),
    itemKey: z.string().regex(/^[A-Z0-9]{8}$/u),
  })
  .strict();
export const planReferenceTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paper'), itemRef }).strict(),
  z.object({ type: z.literal('repository'), repositoryId: id }).strict(),
  z.object({ type: z.literal('question'), questionId: id }).strict(),
  z.object({ type: z.literal('memory'), memoryId: id }).strict(),
]);
const referenceCandidate = z
  .object({
    id: z.string().min(1).max(100),
    type: referenceType,
    title: z.string().min(1).max(1_000),
    citation: z.string().min(1).max(1_000),
    target: planReferenceTargetSchema,
    snapshotIdentity: z.string().max(1_000).nullable(),
    availability: z.enum(['available', 'stale', 'unavailable']),
    availabilityReason: z.string().max(1_000).nullable(),
  })
  .strict();
const reference = referenceCandidate
  .extend({
    taskId: id,
    workspaceId: id,
    displayOrder: z.number().int().nonnegative(),
    createdAt: date,
  })
  .strict();
const evidence = z
  .object({
    id,
    taskId: id,
    workspaceId: id,
    sourceType: referenceType,
    title: z.string().min(1).max(1_000),
    citation: z.string().min(1).max(1_000),
    target: planReferenceTargetSchema,
    snapshotIdentity: z.string().max(1_000).nullable(),
    note: z.string().min(1).max(4_000),
    createdAt: date,
  })
  .strict();
const taskBase = z
  .object({
    id,
    planId: id,
    workspaceId: id,
    title,
    description,
    status: taskStatus,
    blockedReason: z.string().max(1_000).nullable(),
    displayOrder: z.number().int().nonnegative(),
    dependencyIds: z.array(id).max(500),
    references: z.array(reference).max(500),
    completionEvidence: z.array(evidence).max(500),
    completedAt: date.nullable(),
    createdAt: date,
    updatedAt: date,
    rowVersion,
  })
  .strict();
const progress = z
  .object({
    completed: z.number().int().nonnegative(),
    eligible: z.number().int().nonnegative(),
    percent: z.number().int().min(0).max(100),
    blocked: z.number().int().nonnegative(),
    nextTaskId: id.nullable(),
    explanation: z.string().min(1).max(500),
  })
  .strict();
export const researchPlanSchema = z
  .object({
    id,
    workspaceId: id,
    goal,
    status: z.enum(['active', 'retired']),
    version: z.number().int().positive(),
    tasks: z.array(taskBase).max(2_000),
    progress,
    createdAt: date,
    updatedAt: date,
    rowVersion,
  })
  .strict();
export const createResearchPlanSchema = z.object({ workspaceId: id, goal }).strict();
export const updateResearchPlanSchema = z
  .object({ workspaceId: id, planId: id, goal, rowVersion })
  .strict();
export const planIdentitySchema = z.object({ workspaceId: id, planId: id }).strict();
export const retireResearchPlanSchema = planIdentitySchema.extend({ rowVersion }).strict();
export const deleteResearchPlanSchema = planIdentitySchema
  .extend({ confirmation: z.literal('DELETE_RESEARCH_PLAN') })
  .strict();
export const createPlanTaskSchema = planIdentitySchema.extend({ title, description }).strict();
export const updatePlanTaskSchema = createPlanTaskSchema
  .extend({ taskId: id, rowVersion })
  .strict();
export const planTaskIdentitySchema = planIdentitySchema.extend({ taskId: id }).strict();
export const deletePlanTaskSchema = planTaskIdentitySchema
  .extend({ confirmation: z.literal('DELETE_PLAN_TASK') })
  .strict();
export const reorderPlanTasksSchema = planIdentitySchema
  .extend({
    taskIds: z
      .array(id)
      .max(2_000)
      .refine((values) => new Set(values).size === values.length),
  })
  .strict();
export const setPlanTaskStatusSchema = planTaskIdentitySchema
  .extend({
    status: z.enum(['todo', 'in_progress', 'blocked', 'retired']),
    blockedReason: z.string().trim().min(1).max(1_000).optional(),
    rowVersion,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === 'blocked' && !value.blockedReason)
      context.addIssue({
        code: 'custom',
        path: ['blockedReason'],
        message: 'Blocked tasks require a reason.',
      });
  });
export const completePlanTaskSchema = planTaskIdentitySchema
  .extend({
    completionNote: z.string().trim().min(1).max(4_000),
    evidenceReferenceIds: z
      .array(id)
      .max(500)
      .refine((values) => new Set(values).size === values.length),
    rowVersion,
  })
  .strict();
export const setPlanDependenciesSchema = planTaskIdentitySchema
  .extend({
    dependencyIds: z
      .array(id)
      .max(500)
      .refine((values) => new Set(values).size === values.length),
  })
  .strict();
export const addPlanReferenceSchema = planTaskIdentitySchema
  .extend({ target: planReferenceTargetSchema })
  .strict();
export const removePlanReferenceSchema = planTaskIdentitySchema
  .extend({ referenceId: id })
  .strict();
export const referenceCandidateListSchema = z.array(referenceCandidate).max(2_000);
const proposalChange = z
  .object({
    id,
    kind: z.enum(['add', 'update', 'keep', 'conflict']),
    taskId: id.nullable(),
    title,
    description,
    rationale: z.string().trim().min(1).max(2_000),
    dependencyTaskIds: z.array(id).max(500),
    referenceCandidateIds: z.array(z.string().min(1).max(100)).max(500),
  })
  .strict();
export const researchPlanProposalSchema = z
  .object({
    id,
    workspaceId: id,
    planId: id.nullable(),
    baseVersion: z.number().int().positive().nullable(),
    mode: z.enum(['generate', 'adapt']),
    goal,
    rationale: z.string().trim().min(1).max(4_000),
    changes: z.array(proposalChange).max(100),
    providerId: z.enum(['codex', 'openai']),
    model: z.string().min(1).max(120),
    status: z.enum(['pending', 'confirmed', 'rejected']),
    createdAt: date,
    reviewedAt: date.nullable(),
    rowVersion,
  })
  .strict();
export const generateResearchPlanProposalSchema = z
  .object({
    workspaceId: id,
    mode: z.enum(['generate', 'adapt']),
    instruction: z.string().trim().min(1).max(4_000),
  })
  .strict();
export const updateResearchPlanProposalSchema = z
  .object({
    workspaceId: id,
    proposalId: id,
    goal,
    rationale: z.string().trim().min(1).max(4_000),
    changes: z.array(proposalChange).max(100),
    rowVersion,
  })
  .strict();
export const reviewResearchPlanProposalSchema = z
  .object({ workspaceId: id, proposalId: id, rowVersion })
  .strict();
export const researchPlanHistorySchema = z
  .object({
    id,
    planId: id,
    workspaceId: id,
    version: z.number().int().positive(),
    actor: z.enum(['user', 'ai-confirmed']),
    changeKind: z.string().min(1).max(80),
    summary: z.string().min(1).max(500),
    snapshot: researchPlanSchema,
    createdAt: date,
  })
  .strict();
