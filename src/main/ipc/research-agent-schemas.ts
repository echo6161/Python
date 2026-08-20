import { z } from 'zod';

import { knowledgeProvenanceSchema } from './knowledge-schemas';

const id = z.uuid();
const status = z.enum(['running', 'succeeded', 'partial', 'cancelled', 'timeout', 'failed']);
const terminationReason = z.enum([
  'completed',
  'cancelled',
  'timeout',
  'max_steps',
  'max_tool_calls',
  'max_context',
  'tool_error',
  'provider_error',
]);
const toolName = z.enum([
  'inspect_workspace',
  'search_knowledge',
  'read_paper_pages',
  'search_code',
  'read_code',
  'list_questions',
  'list_notes_memory',
  'inspect_plan',
  'list_links',
]);
const proposalSchema = z
  .object({
    id,
    runId: id,
    workspaceId: id,
    kind: z.literal('memory'),
    title: z.string().min(1).max(300),
    bodyMarkdown: z.string().min(1).max(100000),
    reason: z.string().min(1).max(4000),
    status: z.enum(['pending', 'accepted', 'rejected']),
    downstreamProposalId: id.nullable(),
    createdAt: z.iso.datetime(),
    reviewedAt: z.iso.datetime().nullable(),
    rowVersion: z.number().int().positive(),
  })
  .strict();
const citationSchema = z
  .object({
    alias: z.string().regex(/^S\d{1,3}$/u),
    chunkId: id,
    sourceType: z.enum(['paper', 'code', 'question', 'link']),
    title: z.string().min(1).max(1000),
    snippet: z.string().max(2000),
    citation: z.string().min(1).max(1000),
    stale: z.boolean(),
    unavailableReason: z.string().max(1000).nullable(),
    provenance: knowledgeProvenanceSchema,
  })
  .strict();
const traceSchema = z
  .object({
    id,
    ordinal: z.number().int().nonnegative().max(20),
    toolName,
    status: z.enum(['running', 'succeeded', 'cancelled', 'failed']),
    inputSummary: z.string().max(1000),
    outputSummary: z.string().max(2000),
    errorCode: z.string().max(100).nullable(),
    errorMessage: z.string().max(1000).nullable(),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict();
const budgetSchema = z
  .object({
    maximumSteps: z.number().int().min(1).max(20),
    maximumToolCalls: z.number().int().min(1).max(20),
    maximumContextCharacters: z.number().int().min(1000).max(50000),
    timeoutMs: z.number().int().min(1000).max(300000),
  })
  .strict();
const usageSchema = z
  .object({
    steps: z.number().int().nonnegative().max(20),
    toolCalls: z.number().int().nonnegative().max(20),
    contextCharacters: z.number().int().nonnegative().max(50000),
  })
  .strict();
const errorSchema = z
  .object({
    code: z.enum([
      'AUTHENTICATION',
      'CANCELLED',
      'INVALID_REQUEST',
      'MISSING_CREDENTIAL',
      'NETWORK',
      'PERMISSION',
      'PROVIDER',
      'RATE_LIMIT',
      'STORAGE',
      'TIMEOUT',
    ]),
    message: z.string().max(1000),
    retryable: z.boolean(),
  })
  .strict();

export const researchAgentRunSchema = z
  .object({
    id,
    workspaceId: id,
    goal: z.string().min(1).max(4000),
    status,
    terminationReason: terminationReason.nullable(),
    answerMarkdown: z.string().max(2000000),
    uncertainty: z.string().max(4000),
    providerId: z.enum(['openai', 'codex']),
    model: z.string().min(1).max(120),
    budget: budgetSchema,
    usage: usageSchema,
    trace: z.array(traceSchema).max(20),
    citations: z.array(citationSchema).max(20),
    proposals: z.array(proposalSchema).max(5),
    error: errorSchema.nullable(),
    createdAt: z.iso.datetime(),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict();
export const researchAgentRunSummarySchema = z
  .object({
    id,
    workspaceId: id,
    goal: z.string().min(1).max(4000),
    status,
    terminationReason: terminationReason.nullable(),
    toolCalls: z.number().int().nonnegative().max(20),
    citationCount: z.number().int().nonnegative().max(20),
    proposalCount: z.number().int().nonnegative().max(5),
    createdAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict();
export const startResearchAgentRunSchema = z
  .object({ workspaceId: id, goal: z.string().trim().min(1).max(4000) })
  .strict();
export const researchAgentIdentitySchema = z.object({ workspaceId: id, runId: id }).strict();
export const researchAgentCitationIdentitySchema = researchAgentIdentitySchema
  .extend({ alias: z.string().regex(/^S\d{1,3}$/u) })
  .strict();
export const reviewResearchAgentProposalSchema = researchAgentIdentitySchema
  .extend({ proposalId: id, rowVersion: z.number().int().positive() })
  .strict();
export const researchAgentAcceptedSchema = z
  .object({ requestId: id, run: researchAgentRunSchema })
  .strict();
export const researchAgentProposalSchema = proposalSchema;
