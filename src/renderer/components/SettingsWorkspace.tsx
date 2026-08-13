import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleOff,
  CloudCog,
  KeyRound,
  LoaderCircle,
  LogIn,
  LogOut,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  WifiOff,
} from 'lucide-react';

import type {
  AiCapabilities,
  AiProviderConnection,
  AiProviderId,
  AiProviderSettings,
} from '../../shared/contracts/ai';

const DEFAULT_SETTINGS: AiProviderSettings = {
  providerId: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  codexProxyUrl: null,
  model: 'gpt-5.6',
  temperature: 0.2,
  maxOutputTokens: 2_000,
  saveHistoryByDefault: true,
};

const STATUS_LABELS = {
  connected: 'Connected',
  not_configured: 'Not connected',
  offline: 'Offline',
  expired: 'Session expired',
  version_mismatch: 'Version mismatch',
  login_pending: 'Waiting for browser sign-in',
  login_cancelled: 'Login cancelled',
  error: 'Connection error',
} as const;

export function SettingsWorkspace() {
  const [capabilities, setCapabilities] = useState<AiCapabilities | null>(null);
  const [settings, setSettings] = useState<AiProviderSettings>(DEFAULT_SETTINGS);
  const [inspectedProviderId, setInspectedProviderId] = useState<AiProviderId | null>(null);
  const [loginId, setLoginId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>('load');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const apiKeyRef = useRef<HTMLInputElement>(null);

  const adoptCapabilities = useCallback((value: AiCapabilities) => {
    setCapabilities(value);
    setSettings(value.settings);
    setInspectedProviderId((currentValue) =>
      currentValue && value.providers.some(({ id }) => id === currentValue)
        ? currentValue
        : value.providerId,
    );
    const codex = value.providers.find(({ id }) => id === 'codex');
    if (codex?.status !== 'login_pending') setLoginId(null);
  }, []);

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) setBusy('refresh');
      try {
        const result = await window.paperMind.ai.refreshProviders();
        if (!result.ok) throw new Error(result.error.message);
        adoptCapabilities(result.value);
        setError(null);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : 'Provider status could not be refreshed.',
        );
      } finally {
        if (!silent) setBusy(null);
      }
    },
    [adoptCapabilities],
  );

  useEffect(() => {
    let active = true;
    void window.paperMind.ai
      .getCapabilities()
      .then((result) => {
        if (!active) return;
        if (!result.ok) throw new Error(result.error.message);
        adoptCapabilities(result.value);
      })
      .catch((caught: unknown) => {
        if (active)
          setError(caught instanceof Error ? caught.message : 'Provider settings could not load.');
      })
      .finally(() => {
        if (active) setBusy(null);
      });
    return () => {
      active = false;
    };
  }, [adoptCapabilities]);

  useEffect(() => {
    if (!loginId) return;
    const timer = window.setInterval(() => void refresh(true), 2_000);
    return () => window.clearInterval(timer);
  }, [loginId, refresh]);

  const chooseProvider = async (providerId: AiProviderId) => {
    setBusy(`select-${providerId}`);
    setError(null);
    setNotice(null);
    try {
      const result = await window.paperMind.ai.selectProvider(providerId);
      if (!result.ok) throw new Error(result.error.message);
      adoptCapabilities(result.value);
      setInspectedProviderId(providerId);
      setNotice(`${providerName(result.value, providerId)} is now the current provider.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The provider could not be selected.');
    } finally {
      setBusy(null);
    }
  };

  const startCodexLogin = async () => {
    setBusy('login');
    setError(null);
    setNotice(null);
    try {
      const result = await window.paperMind.ai.startCodexLogin();
      if (!result.ok) throw new Error(result.error.message);
      setLoginId(result.value.loginId);
      setNotice('The official ChatGPT sign-in opened in your system browser.');
      await refresh(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ChatGPT sign-in could not start.');
    } finally {
      setBusy(null);
    }
  };

  const cancelCodexLogin = async () => {
    if (!loginId) return;
    setBusy('cancel-login');
    try {
      const result = await window.paperMind.ai.cancelCodexLogin(loginId);
      if (!result.ok) throw new Error(result.error.message);
      adoptCapabilities(result.value);
      setNotice('ChatGPT sign-in was cancelled.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Login could not be cancelled.');
    } finally {
      setBusy(null);
    }
  };

  const logoutCodex = async () => {
    if (!window.confirm('Sign PaperMind out of its isolated Codex profile?')) return;
    setBusy('logout');
    try {
      const result = await window.paperMind.ai.logoutCodex();
      if (!result.ok) throw new Error(result.error.message);
      adoptCapabilities(result.value);
      setNotice('PaperMind signed out of ChatGPT.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ChatGPT sign-out failed.');
    } finally {
      setBusy(null);
    }
  };

  const saveApiKey = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const apiKey = apiKeyRef.current?.value.trim() ?? '';
    if (apiKeyRef.current) apiKeyRef.current.value = '';
    if (!apiKey) return setError('Enter an API key.');
    setBusy('key');
    try {
      const result = await window.paperMind.ai.setApiKey(apiKey);
      if (!result.ok) throw new Error(result.error.message);
      await refresh(true);
      setNotice(
        result.value.persistence === 'secure'
          ? 'API key stored with the operating system credential backend.'
          : 'API key is available for this PaperMind session only.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The API key could not be stored.');
    } finally {
      setBusy(null);
    }
  };

  const deleteApiKey = async () => {
    if (!window.confirm('Remove the configured OpenAI API key?')) return;
    setBusy('key');
    try {
      const result = await window.paperMind.ai.deleteApiKey();
      if (!result.ok) throw new Error(result.error.message);
      await refresh(true);
      setNotice('OpenAI API key removed.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The API key could not be removed.');
    } finally {
      setBusy(null);
    }
  };

  const saveSettings = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    if (settings.providerId === 'openai') {
      try {
        if (new URL(settings.baseUrl).protocol !== 'https:') throw new Error();
      } catch {
        return setError('OpenAI Base URL must be a valid HTTPS URL.');
      }
    }
    setBusy('settings');
    try {
      const result = await window.paperMind.ai.updateSettings({
        ...settings,
        baseUrl: settings.baseUrl.replace(/\/+$/u, ''),
        codexProxyUrl: settings.codexProxyUrl?.trim() ?? null,
        model: settings.model.trim(),
        maxOutputTokens: Math.trunc(settings.maxOutputTokens),
      });
      if (!result.ok) throw new Error(result.error.message);
      adoptCapabilities(result.value);
      setNotice('Current provider settings saved.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Provider settings could not be saved.');
    } finally {
      setBusy(null);
    }
  };

  const current = capabilities?.providers.find(({ id }) => id === capabilities.providerId);
  const codex = capabilities?.providers.find(({ id }) => id === 'codex');
  const effectiveInspectedProviderId = inspectedProviderId ?? capabilities?.providerId ?? 'openai';
  const inspected = capabilities?.providers.find(({ id }) => id === effectiveInspectedProviderId);

  return (
    <section className="min-w-0 flex-1 overflow-auto bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-5 py-4 lg:px-7">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-zinc-950">AI providers</h1>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              Current: {current?.name ?? 'Loading'} · selection-scoped by default
            </p>
          </div>
          <button
            aria-label="Refresh provider status"
            className="icon-button"
            disabled={busy !== null}
            title="Refresh status"
            type="button"
            onClick={() => void refresh()}
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${busy === 'refresh' ? 'animate-spin' : ''}`}
            />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 lg:px-7">
        {error || notice ? (
          <div
            className={`flex items-center gap-2 border-l-2 px-3 py-2 text-xs ${error ? 'border-red-700 bg-red-50 text-red-800' : 'border-emerald-700 bg-emerald-50 text-emerald-900'}`}
            role={error ? 'alert' : 'status'}
          >
            {error ? (
              <AlertTriangle className="size-4 shrink-0" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0" />
            )}
            <span className="min-w-0 flex-1">{error ?? notice}</span>
          </div>
        ) : null}

        <section
          aria-labelledby="provider-status-heading"
          className="border border-zinc-200 bg-white"
        >
          <header className="grid gap-3 border-b border-zinc-200 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase text-zinc-500">Current provider</p>
              <h2
                id="provider-status-heading"
                className="mt-1 flex items-center gap-2 text-base font-semibold text-zinc-950"
              >
                {current?.name ?? 'Checking providers'}
                {current ? <ProviderStatus connection={current} /> : null}
              </h2>
            </div>
            <div className="text-left text-[11px] leading-5 text-zinc-500 sm:text-right">
              <strong className="block font-semibold text-emerald-800">
                Official integration supported
              </strong>
              Codex App Server · checked {capabilities?.gate.checkedAt ?? '2026-08-12'}
            </div>
          </header>

          <div className="grid divide-y divide-zinc-200 md:grid-cols-2 md:divide-x md:divide-y-0">
            {(capabilities?.providers ?? []).map((provider) => (
              <ProviderRow
                active={capabilities?.providerId === provider.id}
                busy={busy !== null}
                connection={provider}
                key={provider.id}
                inspected={effectiveInspectedProviderId === provider.id}
                onInspect={() => setInspectedProviderId(provider.id)}
                onSelect={() => void chooseProvider(provider.id)}
              />
            ))}
          </div>
        </section>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section aria-labelledby="connection-heading" className="border border-zinc-200 bg-white">
            <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h2 id="connection-heading" className="text-sm font-semibold text-zinc-900">
                  {effectiveInspectedProviderId === 'codex'
                    ? 'ChatGPT account connection'
                    : 'OpenAI API connection'}
                </h2>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {effectiveInspectedProviderId === 'codex'
                    ? 'Official Codex browser sign-in; no API key required.'
                    : 'Platform API access is billed separately from ChatGPT subscriptions.'}
                </p>
              </div>
              <CloudCog aria-hidden="true" className="size-4 text-zinc-400" />
            </header>

            {effectiveInspectedProviderId === 'codex' ? (
              <div className="space-y-3 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <ProviderStatus connection={codex ?? null} />
                    <p className="mt-1 text-xs text-zinc-500">
                      {codex?.plan ? `Plan: ${codex.plan} · ` : ''}Runtime{' '}
                      {codex?.version ?? 'unavailable'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {codex?.status === 'login_pending' && loginId ? (
                      <button
                        className="command-button"
                        disabled={busy !== null}
                        type="button"
                        onClick={() => void cancelCodexLogin()}
                      >
                        <CircleOff className="size-4" /> Cancel login
                      </button>
                    ) : codex?.configured ? (
                      <button
                        className="command-button-secondary"
                        disabled={busy !== null}
                        type="button"
                        onClick={() => void logoutCodex()}
                      >
                        <LogOut className="size-4" /> Sign out
                      </button>
                    ) : (
                      <button
                        className="command-button"
                        disabled={!codex?.available || busy !== null}
                        type="button"
                        onClick={() => void startCodexLogin()}
                      >
                        <LogIn className="size-4" /> Sign in with ChatGPT
                      </button>
                    )}
                  </div>
                </div>
                {codex?.lastError ? (
                  <p
                    className="border-l-2 border-red-700 bg-red-50 px-3 py-2 text-xs text-red-800"
                    role="alert"
                  >
                    {codex.lastError}
                  </p>
                ) : null}
                <p className="text-xs leading-5 text-zinc-600">
                  PaperMind uses an isolated Codex profile and system keyring. It never reads
                  browser cookies, ChatGPT web storage, or another Codex profile.
                </p>
              </div>
            ) : (
              <form className="space-y-3 px-4 py-4" onSubmit={(event) => void saveApiKey(event)}>
                <div className="flex flex-wrap items-end gap-2">
                  <label
                    className="min-w-52 flex-1 text-xs font-semibold text-zinc-700"
                    htmlFor="openai-api-key"
                  >
                    API Key
                    <input
                      ref={apiKeyRef}
                      autoComplete="new-password"
                      className="mt-1 h-9 w-full rounded border border-zinc-300 px-3 font-normal outline-none focus:border-emerald-700"
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
                  </label>
                  <button className="command-button" disabled={busy !== null} type="submit">
                    <KeyRound className="size-4" /> Store key
                  </button>
                  {capabilities?.credential.configured ? (
                    <button
                      aria-label="Remove API key"
                      className="icon-button hover:text-red-700"
                      disabled={busy !== null}
                      title="Remove API key"
                      type="button"
                      onClick={() => void deleteApiKey()}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </div>
                <p className="text-[11px] text-zinc-500">
                  {credentialLabel(capabilities)} · backend{' '}
                  {capabilities?.credential.backend ?? 'checking'} · saved values are never
                  displayed again
                </p>
              </form>
            )}

            {effectiveInspectedProviderId === capabilities?.providerId ? (
              <form
                className="grid gap-3 border-t border-zinc-200 px-4 py-4 sm:grid-cols-2"
                onSubmit={(event) => void saveSettings(event)}
              >
                {effectiveInspectedProviderId === 'openai' ? (
                  <label className="text-xs font-semibold text-zinc-700" htmlFor="ai-base-url">
                    Base URL
                    <input
                      className="mt-1 h-9 w-full rounded border border-zinc-300 px-3 font-normal outline-none focus:border-emerald-700"
                      id="ai-base-url"
                      required
                      type="url"
                      value={settings.baseUrl}
                      onChange={(event) =>
                        setSettings((currentValue) => ({
                          ...currentValue,
                          baseUrl: event.target.value,
                        }))
                      }
                    />
                  </label>
                ) : null}
                <label className="text-xs font-semibold text-zinc-700" htmlFor="ai-model">
                  Model
                  {effectiveInspectedProviderId === 'codex' && codex?.models.length ? (
                    <select
                      className="mt-1 h-9 w-full rounded border border-zinc-300 px-3 font-normal outline-none focus:border-emerald-700"
                      id="ai-model"
                      value={settings.model}
                      onChange={(event) =>
                        setSettings((currentValue) => ({
                          ...currentValue,
                          model: event.target.value,
                        }))
                      }
                    >
                      {codex.models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.displayName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="mt-1 h-9 w-full rounded border border-zinc-300 px-3 font-normal outline-none focus:border-emerald-700"
                      id="ai-model"
                      required
                      value={settings.model}
                      onChange={(event) =>
                        setSettings((currentValue) => ({
                          ...currentValue,
                          model: event.target.value,
                        }))
                      }
                    />
                  )}
                </label>
                {effectiveInspectedProviderId === 'codex' ? (
                  <label className="text-xs font-semibold text-zinc-700" htmlFor="codex-proxy-url">
                    Local proxy (optional)
                    <input
                      className="mt-1 h-9 w-full rounded border border-zinc-300 px-3 font-normal outline-none focus:border-emerald-700"
                      id="codex-proxy-url"
                      maxLength={200}
                      placeholder="http://127.0.0.1:7897"
                      spellCheck={false}
                      type="url"
                      value={settings.codexProxyUrl ?? ''}
                      onChange={(event) =>
                        setSettings((currentValue) => ({
                          ...currentValue,
                          codexProxyUrl: event.target.value || null,
                        }))
                      }
                    />
                    <span className="mt-1 block font-normal text-zinc-500">
                      Only an HTTP proxy on this computer is accepted. Credentials are rejected.
                    </span>
                  </label>
                ) : null}
                {effectiveInspectedProviderId === 'openai' ? (
                  <label className="text-xs font-semibold text-zinc-700" htmlFor="ai-max-output">
                    Local output limit
                    <input
                      className="mt-1 h-9 w-full rounded border border-zinc-300 px-3 font-normal outline-none focus:border-emerald-700"
                      id="ai-max-output"
                      max={128_000}
                      min={64}
                      required
                      type="number"
                      value={settings.maxOutputTokens}
                      onChange={(event) =>
                        setSettings((currentValue) => ({
                          ...currentValue,
                          maxOutputTokens: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                ) : null}
                <label className="flex items-center gap-2 self-end text-xs text-zinc-700">
                  <input
                    checked={settings.saveHistoryByDefault}
                    className="size-4 accent-emerald-700"
                    type="checkbox"
                    onChange={(event) =>
                      setSettings((currentValue) => ({
                        ...currentValue,
                        saveHistoryByDefault: event.target.checked,
                      }))
                    }
                  />
                  Save conversations locally by default
                </label>
                <div className="flex justify-end sm:col-span-2">
                  <button className="command-button" disabled={busy !== null} type="submit">
                    <Save className="size-4" /> Save settings
                  </button>
                </div>
              </form>
            ) : (
              <p className="border-t border-zinc-200 px-4 py-3 text-xs text-zinc-500">
                Connect this provider, then choose Use before editing its generation settings.
              </p>
            )}
          </section>

          <aside className="space-y-3">
            <section className="border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-800" />
                <div>
                  <h2 className="text-xs font-semibold text-emerald-950">
                    Read-only research boundary
                  </h2>
                  <p className="mt-1 text-[11px] leading-5 text-emerald-900">
                    Only reviewed context is sent. Codex tools, shell, file changes, arbitrary
                    network and cross-Workspace data are disabled.
                  </p>
                </div>
              </div>
            </section>
            <details className="group border border-zinc-200 bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-semibold text-zinc-800">
                Capabilities and limits{' '}
                <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
              </summary>
              <div className="space-y-3 border-t border-zinc-200 px-4 py-3 text-[11px] leading-5 text-zinc-600">
                <DetailList label="Capabilities" values={inspected?.capabilities ?? []} />
                <DetailList label="Limits" values={inspected?.limitations ?? []} />
                {effectiveInspectedProviderId === 'codex' ? (
                  <p>
                    Temperature and maximum output tokens are not exposed by the official Codex
                    adapter. PaperMind still enforces its bounded response storage ceiling.
                  </p>
                ) : null}
              </div>
            </details>
          </aside>
        </div>
      </div>
    </section>
  );
}

function ProviderRow({
  connection,
  active,
  inspected,
  busy,
  onInspect,
  onSelect,
}: {
  readonly connection: AiProviderConnection;
  readonly active: boolean;
  readonly inspected: boolean;
  readonly busy: boolean;
  readonly onInspect: () => void;
  readonly onSelect: () => void;
}) {
  const action = active
    ? 'Current'
    : connection.configured
      ? 'Use'
      : inspected
        ? 'Viewing'
        : 'Configure';
  return (
    <article
      className={`flex min-w-0 items-center gap-3 px-4 py-3 ${active ? 'bg-emerald-50/60' : inspected ? 'bg-zinc-50' : ''}`}
    >
      <ProviderIcon connection={connection} />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-zinc-900">{connection.name}</h3>
        <ProviderStatus connection={connection} />
      </div>
      <button
        className={active || inspected ? 'command-button-secondary' : 'command-button'}
        disabled={active || busy || !connection.available || (inspected && !connection.configured)}
        type="button"
        onClick={connection.configured ? onSelect : onInspect}
      >
        {action}
      </button>
    </article>
  );
}

function ProviderStatus({ connection }: { readonly connection: AiProviderConnection | null }) {
  if (!connection) return <span className="text-xs text-zinc-500">Unavailable</span>;
  const Icon =
    connection.status === 'connected'
      ? CheckCircle2
      : connection.status === 'login_pending'
        ? LoaderCircle
        : connection.status === 'offline'
          ? WifiOff
          : AlertTriangle;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${connection.status === 'connected' ? 'text-emerald-800' : connection.status === 'not_configured' ? 'text-zinc-600' : 'text-amber-800'}`}
      data-testid={`provider-status-${connection.id}`}
    >
      <Icon
        aria-hidden="true"
        className={`size-3.5 ${connection.status === 'login_pending' ? 'animate-spin' : ''}`}
      />
      {STATUS_LABELS[connection.status]}
    </span>
  );
}

function ProviderIcon({ connection }: { readonly connection: AiProviderConnection }) {
  const Icon = connection.id === 'codex' ? CloudCog : KeyRound;
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded border border-zinc-200 bg-white">
      <Icon aria-hidden="true" className="size-4 text-zinc-600" />
    </span>
  );
}

function DetailList({
  label,
  values,
}: {
  readonly label: string;
  readonly values: readonly string[];
}) {
  return (
    <div>
      <strong className="text-zinc-800">{label}</strong>
      <ul className="mt-1 space-y-0.5">
        {values.map((value) => (
          <li className="flex gap-1.5" key={value}>
            <span aria-hidden="true">-</span>
            <span>{value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function credentialLabel(capabilities: AiCapabilities | null): string {
  if (!capabilities?.credential.configured) return 'Not configured';
  if (capabilities.credential.persistence === 'secure') return 'Stored securely';
  if (capabilities.credential.persistence === 'session_only') return 'Session only';
  return 'Credential backend unavailable';
}

function providerName(capabilities: AiCapabilities, id: AiProviderId): string {
  return capabilities.providers.find((provider) => provider.id === id)?.name ?? id;
}
