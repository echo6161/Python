import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import readline from 'node:readline';

import type { AiProviderConnection, AiProviderModel } from '../../shared/contracts/ai';
import {
  installCodexPermissionProfile,
  PAPERMINDS_READ_ONLY_PERMISSION_PROFILE,
} from './codex-permission-profile';
import { normalizeCodexProxyUrl } from './codex-proxy-policy';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_PERMISSION_PROFILE_PAGES = 5;
const nodeRequire = createRequire(__filename);

export type CodexRpcMessage = Record<string, unknown>;
type JsonObject = CodexRpcMessage;
type NotificationListener = (method: string, params: JsonObject) => void;

export interface CodexAppServerTransport {
  start(onMessage: (message: CodexRpcMessage) => void, onExit: (error: Error) => void): void;
  send(message: CodexRpcMessage): void;
  close(): void;
}

export interface CodexLoginStart {
  readonly loginId: string;
  readonly authUrl: string;
}

export interface CodexTurnCallbacks {
  readonly onDelta: (delta: string) => void;
  readonly onUnsafeActivity: (kind: string) => void;
}

export interface CodexTurnResult {
  readonly requestId: string;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
}

export interface CodexAppServerClientOptions {
  readonly codexHome: string;
  readonly workingDirectory: string;
  readonly runtimeVersion?: string;
  readonly executablePath?: string;
  readonly transport?: CodexAppServerTransport;
  readonly requestTimeoutMs?: number;
  readonly proxyUrl?: string | null;
}

export class CodexAppServerClient {
  private transport: CodexAppServerTransport | null = null;
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  private readonly listeners = new Set<NotificationListener>();
  private startup: Promise<void> | null = null;
  private lastError: string | null = null;
  private loginPending = false;
  private loginCancelled = false;
  private readOnlyPermissionProfile: string | null = null;
  private proxyUrl: string | null;

  public constructor(private readonly options: CodexAppServerClientOptions) {
    this.proxyUrl = normalizeCodexProxyUrl(options.proxyUrl);
  }

  public async configureProxy(proxyUrl: string | null | undefined): Promise<void> {
    const normalized = normalizeCodexProxyUrl(proxyUrl);
    if (normalized === this.proxyUrl) return;
    await this.close();
    this.proxyUrl = normalized;
  }

  public async getConnectionStatus(): Promise<AiProviderConnection> {
    try {
      await this.ensureStarted();
      const accountResult = asObject(await this.request('account/read', { refreshToken: false }));
      if (!accountResult || !Object.hasOwn(accountResult, 'account')) {
        throw new Error('The Codex account response was invalid.');
      }
      const account = asObject(accountResult.account);
      const connected = account?.type === 'chatgpt';
      const models = connected
        ? parseModels(await this.request('model/list', { limit: 100, includeHidden: false }))
        : [];
      const loginError = this.loginCancelled ? this.lastError : null;
      if (!this.loginCancelled) this.lastError = null;
      return {
        id: 'codex',
        name: 'ChatGPT account via Codex',
        status: this.loginPending
          ? 'login_pending'
          : this.loginCancelled
            ? 'login_cancelled'
            : connected
              ? 'connected'
              : 'not_configured',
        available: true,
        configured: connected,
        version: this.options.runtimeVersion ?? '0.147.0',
        plan: connected && typeof account.planType === 'string' ? account.planType : null,
        models,
        capabilities: ['Official ChatGPT sign-in', 'Streaming', 'Cancellation', 'Model discovery'],
        limitations: [
          'Text generation only; PaperMind exposes no Codex tools',
          'Runs in an isolated read-only directory with Codex network allowlisted',
          ...(this.proxyUrl ? ['Uses a user-configured loopback HTTP proxy'] : []),
        ],
        lastError: loginError,
      };
    } catch (error) {
      this.lastError = safeMessage(error);
      const status = classifyConnectionError(this.lastError);
      return {
        id: 'codex',
        name: 'ChatGPT account via Codex',
        status,
        available: status === 'expired' || status === 'error',
        configured: false,
        version: this.options.runtimeVersion ?? '0.147.0',
        plan: null,
        models: [],
        capabilities: ['Official ChatGPT sign-in', 'Streaming', 'Cancellation'],
        limitations: ['The bundled official Codex runtime could not be started'],
        lastError: this.lastError,
      };
    }
  }

  public async startLogin(): Promise<CodexLoginStart> {
    await this.ensureStarted();
    this.loginPending = true;
    this.loginCancelled = false;
    this.lastError = null;
    try {
      const result = asObject(
        await this.request('account/login/start', {
          type: 'chatgpt',
          useHostedLoginSuccessPage: true,
          appBrand: 'chatgpt',
        }),
      );
      if (
        result?.type !== 'chatgpt' ||
        !isOpaqueLoginId(result.loginId) ||
        typeof result.authUrl !== 'string'
      ) {
        throw new Error('The Codex login response was invalid.');
      }
      const url = new URL(result.authUrl);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'auth.openai.com' ||
        url.username !== '' ||
        url.password !== '' ||
        url.port !== ''
      ) {
        throw new Error('Codex returned an unexpected login destination.');
      }
      return { loginId: result.loginId, authUrl: result.authUrl };
    } catch (error) {
      this.loginPending = false;
      throw error;
    }
  }

  public async cancelLogin(loginId: string): Promise<void> {
    await this.request('account/login/cancel', { loginId });
    this.loginPending = false;
    this.loginCancelled = true;
    this.lastError = null;
  }

  public async logout(): Promise<void> {
    await this.ensureStarted();
    await this.request('account/logout');
    this.loginPending = false;
    this.loginCancelled = false;
  }

  public async runTurn(
    prompt: string,
    model: string,
    signal: AbortSignal,
    callbacks: CodexTurnCallbacks,
  ): Promise<CodexTurnResult> {
    await this.ensureStarted();
    const permissionProfile = await this.resolveReadOnlyPermissionProfile();
    const threadResult = asObject(
      await this.request('thread/start', {
        model,
        cwd: this.options.workingDirectory,
        approvalPolicy: 'never',
        permissions: permissionProfile,
        ephemeral: true,
        serviceName: 'papermind_research_chat',
      }),
    );
    const thread = asObject(threadResult?.thread);
    if (typeof thread?.id !== 'string') throw new Error('Codex did not create a thread.');
    const threadId = thread.id;
    let turnId: string | null = null;

    return new Promise<CodexTurnResult>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        this.listeners.delete(listener);
        signal.removeEventListener('abort', abort);
      };
      const finish = (result: CodexTurnResult | Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (result instanceof Error) reject(result);
        else resolve(result);
      };
      const abort = () => {
        if (turnId) {
          void this.request('turn/interrupt', { threadId, turnId }).catch(() => undefined);
        }
        finish(new Error('The Codex request was cancelled.'));
      };
      const listener: NotificationListener = (method, params) => {
        if (params.threadId !== threadId) return;
        if (method === 'turn/started') {
          const turn = asObject(params.turn);
          if (typeof turn?.id === 'string') turnId = turn.id;
          return;
        }
        if (method === 'item/agentMessage/delta' && typeof params.delta === 'string') {
          callbacks.onDelta(params.delta);
          return;
        }
        if (method === 'item/started') {
          const item = asObject(params.item);
          const type = typeof item?.type === 'string' ? item.type : '';
          if (isUnsafeItem(type)) {
            callbacks.onUnsafeActivity(type);
            if (turnId)
              void this.request('turn/interrupt', { threadId, turnId }).catch(() => undefined);
            finish(new Error('Codex attempted an unavailable tool.'));
          }
          return;
        }
        if (method === 'turn/completed') {
          const turn = asObject(params.turn);
          const status = turn?.status;
          if (status === 'completed') {
            finish({
              requestId: turnId ?? threadId,
              inputTokens: readUsage(turn, 'inputTokens'),
              outputTokens: readUsage(turn, 'outputTokens'),
            });
          } else if (status === 'interrupted') {
            finish(new Error('The Codex request was cancelled.'));
          } else {
            const error = asObject(turn?.error);
            finish(new Error(typeof error?.message === 'string' ? error.message : 'Codex failed.'));
          }
        }
      };
      this.listeners.add(listener);
      signal.addEventListener('abort', abort, { once: true });
      void this.request('turn/start', {
        threadId,
        input: [{ type: 'text', text: prompt }],
        model,
        cwd: this.options.workingDirectory,
        approvalPolicy: 'never',
      }).catch((error: unknown) =>
        finish(error instanceof Error ? error : new Error('Codex failed.')),
      );
    });
  }

  public close(): Promise<void> {
    this.transport?.close();
    this.transport = null;
    this.startup = null;
    this.readOnlyPermissionProfile = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('The Codex process stopped.'));
    }
    this.pending.clear();
    return Promise.resolve();
  }

  private ensureStarted(): Promise<void> {
    if (!this.startup) {
      this.startup = this.start();
      void this.startup.catch(() => {
        this.transport?.close();
        this.transport = null;
        this.startup = null;
      });
    }
    return this.startup;
  }

  private async start(): Promise<void> {
    if (!this.options.transport) {
      await installCodexPermissionProfile(this.options.codexHome, this.options.workingDirectory);
    }
    this.transport =
      this.options.transport ??
      new StdioCodexTransport(
        this.options.executablePath ?? resolveCodexExecutable(),
        this.options.workingDirectory,
        this.options.codexHome,
        this.proxyUrl,
      );
    this.transport.start(
      (message) => this.handleMessage(message),
      (error) => this.failAll(error),
    );
    await this.request('initialize', {
      clientInfo: { name: 'papermind', title: 'PaperMind', version: '0.15.0' },
      capabilities: { experimentalApi: true },
    });
    this.notify('initialized', {});
  }

  private async resolveReadOnlyPermissionProfile(): Promise<string> {
    if (this.readOnlyPermissionProfile) return this.readOnlyPermissionProfile;
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PERMISSION_PROFILE_PAGES; page += 1) {
      const result = asObject(
        await this.request('permissionProfile/list', {
          cwd: this.options.workingDirectory,
          limit: 100,
          ...(cursor ? { cursor } : {}),
        }),
      );
      if (!result || !Array.isArray(result.data)) {
        throw new Error('The Codex permission profile response was invalid.');
      }
      for (const entry of result.data) {
        const profile = asObject(entry);
        if (profile?.id !== PAPERMINDS_READ_ONLY_PERMISSION_PROFILE) continue;
        if (profile.allowed !== true) {
          throw new Error('The required PaperMind Codex permission profile is not allowed.');
        }
        this.readOnlyPermissionProfile = PAPERMINDS_READ_ONLY_PERMISSION_PROFILE;
        return PAPERMINDS_READ_ONLY_PERMISSION_PROFILE;
      }
      if (result.nextCursor === null || result.nextCursor === undefined) break;
      if (
        typeof result.nextCursor !== 'string' ||
        result.nextCursor.length < 1 ||
        result.nextCursor.length > 512
      ) {
        throw new Error('The Codex permission profile response was invalid.');
      }
      cursor = result.nextCursor;
    }
    throw new Error('Codex runtime version mismatch: PaperMind permission profile unavailable.');
  }

  private request(method: string, params?: JsonObject): Promise<unknown> {
    if (!this.transport) return Promise.reject(new Error('Codex is offline.'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex ${method} timed out.`));
      }, this.options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.transport?.send({ method, id, params });
    });
  }

  private notify(method: string, params: JsonObject): void {
    this.transport?.send({ method, params });
  }

  private handleMessage(message: JsonObject): void {
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id);
      if (pending && ('result' in message || 'error' in message)) {
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        const error = asObject(message.error);
        if (error)
          pending.reject(
            new Error(typeof error.message === 'string' ? error.message : 'Codex failed.'),
          );
        else pending.resolve(message.result);
        return;
      }
      if (typeof message.method === 'string') {
        this.notifyResponse(message.id, message.method);
      }
      return;
    }
    if (typeof message.method === 'string') {
      const params = asObject(message.params) ?? {};
      if (message.method === 'account/login/completed') {
        this.loginPending = false;
        this.loginCancelled = params.success === false;
        this.lastError = params.success === false ? safeLoginError(params.error) : null;
      }
      for (const listener of this.listeners) listener(message.method, params);
    }
  }

  private notifyResponse(id: number, method: string): void {
    this.transport?.send({
      id,
      error: { code: -32601, message: `${method} is disabled by PaperMind.` },
    });
  }

  private failAll(error: Error): void {
    this.transport = null;
    this.startup = null;
    this.readOnlyPermissionProfile = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

class StdioCodexTransport implements CodexAppServerTransport {
  private process: ChildProcessWithoutNullStreams | null = null;
  private lines: readline.Interface | null = null;

  public constructor(
    private readonly executable: string,
    private readonly workingDirectory: string,
    private readonly codexHome: string,
    private readonly proxyUrl: string | null,
  ) {}

  public start(
    onMessage: (message: CodexRpcMessage) => void,
    onExit: (error: Error) => void,
  ): void {
    const child = spawn(
      this.executable,
      [
        'app-server',
        '--stdio',
        '--strict-config',
        '-c',
        'cli_auth_credentials_store="keyring"',
        '-c',
        'check_for_update_on_startup=false',
        '-c',
        'history.persistence="none"',
        '-c',
        'analytics.enabled=false',
        '-c',
        'agents.enabled=false',
        '-c',
        'mcp_servers={}',
        '-c',
        'web_search="disabled"',
      ],
      {
        cwd: this.workingDirectory,
        env: sanitizedCodexEnvironment(this.codexHome, this.proxyUrl),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    this.process = child;
    child.once('error', onExit);
    child.once('exit', () => onExit(new Error('The Codex process stopped.')));
    child.stderr.resume();
    this.lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    this.lines.on('line', (line) => {
      try {
        const message = JSON.parse(line) as unknown;
        if (message && typeof message === 'object' && !Array.isArray(message)) {
          onMessage(message as CodexRpcMessage);
        }
      } catch {
        // Ignore non-protocol output; it is neither logged nor returned to Renderer.
      }
    });
  }

  public send(message: CodexRpcMessage): void {
    if (!this.process?.stdin.writable) throw new Error('Codex is offline.');
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  public close(): void {
    this.lines?.close();
    this.lines = null;
    this.process?.kill();
    this.process = null;
  }
}

function resolveCodexExecutable(): string {
  const platformPackage =
    process.platform === 'win32'
      ? process.arch === 'arm64'
        ? '@openai/codex-win32-arm64'
        : '@openai/codex-win32-x64'
      : process.platform === 'darwin'
        ? process.arch === 'arm64'
          ? '@openai/codex-darwin-arm64'
          : '@openai/codex-darwin-x64'
        : process.arch === 'arm64'
          ? '@openai/codex-linux-arm64'
          : '@openai/codex-linux-x64';
  const packageJson = nodeRequire.resolve(`${platformPackage}/package.json`);
  const root = path.join(path.dirname(packageJson), 'vendor');
  const triple =
    process.platform === 'win32'
      ? `${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-pc-windows-msvc`
      : process.platform === 'darwin'
        ? `${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-apple-darwin`
        : `${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-unknown-linux-musl`;
  return mapAsarUnpackedExecutable(
    path.join(root, triple, 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex'),
  );
}

export function mapAsarUnpackedExecutable(
  executablePath: string,
  resourcesPath = process.resourcesPath,
): string {
  const asarRoot = path.resolve(resourcesPath, 'app.asar');
  const resolvedExecutable = path.resolve(executablePath);
  const relativePath = path.relative(asarRoot, resolvedExecutable);
  if (
    relativePath === '' ||
    relativePath.startsWith(`..${path.sep}`) ||
    relativePath === '..' ||
    path.isAbsolute(relativePath)
  ) {
    return executablePath;
  }
  return path.join(resourcesPath, 'app.asar.unpacked', relativePath);
}

export function sanitizedCodexEnvironment(
  codexHome: string,
  proxyUrl: string | null,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { CODEX_HOME: codexHome };
  for (const key of [
    'PATH',
    'Path',
    'SystemRoot',
    'WINDIR',
    'TMP',
    'TEMP',
    'LANG',
    'HOME',
    'USERPROFILE',
  ]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  if (proxyUrl) {
    env.HTTP_PROXY = proxyUrl;
    env.HTTPS_PROXY = proxyUrl;
  }
  return env;
}

function parseModels(value: unknown): readonly AiProviderModel[] {
  const data = asObject(value)?.data;
  if (!Array.isArray(data)) throw new Error('The Codex model response was invalid.');
  return data.flatMap((entry) => {
    const item = asObject(entry);
    if (!item || typeof item.id !== 'string') return [];
    return [
      {
        id: item.id,
        displayName: typeof item.displayName === 'string' ? item.displayName : item.id,
        isDefault: item.isDefault === true,
      },
    ];
  });
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : null;
}

function isOpaqueLoginId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 512 &&
    !hasControlCharacter(value) &&
    !value.includes('://')
  );
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 32 || codePoint === 127) return true;
  }
  return false;
}

function safeLoginError(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'ChatGPT sign-in was cancelled or could not be completed.';
  }
  return value.trim().slice(0, 500);
}

function isUnsafeItem(type: string): boolean {
  return [
    'commandExecution',
    'fileChange',
    'mcpToolCall',
    'dynamicToolCall',
    'collabToolCall',
    'webSearch',
    'imageView',
  ].includes(type);
}

function readUsage(turn: JsonObject | null, key: string): number | null {
  const usage = asObject(turn?.usage);
  const value = usage?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'The Codex runtime is unavailable.';
}

function classifyConnectionError(
  message: string,
): 'expired' | 'version_mismatch' | 'offline' | 'error' {
  const normalized = message.toLowerCase();
  if (normalized.includes('unauthorized') || normalized.includes('authentication'))
    return 'expired';
  if (normalized.includes('version') || normalized.includes('not initialized')) {
    return 'version_mismatch';
  }
  if (normalized.includes('invalid')) return 'error';
  return 'offline';
}
