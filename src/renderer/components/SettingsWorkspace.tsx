import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Database, KeyRound, Languages, Save, ShieldCheck, Trash2 } from 'lucide-react';

import type { AiCapabilities, AiProviderSettings } from '../../shared/contracts/ai';

const DEFAULT_SETTINGS: AiProviderSettings = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-5.6',
  temperature: 0.2,
  maxOutputTokens: 2_000,
  saveHistoryByDefault: true,
};

function credentialLabel(capabilities: AiCapabilities | null): string {
  if (!capabilities?.credential.configured) return 'Not configured';
  if (capabilities.credential.persistence === 'session_only') return 'Configured for this session';
  if (capabilities.credential.persistence === 'secure') return 'Stored securely';
  return 'Unavailable';
}

export function SettingsWorkspace() {
  const [capabilities, setCapabilities] = useState<AiCapabilities | null>(null);
  const [settings, setSettings] = useState<AiProviderSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingCredential, setIsSavingCredential] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const apiKeyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void window.paperMind.ai
      .getCapabilities()
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        setCapabilities(result.value);
        setSettings(result.value.settings);
      })
      .catch(() => {
        if (active) setError('AI provider settings could not be loaded.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const saveSettings = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    let url: URL;
    try {
      url = new URL(settings.baseUrl);
    } catch {
      setError('Base URL must be a valid HTTPS URL.');
      return;
    }
    if (url.protocol !== 'https:') {
      setError('Base URL must use HTTPS.');
      return;
    }
    const normalized: AiProviderSettings = {
      ...settings,
      baseUrl: settings.baseUrl.replace(/\/+$/, ''),
      model: settings.model.trim(),
      maxOutputTokens: Math.trunc(settings.maxOutputTokens),
    };
    if (!normalized.model) {
      setError('Model is required.');
      return;
    }

    setIsSavingSettings(true);
    try {
      const result = await window.paperMind.ai.updateSettings(normalized);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setCapabilities(result.value);
      setSettings(result.value.settings);
      setNotice('AI provider settings saved.');
    } catch {
      setError('AI provider settings could not be saved.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const saveApiKey = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const input = apiKeyRef.current;
    const apiKey = input?.value.trim() ?? '';
    if (input) input.value = '';
    setError(null);
    setNotice(null);
    if (!apiKey) {
      setError('Enter an API key.');
      return;
    }

    setIsSavingCredential(true);
    try {
      const result = await window.paperMind.ai.setApiKey(apiKey);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setCapabilities((current) => (current ? { ...current, credential: result.value } : current));
      setNotice(
        result.value.persistence === 'session_only'
          ? 'API key is available for this session only.'
          : 'API key stored using the operating system credential backend.',
      );
    } catch {
      setError('The API key could not be stored.');
    } finally {
      setIsSavingCredential(false);
    }
  };

  const deleteApiKey = async () => {
    if (!window.confirm('Remove the configured OpenAI API key?')) return;
    setError(null);
    setNotice(null);
    setIsSavingCredential(true);
    try {
      const result = await window.paperMind.ai.deleteApiKey();
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setCapabilities((current) => (current ? { ...current, credential: result.value } : current));
      setNotice('API key removed.');
    } catch {
      setError('The API key could not be removed.');
    } finally {
      setIsSavingCredential(false);
    }
  };

  return (
    <section className="min-w-0 flex-1 overflow-auto bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-8 py-5">
        <h1 className="text-lg font-semibold text-zinc-950">Settings</h1>
      </header>
      <div className="mx-auto max-w-3xl space-y-8 px-8 py-8">
        {error || notice ? (
          <div
            className={`border-l-2 px-4 py-3 text-sm ${error ? 'border-red-700 bg-red-50 text-red-800' : 'border-emerald-700 bg-emerald-50 text-emerald-900'}`}
            role={error ? 'alert' : 'status'}
          >
            {error ?? notice}
          </div>
        ) : null}

        <section aria-labelledby="general-settings" className="border-y border-zinc-200 bg-white">
          <h2
            id="general-settings"
            className="border-b border-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-900"
          >
            General
          </h2>
          <div className="flex min-h-16 items-center justify-between gap-6 border-b border-zinc-100 px-5">
            <div className="flex items-center gap-3">
              <Database aria-hidden="true" className="size-4 text-zinc-500" />
              <span className="text-sm font-medium text-zinc-800">Library location</span>
            </div>
            <span className="text-sm text-zinc-500">Automatic</span>
          </div>
          <div className="flex min-h-16 items-center justify-between gap-6 px-5">
            <div className="flex items-center gap-3">
              <Languages aria-hidden="true" className="size-4 text-zinc-500" />
              <span className="text-sm font-medium text-zinc-800">Language</span>
            </div>
            <span className="text-sm text-zinc-500">System default</span>
          </div>
        </section>

        <section
          aria-labelledby="ai-provider-settings"
          className="border-y border-zinc-200 bg-white"
        >
          <header className="flex items-center justify-between gap-4 border-b border-zinc-200 px-5 py-3">
            <div className="flex items-center gap-3">
              <KeyRound aria-hidden="true" className="size-4 text-zinc-500" />
              <h2 id="ai-provider-settings" className="text-sm font-semibold text-zinc-900">
                OpenAI provider
              </h2>
            </div>
            <span className="text-xs font-medium text-zinc-500" data-testid="api-key-status">
              {isLoading ? 'Loading...' : credentialLabel(capabilities)}
            </span>
          </header>

          <form
            className="space-y-4 border-b border-zinc-200 px-5 py-5"
            onSubmit={(event) => void saveApiKey(event)}
          >
            <div>
              <label className="text-xs font-semibold text-zinc-700" htmlFor="openai-api-key">
                API Key
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  ref={apiKeyRef}
                  autoComplete="new-password"
                  className="h-9 min-w-0 flex-1 rounded border border-zinc-200 px-3 text-sm outline-none focus:border-emerald-600"
                  id="openai-api-key"
                  maxLength={512}
                  placeholder={
                    capabilities?.credential.configured
                      ? 'Enter a replacement key'
                      : 'Enter API key'
                  }
                  spellCheck={false}
                  type="password"
                />
                <button className="command-button" disabled={isSavingCredential} type="submit">
                  <KeyRound aria-hidden="true" className="size-4" />
                  {capabilities?.credential.configured ? 'Replace' : 'Store key'}
                </button>
                {capabilities?.credential.configured ? (
                  <button
                    aria-label="Remove API key"
                    className="icon-button hover:text-red-700"
                    disabled={isSavingCredential}
                    title="Remove API key"
                    type="button"
                    onClick={() => void deleteApiKey()}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                The saved key is never displayed again. Credential backend:{' '}
                {capabilities?.credential.backend ?? 'checking'}.
              </p>
              {capabilities?.credential.persistence === 'session_only' ? (
                <p className="mt-2 text-xs font-medium text-amber-700" role="status">
                  Secure storage is unavailable. The key will be forgotten when PaperMind closes.
                </p>
              ) : null}
            </div>
          </form>

          <form className="space-y-5 px-5 py-5" onSubmit={(event) => void saveSettings(event)}>
            <div>
              <label className="text-xs font-semibold text-zinc-700" htmlFor="ai-base-url">
                Base URL
              </label>
              <input
                className="mt-1 h-9 w-full rounded border border-zinc-200 px-3 text-sm outline-none focus:border-emerald-600"
                id="ai-base-url"
                maxLength={500}
                required
                type="url"
                value={settings.baseUrl}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, baseUrl: event.target.value }))
                }
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-700" htmlFor="ai-model">
                Model
              </label>
              <input
                className="mt-1 h-9 w-full rounded border border-zinc-200 px-3 text-sm outline-none focus:border-emerald-600"
                id="ai-model"
                maxLength={100}
                required
                value={settings.model}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, model: event.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-5">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs font-semibold text-zinc-700" htmlFor="ai-temperature">
                    Temperature
                  </label>
                  <output className="text-xs tabular-nums text-zinc-500" htmlFor="ai-temperature">
                    {settings.temperature.toFixed(1)}
                  </output>
                </div>
                <input
                  aria-label="Temperature"
                  className="mt-2 w-full accent-emerald-700"
                  id="ai-temperature"
                  max="2"
                  min="0"
                  step="0.1"
                  type="range"
                  value={settings.temperature}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      temperature: Number(event.target.value),
                    }))
                  }
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-700" htmlFor="ai-max-output">
                  Maximum output tokens
                </label>
                <input
                  className="mt-1 h-9 w-full rounded border border-zinc-200 px-3 text-sm outline-none focus:border-emerald-600"
                  id="ai-max-output"
                  max={128_000}
                  min={64}
                  required
                  type="number"
                  value={settings.maxOutputTokens}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      maxOutputTokens: Number(event.target.value),
                    }))
                  }
                />
              </div>
            </div>

            <label className="flex items-start gap-3 text-xs text-zinc-700">
              <input
                checked={settings.saveHistoryByDefault}
                className="mt-0.5 size-4 accent-emerald-700"
                type="checkbox"
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    saveHistoryByDefault: event.target.checked,
                  }))
                }
              />
              <span>
                <span className="block font-semibold text-zinc-900">
                  Save AI conversations locally by default
                </span>
                <span className="mt-0.5 block text-zinc-500">
                  Each outgoing request can override this setting before it is sent.
                </span>
              </span>
            </label>

            <div className="flex justify-end">
              <button
                className="command-button"
                disabled={isLoading || isSavingSettings}
                type="submit"
              >
                <Save aria-hidden="true" className="size-4" />
                {isSavingSettings ? 'Saving...' : 'Save provider settings'}
              </button>
            </div>
          </form>
        </section>

        <section className="flex items-start gap-3 border-l-2 border-emerald-600 bg-emerald-50 px-5 py-4 text-emerald-950">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold">Selected-text mode</h2>
            <p className="mt-1 text-sm text-emerald-800">
              PaperMind previews every outgoing range and never uploads a complete PDF in this
              phase.
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}
