import { describe, expect, it, vi } from 'vitest';

import {
  type ZoteroFetch,
  ZoteroLocalApiClient,
} from '../../src/main/zotero/zotero-local-api-client';

const SERVER_ID = 'ServerIdentity01';
const identityHeaders = {
  'Content-Type': 'application/json',
  'Zotero-API-Version': '3',
  'Zotero-Schema-Version': '42',
  'Zotero-Server-ID': SERVER_ID,
};

describe('ZoteroLocalApiClient', () => {
  it('detects an available Zotero server and its stable database identity', async () => {
    const fetch = vi.fn<ZoteroFetch>().mockResolvedValue(response('', 200));
    const client = new ZoteroLocalApiClient({ fetch });

    await expect(client.detectZotero()).resolves.toEqual({
      available: true,
      apiVersion: 3,
      serverIdentity: { serverId: SERVER_ID, schemaVersion: 42, kind: 'server' },
      error: null,
    });
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:23119/api/',
      expect.objectContaining({
        method: 'GET',
        redirect: 'manual',
        headers: { Accept: 'application/json' },
      }),
    );
  });

  it('maps not running, disabled, timeout, and invalid responses without throwing', async () => {
    const notRunning = new ZoteroLocalApiClient({
      fetch: vi.fn<ZoteroFetch>().mockRejectedValue(new TypeError('connection refused')),
    });
    await expect(notRunning.detectZotero()).resolves.toMatchObject({
      available: false,
      error: { code: 'not_running' },
    });

    const disabled = new ZoteroLocalApiClient({
      fetch: vi.fn<ZoteroFetch>().mockResolvedValue(response('', 403)),
    });
    await expect(disabled.detectZotero()).resolves.toMatchObject({
      available: false,
      error: { code: 'api_disabled' },
    });

    const unavailable = new ZoteroLocalApiClient({
      fetch: vi.fn<ZoteroFetch>().mockResolvedValue(response('', 503)),
    });
    await expect(unavailable.detectZotero()).resolves.toMatchObject({
      available: false,
      error: { code: 'server_error' },
    });

    const timeoutFetch: ZoteroFetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    const timeout = new ZoteroLocalApiClient({ fetch: timeoutFetch, timeoutMs: 5 });
    await expect(timeout.detectZotero()).resolves.toMatchObject({
      available: false,
      error: { code: 'timeout' },
    });

    const invalid = new ZoteroLocalApiClient({
      fetch: vi.fn<ZoteroFetch>().mockResolvedValue(new Response('', { status: 200 })),
    });
    await expect(invalid.detectZotero()).resolves.toMatchObject({
      available: false,
      error: { code: 'invalid_response' },
    });
  });

  it('recovers when Zotero restarts', async () => {
    const fetch = vi
      .fn<ZoteroFetch>()
      .mockRejectedValueOnce(new TypeError('connection refused'))
      .mockResolvedValueOnce(response(''));
    const client = new ZoteroLocalApiClient({ fetch });

    await expect(client.detectZotero()).resolves.toMatchObject({ available: false });
    await expect(client.detectZotero()).resolves.toMatchObject({
      available: true,
      serverIdentity: { serverId: SERVER_ID },
    });
  });

  it('uses a real user-library identity when Zotero predates server IDs', async () => {
    const fetch: ZoteroFetch = (input) => {
      const url = new URL(input);
      if (url.pathname === '/api/') return Promise.resolve(legacyResponse(''));
      if (url.pathname.endsWith('/items/top')) {
        return Promise.resolve(
          legacyResponse([{ ...rawItem('AAAAAAA2'), library: { type: 'user', id: 12345678 } }]),
        );
      }
      throw new Error(`Unexpected legacy endpoint: ${url.pathname}`);
    };
    const client = new ZoteroLocalApiClient({ fetch });

    await expect(client.detectZotero()).resolves.toEqual({
      available: true,
      apiVersion: 3,
      serverIdentity: {
        serverId: 'legacy-user-12345678',
        schemaVersion: 42,
        kind: 'library_fallback',
      },
      error: null,
    });
  });

  it('requests a bounded page from a fixed endpoint and maps pagination headers', async () => {
    const starts: number[] = [];
    const fetch: ZoteroFetch = (input) => {
      const url = new URL(input);
      const start = Number(url.searchParams.get('start'));
      starts.push(start);
      const page = start === 0 ? [rawItem('AAAAAAA2'), rawItem('BBBBBBB2')] : [rawItem('CCCCCCC2')];
      return Promise.resolve(response(page, 200, { 'Total-Results': '5' }));
    };
    const client = new ZoteroLocalApiClient({ fetch, pageSize: 2, maxItems: 5 });

    const page = await client.requestTopItemsPage(
      { type: 'user', id: '0' },
      SERVER_ID,
      0,
      2,
      'methods',
    );

    expect(page.items.map(({ key }) => key)).toEqual(['AAAAAAA2', 'BBBBBBB2']);
    expect(page).toMatchObject({ start: 0, limit: 2, total: 5, hasNext: true });
    expect(starts).toEqual([0]);
  });

  it('cancels an active request through an external abort signal', async () => {
    const fetch: ZoteroFetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    const client = new ZoteroLocalApiClient({ fetch, timeoutMs: 10_000 });
    const controller = new AbortController();
    const request = client.requestTopItemsPage(
      { type: 'user', id: '0' },
      SERVER_ID,
      0,
      20,
      null,
      controller.signal,
    );

    controller.abort();

    await expect(request).rejects.toMatchObject({ code: 'ZOTERO_CANCELLED' });
  });

  it('rejects a response from a different Zotero database identity', async () => {
    const fetch = vi
      .fn<ZoteroFetch>()
      .mockResolvedValue(
        response(rawItem('AAAAAAA2'), 200, { 'Zotero-Server-ID': 'DifferentServer99' }),
      );
    const client = new ZoteroLocalApiClient({ fetch });

    await expect(
      client.getItem({ type: 'user', id: '0' }, 'AAAAAAA2', SERVER_ID),
    ).rejects.toMatchObject({ code: 'ZOTERO_IDENTITY_CHANGED' });
  });

  it('rejects invalid item payloads without returning raw data', async () => {
    const client = new ZoteroLocalApiClient({
      fetch: vi.fn<ZoteroFetch>().mockResolvedValue(response({ unexpected: true })),
    });

    await expect(
      client.requestTopItemsPage({ type: 'user', id: '0' }, SERVER_ID, 0, 20),
    ).rejects.toMatchObject({ code: 'ZOTERO_INVALID_RESPONSE' });
  });
});

function rawItem(key: string) {
  return {
    key,
    version: 1,
    library: { type: 'user', id: 0 },
    data: { key, version: 1, itemType: 'journalArticle', title: `Item ${key}` },
  };
}

function response(
  body: unknown,
  status = 200,
  extraHeaders: Readonly<Record<string, string>> = {},
): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { ...identityHeaders, ...extraHeaders },
  });
}

function legacyResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Zotero-API-Version': '3',
      'Zotero-Schema-Version': '42',
      'X-Zotero-Version': '9.0.6',
    },
  });
}
