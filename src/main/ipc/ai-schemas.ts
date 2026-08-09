import { z } from 'zod';

import { paperIdSchema } from './library-schemas';

export const aiProviderSettingsSchema = z
  .object({
    baseUrl: z.string().trim().min(1).max(2_048),
    model: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-zA-Z0-9._:-]+$/u),
    temperature: z.number().min(0).max(2),
    maxOutputTokens: z.number().int().min(1).max(128_000),
    saveHistoryByDefault: z.boolean(),
  })
  .strict();

export const aiCredentialStateSchema = z
  .object({
    configured: z.boolean(),
    persistence: z.enum(['secure', 'session_only', 'unavailable']),
    backend: z.string().max(80),
  })
  .strict();

export const aiCapabilitiesSchema = z
  .object({
    providerId: z.literal('openai'),
    settings: aiProviderSettingsSchema,
    credential: aiCredentialStateSchema,
    selectionOnlyByDefault: z.literal(true),
  })
  .strict();

export const aiSelectionScopeSchema = z
  .object({
    paperId: paperIdSchema,
    paperTitle: z.string().trim().min(1).max(500),
    pageNumber: z.number().int().min(1).max(100_000),
    selectedText: z.string().trim().min(1).max(20_000),
    textStart: z.number().int().min(0).max(100_000_000),
    textEnd: z.number().int().min(1).max(100_000_000),
  })
  .strict()
  .refine(({ textStart, textEnd }) => textEnd > textStart, 'Text range must not be empty.');

export const aiTaskInputSchema = z
  .object({
    kind: z.enum(['translate', 'explain', 'term', 'chat', 'follow_up']),
    paperId: paperIdSchema,
    selection: aiSelectionScopeSchema.nullable(),
    prompt: z.string().trim().min(1).max(4_000).nullable(),
    conversationId: paperIdSchema.nullable(),
    saveHistory: z.boolean(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.selection && input.selection.paperId !== input.paperId) {
      context.addIssue({
        code: 'custom',
        path: ['selection', 'paperId'],
        message: 'Paper mismatch.',
      });
    }
    const needsSelection =
      input.kind === 'translate' || input.kind === 'explain' || input.kind === 'term';
    if (needsSelection && !input.selection) {
      context.addIssue({ code: 'custom', path: ['selection'], message: 'Select text first.' });
    }
    const needsPrompt = input.kind === 'chat' || input.kind === 'follow_up';
    if (needsPrompt && !input.prompt) {
      context.addIssue({ code: 'custom', path: ['prompt'], message: 'Enter a question.' });
    }
  });

export const aiMessageSchema = z
  .object({
    id: paperIdSchema,
    role: z.enum(['user', 'assistant']),
    content: z.string().max(2_000_000),
    status: z.enum(['streaming', 'complete', 'failed', 'cancelled']),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const aiConversationSchema = z
  .object({
    id: paperIdSchema,
    paperId: paperIdSchema,
    title: z.string().min(1).max(500),
    providerId: z.literal('openai'),
    model: z.string().min(1).max(120),
    messages: z.array(aiMessageSchema).max(500),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    persisted: z.boolean(),
  })
  .strict();

export const aiTaskAcceptedSchema = z
  .object({
    requestId: paperIdSchema,
    conversation: aiConversationSchema,
    assistantMessageId: paperIdSchema,
  })
  .strict();

export const aiRequestIdSchema = paperIdSchema;
export const aiApiKeySchema = z.string().trim().min(8).max(512);
