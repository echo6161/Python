import { describe, expect, it } from 'vitest';

import {
  aiChatGptBridgeInputSchema,
  aiCodexLoginIdSchema,
  aiCodexLoginResultSchema,
  aiProviderIdSchema,
  aiProviderSettingsSchema,
  aiTaskInputSchema,
} from '../../src/main/ipc/ai-schemas';

const paperId = '550e8400-e29b-41d4-a716-446655440000';

describe('AI IPC schemas', () => {
  it('accepts bounded non-secret provider settings and rejects secret fields', () => {
    const settings = {
      providerId: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5.6',
      temperature: 0.2,
      maxOutputTokens: 2_048,
      saveHistoryByDefault: true,
    };
    expect(aiProviderSettingsSchema.parse({ ...settings, codexProxyUrl: null })).toEqual({
      ...settings,
      codexProxyUrl: null,
    });
    expect(
      aiProviderSettingsSchema.parse({
        ...settings,
        codexProxyUrl: 'http://127.0.0.1:7897',
      }),
    ).toMatchObject({ codexProxyUrl: 'http://127.0.0.1:7897' });
    expect(() =>
      aiProviderSettingsSchema.parse({ ...settings, apiKey: 'must-not-persist' }),
    ).toThrow();
    expect(() => aiProviderSettingsSchema.parse({ ...settings, temperature: 2.1 })).toThrow();
    expect(() => aiProviderSettingsSchema.parse({ ...settings, maxOutputTokens: 0 })).toThrow();
  });

  it('requires exact selected text for translation and a question for chat', () => {
    const selection = {
      paperId,
      paperTitle: 'Paper',
      pageNumber: 1,
      selectedText: 'Selected text',
      textStart: 4,
      textEnd: 17,
    };
    expect(
      aiTaskInputSchema.parse({
        kind: 'translate',
        paperId,
        selection,
        prompt: null,
        conversationId: null,
        saveHistory: true,
      }),
    ).toMatchObject({ kind: 'translate', selection });
    expect(() =>
      aiTaskInputSchema.parse({
        kind: 'translate',
        paperId,
        selection: null,
        prompt: null,
        conversationId: null,
        saveHistory: true,
      }),
    ).toThrow('Select text first');
    expect(() =>
      aiTaskInputSchema.parse({
        kind: 'chat',
        paperId,
        selection: null,
        prompt: null,
        conversationId: null,
        saveHistory: true,
      }),
    ).toThrow('Enter a question');
  });

  it('bounds the manual ChatGPT bridge to the same selected-text task scope', () => {
    const selection = {
      paperId,
      paperTitle: 'Paper',
      pageNumber: 1,
      selectedText: 'Selected text',
      textStart: 4,
      textEnd: 17,
    };
    expect(
      aiChatGptBridgeInputSchema.parse({
        kind: 'translate',
        selection,
        prompt: null,
      }),
    ).toEqual({ kind: 'translate', selection, prompt: null });
    expect(() =>
      aiChatGptBridgeInputSchema.parse({
        kind: 'translate',
        selection: null,
        prompt: null,
      }),
    ).toThrow('Select text first');
    expect(() =>
      aiChatGptBridgeInputSchema.parse({
        kind: 'translate',
        selection,
        prompt: null,
        destinationUrl: 'https://example.com/',
      }),
    ).toThrow();
  });

  it('accepts only domain provider ids and opaque login ids, never URLs or credentials', () => {
    expect(aiProviderIdSchema.parse('codex')).toBe('codex');
    expect(() => aiProviderIdSchema.parse('http://127.0.0.1:9999')).toThrow();
    expect(aiCodexLoginIdSchema.parse('codex-login-session_01')).toBe('codex-login-session_01');
    expect(
      aiCodexLoginResultSchema.parse({
        loginId: 'codex-login-session_01',
        opened: true,
      }),
    ).toEqual({ loginId: 'codex-login-session_01', opened: true });
    expect(() => aiCodexLoginIdSchema.parse('https://example.com/login')).toThrow();
    expect(() =>
      aiCodexLoginIdSchema.parse({ url: 'https://chatgpt.com', cookie: 'secret' }),
    ).toThrow();
  });
});
