import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsWorkspace } from '../../src/renderer/components/SettingsWorkspace';
import type { AiApi, AiCapabilities, AiProviderSettings } from '../../src/shared/contracts/ai';

const capabilities: AiCapabilities = {
  providerId: 'openai',
  settings: {
    providerId: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    codexProxyUrl: null,
    model: 'gpt-5.6',
    temperature: 0.2,
    maxOutputTokens: 2_000,
    saveHistoryByDefault: true,
  },
  credential: { configured: false, persistence: 'secure', backend: 'dpapi' },
  providers: [
    {
      id: 'openai',
      name: 'OpenAI API',
      status: 'not_configured',
      available: true,
      configured: false,
      version: null,
      plan: null,
      models: [],
      capabilities: ['Streaming', 'Cancellation'],
      limitations: ['Requires separately billed API key'],
      lastError: null,
    },
    {
      id: 'codex',
      name: 'ChatGPT account via Codex',
      status: 'not_configured',
      available: true,
      configured: false,
      version: '0.147.0',
      plan: null,
      models: [{ id: 'gpt-5.6-sol', displayName: 'GPT-5.6-Sol', isDefault: true }],
      capabilities: ['Official ChatGPT sign-in', 'Streaming', 'Cancellation'],
      limitations: ['Text only; tools disabled'],
      lastError: null,
    },
  ],
  gate: {
    verdict: 'supported',
    checkedAt: '2026-08-12',
    integration: 'official-codex-app-server',
  },
  selectionOnlyByDefault: true,
};

function installAiApi(overrides: Partial<AiApi> = {}) {
  const updateSettings = vi
    .fn<AiApi['updateSettings']>()
    .mockImplementation((settings: AiProviderSettings) =>
      Promise.resolve({ ok: true, value: { ...capabilities, settings } }),
    );
  const setApiKey = vi.fn<AiApi['setApiKey']>().mockResolvedValue({
    ok: true,
    value: { configured: true, persistence: 'secure', backend: 'dpapi' },
  });
  const api: AiApi = {
    getCapabilities: vi.fn().mockResolvedValue({ ok: true, value: capabilities }),
    refreshProviders: vi.fn().mockResolvedValue({ ok: true, value: capabilities }),
    selectProvider: vi.fn(),
    startCodexLogin: vi.fn(),
    cancelCodexLogin: vi.fn(),
    logoutCodex: vi.fn(),
    updateSettings,
    setApiKey,
    deleteApiKey: vi.fn().mockResolvedValue({
      ok: true,
      value: { configured: false, persistence: 'secure', backend: 'dpapi' },
    }),
    getConversation: vi.fn(),
    openChatGptBridge: vi.fn(),
    startTask: vi.fn(),
    cancelTask: vi.fn(),
    onStreamEvent: vi.fn(() => vi.fn()),
    ...overrides,
  };
  Object.defineProperty(window, 'paperMind', { configurable: true, value: { ai: api } });
  return { api, setApiKey, updateSettings };
}

describe('SettingsWorkspace AI providers', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('shows the gate, current provider, status, action, capabilities, and limits', async () => {
    installAiApi();
    render(<SettingsWorkspace />);
    expect(await screen.findByText('Official integration supported')).toBeDefined();
    expect(screen.getAllByText('OpenAI API').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not connected').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Configure' }));
    expect(screen.getByRole('button', { name: 'Sign in with ChatGPT' })).toBeDefined();
    fireEvent.click(screen.getByText('Capabilities and limits'));
    expect(screen.getByText('Text only; tools disabled')).toBeDefined();
  });

  it('stores a key without echoing it and clears the password input immediately', async () => {
    const { setApiKey } = installAiApi();
    render(<SettingsWorkspace />);
    const keyInput = await screen.findByLabelText<HTMLInputElement>('API Key');
    fireEvent.change(keyInput, { target: { value: 'unit-test-credential' } });
    fireEvent.click(screen.getByRole('button', { name: 'Store key' }));
    await waitFor(() => expect(setApiKey).toHaveBeenCalledWith('unit-test-credential'));
    expect(keyInput.value).toBe('');
    expect(screen.queryByDisplayValue('unit-test-credential')).toBeNull();
  });

  it('opens only the domain-specific official login and never receives its URL', async () => {
    const startCodexLogin = vi.fn<AiApi['startCodexLogin']>().mockResolvedValue({
      ok: true,
      value: { loginId: 'opaque-login-id-not-a-uuid', opened: true },
    });
    installAiApi({ startCodexLogin });
    render(<SettingsWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: 'Configure' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with ChatGPT' }));
    await waitFor(() => expect(startCodexLogin).toHaveBeenCalledWith());
    expect(screen.queryByText(/https:\/\//u)).toBeNull();
    expect(screen.getByText(/official ChatGPT sign-in opened/u)).toBeDefined();
  });

  it('switches to a connected Codex provider and exposes no fake login control', async () => {
    const connected: AiCapabilities = {
      ...capabilities,
      providers: capabilities.providers.map((provider) =>
        provider.id === 'codex'
          ? { ...provider, status: 'connected', configured: true, plan: 'Plus' }
          : provider,
      ),
    };
    const selectProvider = vi.fn<AiApi['selectProvider']>().mockResolvedValue({
      ok: true,
      value: {
        ...connected,
        providerId: 'codex',
        settings: { ...connected.settings, providerId: 'codex', model: 'gpt-5.6-sol' },
      },
    });
    installAiApi({
      getCapabilities: vi.fn().mockResolvedValue({ ok: true, value: connected }),
      selectProvider,
    });
    render(<SettingsWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use' }));
    await waitFor(() => expect(selectProvider).toHaveBeenCalledWith('codex'));
    expect(await screen.findByText('ChatGPT account connection')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDefined();
  });

  it('saves a loopback proxy for the Codex child without accepting credentials in the UI state', async () => {
    const connected: AiCapabilities = {
      ...capabilities,
      providerId: 'codex',
      settings: {
        ...capabilities.settings,
        providerId: 'codex',
        model: 'gpt-5.6-sol',
      },
      providers: capabilities.providers.map((provider) =>
        provider.id === 'codex' ? { ...provider, status: 'connected', configured: true } : provider,
      ),
    };
    const { updateSettings } = installAiApi({
      getCapabilities: vi.fn().mockResolvedValue({ ok: true, value: connected }),
    });
    render(<SettingsWorkspace />);
    const input = await screen.findByLabelText<HTMLInputElement>(/Local proxy/u);
    fireEvent.change(input, { target: { value: 'http://127.0.0.1:7897' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ codexProxyUrl: 'http://127.0.0.1:7897' }),
      ),
    );
  });
});
