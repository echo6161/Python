import { z } from 'zod';

import { paperIdSchema } from './library-schemas';

export const aiProviderSettingsSchema = z
  .object({
    providerId: z.enum(['openai', 'codex']),
    baseUrl: z.string().trim().min(1).max(2_048),
    codexProxyUrl: z.string().trim().max(200).nullable(),
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

export const aiProviderSettingsInputSchema = aiProviderSettingsSchema.extend({
  codexProxyUrl: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});

export const aiCredentialStateSchema = z
  .object({
    configured: z.boolean(),
    persistence: z.enum(['secure', 'session_only', 'unavailable']),
    backend: z.string().max(80),
  })
  .strict();

export const aiCapabilitiesSchema = z
  .object({
    providerId: z.enum(['openai', 'codex']),
    settings: aiProviderSettingsSchema,
    credential: aiCredentialStateSchema,
    providers: z.array(
      z
        .object({
          id: z.enum(['openai', 'codex']),
          name: z.string().min(1).max(80),
          status: z.enum([
            'connected',
            'not_configured',
            'offline',
            'expired',
            'version_mismatch',
            'login_pending',
            'login_cancelled',
            'error',
          ]),
          available: z.boolean(),
          configured: z.boolean(),
          version: z.string().max(80).nullable(),
          plan: z.string().max(80).nullable(),
          models: z.array(
            z
              .object({
                id: z.string().min(1).max(120),
                displayName: z.string().min(1).max(120),
                isDefault: z.boolean(),
              })
              .strict(),
          ),
          capabilities: z.array(z.string().min(1).max(120)).max(20),
          limitations: z.array(z.string().min(1).max(240)).max(20),
          lastError: z.string().max(500).nullable(),
        })
        .strict(),
    ),
    gate: z
      .object({
        verdict: z.literal('supported'),
        checkedAt: z.literal('2026-08-12'),
        integration: z.literal('official-codex-app-server'),
      })
      .strict(),
    selectionOnlyByDefault: z.literal(true),
  })
  .strict();

export const aiProviderIdSchema = z.enum(['openai', 'codex']);
export const aiCodexLoginIdSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) => !hasControlCharacter(value) && !value.includes('://'),
    'The Codex login identifier is invalid.',
  );
export const aiCodexLoginResultSchema = z
  .object({ loginId: aiCodexLoginIdSchema, opened: z.literal(true) })
  .strict();

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 32 || codePoint === 127) return true;
  }
  return false;
}

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

export const aiChatGptBridgeInputSchema = z
  .object({
    kind: z.enum(['translate', 'explain', 'term', 'chat', 'follow_up']),
    selection: aiSelectionScopeSchema.nullable(),
    prompt: z.string().trim().min(1).max(4_000).nullable(),
  })
  .strict()
  .superRefine((input, context) => {
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

export const aiChatGptBridgeResultSchema = z
  .object({
    copied: z.literal(true),
    destinationUrl: z.literal('https://chatgpt.com/'),
    opened: z.boolean(),
    promptCharacterCount: z.number().int().min(1).max(30_000),
  })
  .strict();

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
    providerId: z.enum(['openai', 'codex']),
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
