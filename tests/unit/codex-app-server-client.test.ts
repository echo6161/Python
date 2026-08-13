// @vitest-environment node

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CodexAppServerClient,
  sanitizedCodexEnvironment,
  type CodexAppServerTransport,
  type CodexRpcMessage,
} from '../../src/main/ai/codex-app-server-client';
import { normalizeCodexProxyUrl } from '../../src/main/ai/codex-proxy-policy';
import {
  PAPERMINDS_READ_ONLY_PERMISSION_PROFILE,
  installCodexPermissionProfile,
  renderCodexPermissionProfile,
} from '../../src/main/ai/codex-permission-profile';

class FakeTransport implements CodexAppServerTransport {
  public readonly sent: CodexRpcMessage[] = [];
  private onMessage: ((message: CodexRpcMessage) => void) | null = null;

  public constructor(
    private readonly respond: (
      message: CodexRpcMessage,
      emit: (message: CodexRpcMessage) => void,
    ) => void,
  ) {}

  public start(onMessage: (message: CodexRpcMessage) => void): void {
    this.onMessage = onMessage;
  }

  public send(message: CodexRpcMessage): void {
    this.sent.push(message);
    this.respond(message, (response) => queueMicrotask(() => this.onMessage?.(response)));
  }

  public close(): void {
    this.onMessage = null;
  }
}

const baseOptions = { codexHome: 'isolated-home', workingDirectory: 'empty-workspace' };

function respondConnected(message: CodexRpcMessage, emit: (value: CodexRpcMessage) => void) {
  if (typeof message.id !== 'number' || typeof message.method !== 'string') return;
  const results: Record<string, unknown> = {
    initialize: { userAgent: 'codex/0.147.0' },
    'account/read': { account: { type: 'chatgpt', planType: 'plus' } },
    'model/list': {
      data: [{ id: 'gpt-5.6-sol', displayName: 'GPT-5.6-Sol', isDefault: true }],
      nextCursor: null,
    },
    'account/logout': {},
  };
  emit({ id: message.id, result: results[message.method] ?? {} });
}

describe('CodexAppServerClient', () => {
  it('accepts only credential-free loopback HTTP proxy URLs', () => {
    expect(normalizeCodexProxyUrl(' http://127.0.0.1:7897/ ')).toBe('http://127.0.0.1:7897');
    expect(normalizeCodexProxyUrl('http://[::1]:7897')).toBe('http://[::1]:7897');
    expect(normalizeCodexProxyUrl(null)).toBeNull();
    for (const value of [
      'https://127.0.0.1:7897',
      'http://localhost:7897',
      'http://192.168.1.2:7897',
      'http://user:secret@127.0.0.1:7897',
      'http://127.0.0.1:7897/path',
      'http://127.0.0.1',
    ]) {
      expect(() => normalizeCodexProxyUrl(value)).toThrow('Codex proxy must be');
    }
  });

  it('injects only a validated proxy into the otherwise sanitized child environment', () => {
    const environment = sanitizedCodexEnvironment('isolated-home', 'http://127.0.0.1:7897');
    expect(environment).toMatchObject({
      CODEX_HOME: 'isolated-home',
      HTTP_PROXY: 'http://127.0.0.1:7897',
      HTTPS_PROXY: 'http://127.0.0.1:7897',
    });
    expect(environment).not.toHaveProperty('OPENAI_API_KEY');
  });
  it('renders a dedicated profile that denies broad reads and limits network to Codex', () => {
    const workingDirectory = path.resolve('fixtures', 'PaperMind Data', 'empty-workspace');
    const config = renderCodexPermissionProfile(workingDirectory);
    expect(config).toContain(`default_permissions = "${PAPERMINDS_READ_ONLY_PERMISSION_PROFILE}"`);
    expect(config).toContain(`${JSON.stringify(workingDirectory.replaceAll('\\', '/'))} = true`);
    expect(config).toContain('":root" = "deny"');
    expect(config).toContain('":minimal" = "read"');
    expect(config).toContain('":tmpdir" = "deny"');
    expect(config).toContain('":slash_tmp" = "deny"');
    expect(config).toContain('"." = "read"');
    expect(config).toContain('enabled = true');
    expect(config).toContain('allow_local_binding = false');
    expect(config).toContain('allow_upstream_proxy = true');
    expect(config).toContain('"chatgpt.com" = "allow"');
    expect(config).not.toContain('"*" = "allow"');
    expect(config).not.toContain('= "write"');
  });

  it('installs the profile in the isolated Codex home and can refresh it atomically', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'papermind-codex-profile-'));
    const codexHome = path.join(root, 'home');
    const workingDirectory = path.join(root, 'work');
    try {
      await installCodexPermissionProfile(codexHome, workingDirectory);
      await installCodexPermissionProfile(codexHome, workingDirectory);
      const config = await readFile(path.join(codexHome, 'config.toml'), 'utf8');
      expect(config).toBe(renderCodexPermissionProfile(workingDirectory));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('maps official account and model responses without exposing account identity', async () => {
    const transport = new FakeTransport(respondConnected);
    const client = new CodexAppServerClient({
      ...baseOptions,
      transport,
      runtimeVersion: '0.147.0',
    });
    await expect(client.getConnectionStatus()).resolves.toMatchObject({
      id: 'codex',
      status: 'connected',
      configured: true,
      plan: 'plus',
      models: [{ id: 'gpt-5.6-sol', displayName: 'GPT-5.6-Sol', isDefault: true }],
    });
    expect(JSON.stringify(transport.sent)).not.toContain('email');
    await client.close();
  });

  it('reports an offline timeout instead of waiting indefinitely', async () => {
    const transport = new FakeTransport((message, emit) => {
      if (message.method === 'initialize') emit({ id: message.id, result: {} });
    });
    const client = new CodexAppServerClient({ ...baseOptions, transport, requestTimeoutMs: 5 });
    await expect(client.getConnectionStatus()).resolves.toMatchObject({
      status: 'offline',
      available: false,
      configured: false,
    });
    await client.close();
  });

  it('reports a signed-out runtime without requiring model discovery', async () => {
    const transport = new FakeTransport((message, emit) => {
      if (typeof message.id !== 'number') return;
      emit({
        id: message.id,
        result: message.method === 'account/read' ? { account: null } : {},
      });
    });
    const client = new CodexAppServerClient({ ...baseOptions, transport });
    await expect(client.getConnectionStatus()).resolves.toMatchObject({
      status: 'not_configured',
      available: true,
      configured: false,
      models: [],
    });
    expect(transport.sent.some(({ method }) => method === 'model/list')).toBe(false);
    await client.close();
  });

  it('maps an invalid control-plane payload to a recoverable error state', async () => {
    const transport = new FakeTransport((message, emit) => {
      if (typeof message.id !== 'number') return;
      emit({ id: message.id, result: {} });
    });
    const client = new CodexAppServerClient({ ...baseOptions, transport });
    await expect(client.getConnectionStatus()).resolves.toMatchObject({
      status: 'error',
      available: true,
      configured: false,
      lastError: 'The Codex account response was invalid.',
    });
    await client.close();
  });

  it('accepts only the documented ChatGPT login destination', async () => {
    const transport = new FakeTransport((message, emit) => {
      if (typeof message.id !== 'number') return;
      emit({
        id: message.id,
        result:
          message.method === 'account/login/start'
            ? {
                type: 'chatgpt',
                loginId: 'codex-login-opaque-01',
                authUrl: 'https://evil.example/login',
              }
            : {},
      });
    });
    const client = new CodexAppServerClient({ ...baseOptions, transport });
    await expect(client.startLogin()).rejects.toThrow('unexpected login destination');
    await client.close();
  });

  it.each([
    'https://auth.openai.com.evil.example/oauth/authorize',
    'https://user:password@auth.openai.com/oauth/authorize',
    'https://auth.openai.com:8443/oauth/authorize',
    'http://auth.openai.com/oauth/authorize',
  ])('rejects a deceptive or weakened login destination: %s', async (authUrl) => {
    const transport = new FakeTransport((message, emit) => {
      if (typeof message.id !== 'number') return;
      emit({
        id: message.id,
        result:
          message.method === 'account/login/start'
            ? { type: 'chatgpt', loginId: 'codex-login-opaque-security', authUrl }
            : {},
      });
    });
    const client = new CodexAppServerClient({ ...baseOptions, transport });
    await expect(client.startLogin()).rejects.toThrow('unexpected login destination');
    await client.close();
  });

  it('runs the documented login cancellation and logout lifecycle', async () => {
    let signedIn = false;
    const transport = new FakeTransport((message, emit) => {
      if (typeof message.id !== 'number') return;
      if (message.method === 'account/login/start') {
        emit({
          id: message.id,
          result: {
            type: 'chatgpt',
            loginId: 'codex-login-opaque-02',
            authUrl: 'https://auth.openai.com/oauth/authorize?client_id=test-fixture',
          },
        });
        return;
      }
      if (message.method === 'account/logout') signedIn = false;
      const result =
        message.method === 'account/read'
          ? { account: signedIn ? { type: 'chatgpt', planType: 'plus' } : null }
          : message.method === 'model/list'
            ? { data: [] }
            : {};
      emit({ id: message.id, result });
    });
    const client = new CodexAppServerClient({ ...baseOptions, transport });
    const login = await client.startLogin();
    await client.cancelLogin(login.loginId);
    await expect(client.getConnectionStatus()).resolves.toMatchObject({
      status: 'login_cancelled',
      configured: false,
    });
    signedIn = true;
    await client.logout();
    await expect(client.getConnectionStatus()).resolves.toMatchObject({
      status: 'not_configured',
      configured: false,
    });
    expect(transport.sent.map(({ method }) => method)).toEqual(
      expect.arrayContaining(['account/login/start', 'account/login/cancel', 'account/logout']),
    );
    await client.close();
  });

  it('preserves a bounded login failure reason for the connection UI', async () => {
    const transport = new FakeTransport((message, emit) => {
      if (typeof message.id !== 'number') return;
      if (message.method === 'account/login/start') {
        emit({
          id: message.id,
          result: {
            type: 'chatgpt',
            loginId: 'opaque-login-id-not-a-uuid',
            authUrl: 'https://auth.openai.com/oauth/authorize?client_id=test-fixture',
          },
        });
        emit({
          method: 'account/login/completed',
          params: { success: false, error: 'The browser authorization expired.' },
        });
        return;
      }
      emit({
        id: message.id,
        result: message.method === 'account/read' ? { account: null } : {},
      });
    });
    const client = new CodexAppServerClient({ ...baseOptions, transport });
    await expect(client.startLogin()).resolves.toMatchObject({
      loginId: 'opaque-login-id-not-a-uuid',
    });
    await expect(client.getConnectionStatus()).resolves.toMatchObject({
      status: 'login_cancelled',
      lastError: 'The browser authorization expired.',
    });
    await client.close();
  });

  it('streams a text-only turn through the isolated PaperMind permission profile', async () => {
    const transport = new FakeTransport((message, emit) => {
      if (typeof message.id !== 'number' || typeof message.method !== 'string') return;
      if (message.method === 'initialize') return emit({ id: message.id, result: {} });
      if (message.method === 'permissionProfile/list') {
        return emit({
          id: message.id,
          result: {
            data: [{ id: PAPERMINDS_READ_ONLY_PERMISSION_PROFILE, allowed: true }],
            nextCursor: null,
          },
        });
      }
      if (message.method === 'thread/start') {
        return emit({ id: message.id, result: { thread: { id: 'thread-1' } } });
      }
      if (message.method === 'turn/start') {
        emit({ id: message.id, result: { turn: { id: 'turn-1', status: 'inProgress' } } });
        emit({ method: 'turn/started', params: { threadId: 'thread-1', turn: { id: 'turn-1' } } });
        emit({
          method: 'item/agentMessage/delta',
          params: { threadId: 'thread-1', delta: 'Answer' },
        });
        emit({
          method: 'turn/completed',
          params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } },
        });
        return;
      }
      emit({ id: message.id, result: {} });
    });
    const client = new CodexAppServerClient({ ...baseOptions, transport });
    const deltas: string[] = [];
    await expect(
      client.runTurn('Bounded context', 'gpt-5.6-sol', new AbortController().signal, {
        onDelta: (delta) => deltas.push(delta),
        onUnsafeActivity: () => undefined,
      }),
    ).resolves.toMatchObject({ requestId: 'turn-1' });
    expect(deltas).toEqual(['Answer']);
    const initialize = transport.sent.find(({ method }) => method === 'initialize');
    expect(initialize?.params).toMatchObject({ capabilities: { experimentalApi: true } });
    const profileList = transport.sent.find(({ method }) => method === 'permissionProfile/list');
    expect(profileList?.params).toEqual({ cwd: 'empty-workspace', limit: 100 });
    const threadStart = transport.sent.find(({ method }) => method === 'thread/start');
    expect(threadStart?.params).toMatchObject({
      cwd: 'empty-workspace',
      approvalPolicy: 'never',
      permissions: PAPERMINDS_READ_ONLY_PERMISSION_PROFILE,
      ephemeral: true,
    });
    expect(threadStart?.params).not.toHaveProperty('sandboxPolicy');
    const turnStart = transport.sent.find(({ method }) => method === 'turn/start');
    expect(turnStart?.params).not.toHaveProperty('sandboxPolicy');
    expect(turnStart?.params).not.toHaveProperty('permissions');
    expect(transport.sent.some(({ method }) => method === 'command/exec')).toBe(false);
    await client.close();
  });

  it('fails closed when the required read-only permission profile is unavailable', async () => {
    const transport = new FakeTransport((message, emit) => {
      if (typeof message.id !== 'number' || typeof message.method !== 'string') return;
      const result =
        message.method === 'permissionProfile/list'
          ? {
              data: [{ id: PAPERMINDS_READ_ONLY_PERMISSION_PROFILE, allowed: false }],
              nextCursor: null,
            }
          : {};
      emit({ id: message.id, result });
    });
    const client = new CodexAppServerClient({ ...baseOptions, transport });
    await expect(
      client.runTurn('Bounded context', 'gpt-5.6-sol', new AbortController().signal, {
        onDelta: () => undefined,
        onUnsafeActivity: () => undefined,
      }),
    ).rejects.toThrow('PaperMind Codex permission profile is not allowed');
    expect(transport.sent.some(({ method }) => method === 'thread/start')).toBe(false);
    await client.close();
  });

  it('interrupts and rejects a turn when Codex starts any tool activity', async () => {
    let unsafe = '';
    const transport = new FakeTransport((message, emit) => {
      if (typeof message.id !== 'number' || typeof message.method !== 'string') return;
      if (message.method === 'initialize') return emit({ id: message.id, result: {} });
      if (message.method === 'permissionProfile/list') {
        return emit({
          id: message.id,
          result: {
            data: [{ id: PAPERMINDS_READ_ONLY_PERMISSION_PROFILE, allowed: true }],
            nextCursor: null,
          },
        });
      }
      if (message.method === 'thread/start')
        return emit({ id: message.id, result: { thread: { id: 'thread-2' } } });
      if (message.method === 'turn/start') {
        emit({ id: message.id, result: { turn: { id: 'turn-2' } } });
        emit({ method: 'turn/started', params: { threadId: 'thread-2', turn: { id: 'turn-2' } } });
        emit({
          method: 'item/started',
          params: { threadId: 'thread-2', item: { type: 'commandExecution' } },
        });
        return;
      }
      emit({ id: message.id, result: {} });
    });
    const client = new CodexAppServerClient({ ...baseOptions, transport });
    await expect(
      client.runTurn('Do not use tools', 'gpt-5.6-sol', new AbortController().signal, {
        onDelta: () => undefined,
        onUnsafeActivity: (kind) => {
          unsafe = kind;
        },
      }),
    ).rejects.toThrow('unavailable tool');
    expect(unsafe).toBe('commandExecution');
    expect(transport.sent.some(({ method }) => method === 'turn/interrupt')).toBe(true);
    await client.close();
  });
});
