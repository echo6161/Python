import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsWorkspace } from '../../src/renderer/components/SettingsWorkspace';
import type { AiApi, AiCapabilities, AiProviderSettings } from '../../src/shared/contracts/ai';
import type { WorkspaceApi } from '../../src/shared/contracts/workspace';

const capabilities: AiCapabilities = {
  providerId: 'openai',
  settings: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.6',
    temperature: 0.2,
    maxOutputTokens: 2_000,
    saveHistoryByDefault: true,
  },
  credential: { configured: false, persistence: 'secure', backend: 'dpapi' },
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
  const workspace: WorkspaceApi = {
    create: vi.fn(),
    get: vi.fn(),
    list: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    update: vi.fn(),
    setStatus: vi.fn(),
    delete: vi.fn(),
    getLastActive: vi.fn().mockResolvedValue({ ok: true, value: null }),
    setLastActive: vi.fn(),
    addPaper: vi.fn(),
    removePaper: vi.fn(),
    listPapers: vi.fn(),
  };
  Object.defineProperty(window, 'paperMind', {
    configurable: true,
    value: { ai: api, workspace },
  });
  return { setApiKey, updateSettings };
}

describe('SettingsWorkspace AI settings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('stores a key without echoing it and clears the password input immediately', async () => {
    const { setApiKey } = installAiApi();
    render(<SettingsWorkspace />);
    await screen.findByText('Not configured');

    const keyInput = screen.getByLabelText<HTMLInputElement>('API Key');
    expect(keyInput.type).toBe('password');
    fireEvent.change(keyInput, { target: { value: 'unit-test-credential' } });
    fireEvent.click(screen.getByRole('button', { name: 'Store key' }));

    await waitFor(() => expect(setApiKey).toHaveBeenCalledWith('unit-test-credential'));
    expect(keyInput.value).toBe('');
    expect(screen.queryByDisplayValue('unit-test-credential')).toBeNull();
    expect(await screen.findByText('Stored securely')).toBeDefined();
  });

  it('saves non-secret provider settings separately from the credential', async () => {
    const { updateSettings } = installAiApi();
    render(<SettingsWorkspace />);
    await screen.findByDisplayValue('gpt-5.6');

    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'gpt-5.1-mini' } });
    fireEvent.change(screen.getByLabelText('Temperature'), { target: { value: '0.7' } });
    fireEvent.change(screen.getByLabelText('Maximum output tokens'), {
      target: { value: '4096' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save provider settings' }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
    expect(updateSettings).toHaveBeenCalledWith({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5.1-mini',
      temperature: 0.7,
      maxOutputTokens: 4096,
      saveHistoryByDefault: true,
    });
    expect(screen.getByText('AI provider settings saved.')).toBeDefined();
  });

  it('shows the Linux session-only warning without exposing a key', async () => {
    installAiApi({
      getCapabilities: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          ...capabilities,
          credential: { configured: true, persistence: 'session_only', backend: 'basic_text' },
        },
      }),
    });
    render(<SettingsWorkspace />);

    expect(await screen.findByText('Configured for this session')).toBeDefined();
    expect(screen.getByText(/The key will be forgotten when PaperMind closes/)).toBeDefined();
    expect(screen.getByLabelText<HTMLInputElement>('API Key').value).toBe('');
  });
});
