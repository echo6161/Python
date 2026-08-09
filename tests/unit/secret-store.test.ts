import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { AiSecretStore, type SafeStorageAdapter } from '../../src/main/ai/secret-store';

const temporaryRoots: string[] = [];
const TEST_API_KEY = 'pm-test-secret-sentinel-123456';

class FakeSafeStorage implements SafeStorageAdapter {
  public available = true;
  public backend = 'gnome_libsecret';
  public encryptionVersion = 1;
  public encryptCalls = 0;

  public isAsyncEncryptionAvailable(): Promise<boolean> {
    return Promise.resolve(this.available);
  }

  public getSelectedStorageBackend(): string {
    return this.backend;
  }

  public encryptStringAsync(plainText: string): Promise<Buffer> {
    this.encryptCalls += 1;
    const bytes = Buffer.from(plainText, 'utf8');
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = (bytes[index] ?? 0) ^ 0x5a;
    }
    return Promise.resolve(
      Buffer.from(
        JSON.stringify({ version: this.encryptionVersion, data: bytes.toString('base64') }),
        'utf8',
      ),
    );
  }

  public decryptStringAsync(
    encrypted: Buffer,
  ): Promise<{ readonly result: string; readonly shouldReEncrypt: boolean }> {
    const parsed = JSON.parse(encrypted.toString('utf8')) as {
      readonly version: number;
      readonly data: string;
    };
    const bytes = Buffer.from(parsed.data, 'base64');
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = (bytes[index] ?? 0) ^ 0x5a;
    }
    return Promise.resolve({
      result: bytes.toString('utf8'),
      shouldReEncrypt: parsed.version < this.encryptionVersion,
    });
  }
}

async function createHarness(platform: NodeJS.Platform = 'win32'): Promise<{
  readonly root: string;
  readonly safeStorage: FakeSafeStorage;
  readonly store: AiSecretStore;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'papermind-secret-store-'));
  temporaryRoots.push(root);
  const safeStorage = new FakeSafeStorage();
  const store = new AiSecretStore({ userDataPath: root, safeStorage, platform });
  return { root, safeStorage, store };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe('AiSecretStore', () => {
  it('persists only encrypted credential bytes outside the paper library', async () => {
    const { root, store } = await createHarness();
    const secretPath = path.join(root, 'secrets.v1.json');

    await expect(store.setApiKey(TEST_API_KEY)).resolves.toEqual({
      configured: true,
      persistence: 'secure',
      backend: 'dpapi',
    });
    const storedText = await readFile(secretPath, 'utf8');

    expect(storedText).not.toContain(TEST_API_KEY);
    await expect(store.getApiKeyForMain()).resolves.toBe(TEST_API_KEY);
  });

  it.each([
    { name: 'basic_text backend', available: true, backend: 'basic_text' },
    { name: 'unknown backend', available: true, backend: 'unknown' },
    { name: 'unavailable encryption', available: false, backend: 'gnome_libsecret' },
  ])('keeps the key in session memory with no file for $name', async ({ available, backend }) => {
    const { root, safeStorage, store } = await createHarness('linux');
    safeStorage.available = available;
    safeStorage.backend = backend;

    const state = await store.setApiKey(TEST_API_KEY);

    expect(state).toMatchObject({ configured: true, persistence: 'session_only' });
    expect(state.backend).toBe(available ? backend : 'unavailable');
    await expect(store.getApiKeyForMain()).resolves.toBe(TEST_API_KEY);
    await expect(fileExists(path.join(root, 'secrets.v1.json'))).resolves.toBe(false);
    expect(safeStorage.encryptCalls).toBe(0);
  });

  it('deletes both persisted and in-memory credential state', async () => {
    const { root, store } = await createHarness();
    const secretPath = path.join(root, 'secrets.v1.json');
    await store.setApiKey(TEST_API_KEY);

    await expect(store.deleteApiKey()).resolves.toEqual({
      configured: false,
      persistence: 'secure',
      backend: 'dpapi',
    });

    await expect(fileExists(secretPath)).resolves.toBe(false);
    await expect(store.getApiKeyForMain()).resolves.toBeNull();
  });

  it('fails closed without replacing a corrupt secret file', async () => {
    const { root, store } = await createHarness();
    const secretPath = path.join(root, 'secrets.v1.json');
    const corruptContent = '{"version":1,"ciphertext":"unterminated"';
    await mkdir(root, { recursive: true });
    await writeFile(secretPath, corruptContent, { encoding: 'utf8', mode: 0o600 });

    await expect(store.getState()).resolves.toEqual({
      configured: false,
      persistence: 'secure',
      backend: 'dpapi',
    });
    await expect(store.getApiKeyForMain()).resolves.toBeNull();
    await expect(readFile(secretPath, 'utf8')).resolves.toBe(corruptContent);
  });

  it('atomically re-encrypts a credential after key rotation', async () => {
    const { root, safeStorage, store } = await createHarness();
    const secretPath = path.join(root, 'secrets.v1.json');
    await store.setApiKey(TEST_API_KEY);
    const beforeRotation = await readFile(secretPath, 'utf8');
    safeStorage.encryptionVersion = 2;

    await expect(store.getApiKeyForMain()).resolves.toBe(TEST_API_KEY);
    const afterRotation = await readFile(secretPath, 'utf8');

    expect(afterRotation).not.toBe(beforeRotation);
    expect(afterRotation).not.toContain(TEST_API_KEY);
    expect(safeStorage.encryptCalls).toBe(2);
    await expect(store.getApiKeyForMain()).resolves.toBe(TEST_API_KEY);
    expect(safeStorage.encryptCalls).toBe(2);
  });

  it('serializes a slow credential replacement followed by deletion', async () => {
    const { root, safeStorage, store } = await createHarness();
    const originalEncrypt = safeStorage.encryptStringAsync.bind(safeStorage);
    let releaseEncryption: () => void = () => undefined;
    let signalEncryptionStarted: () => void = () => undefined;
    const encryptionStarted = new Promise<void>((resolve) => {
      signalEncryptionStarted = resolve;
    });
    const encryptionGate = new Promise<void>((resolve) => {
      releaseEncryption = resolve;
    });
    safeStorage.encryptStringAsync = async (plainText) => {
      signalEncryptionStarted();
      await encryptionGate;
      return originalEncrypt(plainText);
    };

    const replacement = store.setApiKey(TEST_API_KEY);
    await encryptionStarted;
    const deletion = store.deleteApiKey();
    releaseEncryption();
    await replacement;
    await deletion;

    await expect(store.getApiKeyForMain()).resolves.toBeNull();
    await expect(fileExists(path.join(root, 'secrets.v1.json'))).resolves.toBe(false);
  });
});
