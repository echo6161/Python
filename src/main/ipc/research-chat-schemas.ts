import { z } from 'zod';

import { knowledgeProvenanceSchema } from './knowledge-schemas';

const id = z.uuid();
const sourceType = z.enum(['paper', 'code', 'question', 'link']);
const alias = z.string().regex(/^S[1-9][0-9]{0,2}$/u);
const aiError = z
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
    message: z.string().min(1).max(500),
    retryable: z.boolean(),
  })
  .strict();

export const prepareResearchChatContextSchema = z
  .object({
    workspaceId: id,
    questionId: id.nullable(),
    query: z.string().trim().min(1).max(4_000),
    sourceTypes: z
      .array(sourceType)
      .max(4)
      .refine((values) => new Set(values).size === values.length),
  })
  .strict();

const contextSource = z
  .object({
    alias,
    chunkId: id,
    sourceType,
    title: z.string().max(1_000),
    snippet: z.string().min(1).max(1_200),
    citation: z.string().min(1).max(500),
    score: z.number().min(0).max(1),
    stale: z.boolean(),
    unavailableReason: z.string().max(500).nullable(),
    provenance: knowledgeProvenanceSchema,
  })
  .strict();

export const researchChatContextPreviewSchema = z
  .object({
    id,
    workspaceId: id,
    questionId: id.nullable(),
    query: z.string().min(1).max(4_000),
    sourceTypes: z.array(sourceType).max(4),
    retrievalVersion: z.string().min(1).max(500),
    searchMode: z.enum(['keyword', 'hybrid']),
    sources: z.array(contextSource).max(12),
    budget: z
      .object({
        maximumCharacters: z.number().int().positive().max(100_000),
        usedCharacters: z.number().int().nonnegative().max(100_000),
        maximumSources: z.number().int().positive().max(100),
        candidateSources: z.number().int().nonnegative().max(1_000),
        includedSources: z.number().int().nonnegative().max(100),
        deduplicatedSources: z.number().int().nonnegative().max(1_000),
        truncatedSources: z.number().int().nonnegative().max(1_000),
      })
      .strict(),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();

const citation = z.object({ alias, source: contextSource }).strict();
export const researchChatMessageSchema = z
  .object({
    id,
    role: z.enum(['assistant', 'user']),
    content: z.string().max(2_000_000),
    status: z.enum(['streaming', 'complete', 'failed', 'cancelled']),
    citations: z.array(citation).max(100),
    unsupportedCitations: z.array(z.string().max(12)).max(100),
    error: aiError.nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const researchChatConversationSchema = z
  .object({
    id,
    workspaceId: id,
    questionId: id.nullable(),
    title: z.string().min(1).max(300),
    providerId: z.enum(['openai', 'codex']),
    model: z.string().min(1).max(120),
    messages: z.array(researchChatMessageSchema).max(1_000),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const getResearchChatConversationSchema = z
  .object({
    workspaceId: id,
    questionId: id.nullable(),
  })
  .strict();
export const startResearchChatTurnSchema = z
  .object({
    contextId: id,
    selectedAliases: z
      .array(alias)
      .max(12)
      .refine((values) => new Set(values).size === values.length),
    conversationId: id.nullable(),
  })
  .strict();
export const retryResearchChatTurnSchema = z
  .object({
    workspaceId: id,
    conversationId: id,
    assistantMessageId: id,
  })
  .strict();
export const researchChatTurnAcceptedSchema = z
  .object({
    requestId: id,
    conversation: researchChatConversationSchema,
    assistantMessageId: id,
  })
  .strict();
export const researchChatRequestIdSchema = id;
export const openResearchChatCitationSchema = z
  .object({
    workspaceId: id,
    conversationId: id,
    messageId: id,
    alias,
  })
  .strict();
