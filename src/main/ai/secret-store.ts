import { randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import type { AiCredentialState } from '../../shared/contracts/ai';

const SECRET_FILENAME = 'secrets.v1.json';
const MAX_SECRET_FILE_BYTES = 64 * 1024;
const MAX_API_KEY_LENGTH = 8_192;

export interface SafeStorageAdapter {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  encryptStringAsync(plainText: string): Promise<Buffer>;
  decryptStringAsync(encrypted: Buffer): Promise<{
    readonly result: string;
    readonly shouldReEncrypt: boolean;
  }>;
  getSelectedStorageBackend?(): string;
}

export interface AiSecretStoreOptions {
  readonly userDataPath: string;
  readonly safeStorage: SafeStorageAdapter;
  readonly platform?: NodeJS.Platform;
}

interface StoredSecret {
  readonly version: 1;
  readonly id: 'provider:openai';
  readonly providerId: 'openai';
  readonly ciphertext: string;
  readonly backend: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface StorageMode {
  readonly persistence: 'secure' | 'session_only';
  readonly backend: string;
}

function isValidApiKey(apiKey: string): boolean {
  return (
    apiKey.length > 0 &&
    apiKey.length <= MAX_API_KEY_LENGTH &&
    !Array.from(apiKey).some((character) => {
      const code = character.charCodeAt(0);
      return code === 0 || code === 10 || code === 13;
    })
  );
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function decodeBase64(value: unknown): Buffer | null {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;

  const decoded = Buffer.from(value, 'base64');
  return decoded.toString('base64') === value ? decoded : null;
}

function parseStoredSecret(value: unknown): StoredSecret | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const expectedKeys = [
    'backend',
    'ciphertext',
    'createdAt',
    'id',
    'providerId',
    'updatedAt',
    'version',
  ];
  if (
    Object.keys(record).length !== expectedKeys.length ||
    !expectedKeys.every((key) => Object.hasOwn(record, key)) ||
    record.version !== 1 ||
    record.id !== 'provider:openai' ||
    record.providerId !== 'openai' ||
    typeof record.backend !== 'string' ||
    record.backend.length === 0 ||
    record.backend.length > 100 ||
    !decodeBase64(record.ciphertext) ||
    !isIsoDate(record.createdAt) ||
    !isIsoDate(record.updatedAt)
  ) {
    return null;
  }

  return record as unknown as StoredSecret;
}

export class AiSecretStore {
  private readonly secretPath: string;
  private readonly safeStorage: SafeStorageAdapter;
  private readonly platform: NodeJS.Platform;
  private sessionApiKey: string | null = null;
  private sessionBackend: string | null = null;
  private operationQueue: Promise<void> = Promise.resolve();

  public constructor(options: AiSecretStoreOptions) {
    this.secretPath = path.join(path.resolve(options.userDataPath), SECRET_FILENAME);
    this.safeStorage = options.safeStorage;
    this.platform = options.platform ?? process.platform;
  }

  public async getState(): Promise<AiCredentialState> {
    return this.withLock(() => this.getStateUnlocked());
  }

  public async setApiKey(apiKey: string): Promise<AiCredentialState> {
    return this.withLock(() => this.setApiKeyUnlocked(apiKey));
  }

  public async deleteApiKey(): Promise<AiCredentialState> {
    return this.withLock(() => this.deleteApiKeyUnlocked());
  }

  public async getApiKeyForMain(): Promise<string | null> {
    return this.withLock(() => this.getApiKeyForMainUnlocked());
  }

  private async getStateUnlocked(): Promise<AiCredentialState> {
    if (this.sessionApiKey !== null) {
      return {
        configured: true,
        persistence: 'session_only',
        backend: this.sessionBackend ?? 'unavailable',
      };
    }

    const mode = await this.getStorageMode();
    const configured = mode.persistence === 'secure' && (await this.readStoredSecret()) !== null;
    return { configured, ...mode };
  }

  private async setApiKeyUnlocked(apiKey: string): Promise<AiCredentialState> {
    if (!isValidApiKey(apiKey)) {
      throw new Error('The API credential is invalid.');
    }

    const mode = await this.getStorageMode();
    if (mode.persistence === 'session_only') {
      await this.replaceWithSessionKey(apiKey, mode.backend);
      return this.getStateUnlocked();
    }

    try {
      const encrypted = await this.safeStorage.encryptStringAsync(apiKey);
      if (encrypted.length === 0) throw new Error('Empty encrypted credential.');
      const existing = await this.readStoredSecret();
      const now = new Date().toISOString();
      await this.writeStoredSecret({
        version: 1,
        id: 'provider:openai',
        providerId: 'openai',
        ciphertext: encrypted.toString('base64'),
        backend: mode.backend,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      this.sessionApiKey = null;
      this.sessionBackend = null;
      return { configured: true, ...mode };
    } catch {
      await this.replaceWithSessionKey(apiKey, 'unavailable');
      return this.getStateUnlocked();
    }
  }

  private async deleteApiKeyUnlocked(): Promise<AiCredentialState> {
    this.sessionApiKey = null;
    this.sessionBackend = null;
    await rm(this.secretPath, { force: true });
    return this.getStateUnlocked();
  }

  private async getApiKeyForMainUnlocked(): Promise<string | null> {
    if (this.sessionApiKey !== null) return this.sessionApiKey;

    const mode = await this.getStorageMode();
    if (mode.persistence !== 'secure') return null;
    const stored = await this.readStoredSecret();
    if (!stored) return null;
    const encrypted = decodeBase64(stored.ciphertext);
    if (!encrypted) return null;

    try {
      const decrypted = await this.safeStorage.decryptStringAsync(encrypted);
      if (!isValidApiKey(decrypted.result)) return null;
      if (decrypted.shouldReEncrypt) {
        await this.reEncryptStoredSecret(decrypted.result, stored, mode.backend);
      }
      return decrypted.result;
    } catch {
      return null;
    }
  }

  private async getStorageMode(): Promise<StorageMode> {
    try {
      if (!(await this.safeStorage.isAsyncEncryptionAvailable())) {
        return { persistence: 'session_only', backend: 'unavailable' };
      }

      if (this.platform === 'linux') {
        const backend = this.safeStorage.getSelectedStorageBackend?.() ?? 'unknown';
        if (backend === 'basic_text' || backend === 'unknown') {
          return { persistence: 'session_only', backend };
        }
        return { persistence: 'secure', backend };
      }

      if (this.platform === 'win32') return { persistence: 'secure', backend: 'dpapi' };
      if (this.platform === 'darwin') return { persistence: 'secure', backend: 'keychain' };
      return { persistence: 'session_only', backend: 'unsupported' };
    } catch {
      return { persistence: 'session_only', backend: 'unavailable' };
    }
  }

  private async replaceWithSessionKey(apiKey: string, backend: string): Promise<void> {
    await rm(this.secretPath, { force: true });
    this.sessionApiKey = apiKey;
    this.sessionBackend = backend;
  }

  private async readStoredSecret(): Promise<StoredSecret | null> {
    try {
      const fileStats = await stat(this.secretPath);
      if (!fileStats.isFile() || fileStats.size <= 0 || fileStats.size > MAX_SECRET_FILE_BYTES) {
        return null;
      }
      const content = await readFile(this.secretPath, 'utf8');
      return parseStoredSecret(JSON.parse(content) as unknown);
    } catch {
      return null;
    }
  }

  private async reEncryptStoredSecret(
    apiKey: string,
    stored: StoredSecret,
    backend: string,
  ): Promise<void> {
    try {
      const encrypted = await this.safeStorage.encryptStringAsync(apiKey);
      if (encrypted.length === 0) return;
      await this.writeStoredSecret({
        ...stored,
        ciphertext: encrypted.toString('base64'),
        backend,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // The already-decrypted key remains usable for this request; the old ciphertext stays intact.
    }
  }

  private async writeStoredSecret(secret: StoredSecret): Promise<void> {
    const directory = path.dirname(this.secretPath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.secretPath}.${randomUUID()}.tmp`;
    const handle = await open(temporaryPath, 'wx', 0o600);
    let handleOpen = true;
    try {
      await handle.writeFile(`${JSON.stringify(secret)}\n`, { encoding: 'utf8' });
      await handle.sync();
      await handle.close();
      handleOpen = false;
      await rename(temporaryPath, this.secretPath);
      await chmod(this.secretPath, 0o600);
    } finally {
      if (handleOpen) await handle.close().catch(() => undefined);
      await rm(temporaryPath, { force: true });
    }
  }

  private withLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
