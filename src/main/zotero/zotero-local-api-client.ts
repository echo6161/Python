import { z } from 'zod';
import { fileURLToPath } from 'node:url';

import type {
  ZoteroConnectionError,
  ZoteroConnectionStatus,
  ZoteroLibraryRef,
  ZoteroServerIdentity,
} from '../../shared/contracts/zotero';
import { ZoteroBridgeError } from './zotero-errors';

const ZOTERO_API_ORIGIN = 'http://127.0.0.1:23119';
const ZOTERO_API_PREFIX = '/api/';
const SUPPORTED_API_VERSION = 3;
const DEFAULT_TIMEOUT_MS = 2_500;
const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_MAX_ITEMS = 50;
const DEFAULT_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

const rawLibrarySchema = z
  .object({
    type: z.enum(['user', 'group']),
    id: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/u)]),
  })
  .loose();

const rawItemDataSchema = z
  .object({
    key: z.string(),
    version: z.number().int().nonnegative(),
    itemType: z.string(),
    title: z.string().optional(),
    creators: z
      .array(
        z
          .object({
            creatorType: z.string().optional(),
            firstName: z.string().optional(),
            lastName: z.string().optional(),
            name: z.string().optional(),
          })
          .loose(),
      )
      .optional(),
    date: z.string().optional(),
    DOI: z.string().optional(),
    abstractNote: z.string().optional(),
    publicationTitle: z.string().optional(),
    proceedingsTitle: z.string().optional(),
    bookTitle: z.string().optional(),
    publisher: z.string().optional(),
    university: z.string().optional(),
    institution: z.string().optional(),
    websiteTitle: z.string().optional(),
    seriesTitle: z.string().optional(),
    url: z.string().optional(),
    tags: z.array(z.object({ tag: z.string() }).loose()).optional(),
    collections: z.array(z.string()).optional(),
    parentItem: z.string().optional(),
    contentType: z.string().optional(),
    filename: z.string().optional(),
    linkMode: z.string().optional(),
  })
  .loose();

export const rawZoteroItemSchema = z
  .object({
    key: z.string(),
    version: z.number().int().nonnegative(),
    library: rawLibrarySchema.optional(),
    data: rawItemDataSchema,
  })
  .loose();

export type RawZoteroItem = z.infer<typeof rawZoteroItemSchema>;

export const rawZoteroCollectionSchema = z
  .object({
    key: z.string(),
    version: z.number().int().nonnegative(),
    library: rawLibrarySchema.optional(),
    data: z
      .object({
        key: z.string(),
        version: z.number().int().nonnegative(),
        name: z.string().optional(),
        parentCollection: z.union([z.string(), z.literal(false)]).optional(),
      })
      .loose(),
  })
  .loose();

export type RawZoteroCollection = z.infer<typeof rawZoteroCollectionSchema>;

interface ZoteroHeaders {
  get(name: string): string | null;
}

interface ZoteroHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: ZoteroHeaders;
  readonly body: ReadableStream<Uint8Array> | null;
}

interface ZoteroResponse {
  readonly headers: ZoteroHeaders;
  readonly body: string;
}

export interface RawZoteroPage<T> {
  readonly items: readonly T[];
  readonly start: number;
  readonly limit: number;
  readonly total: number | null;
  readonly hasNext: boolean;
}

export type ZoteroFetch = (
  input: string,
  init: {
    readonly method: 'GET';
    readonly headers: Readonly<Record<string, string>>;
    readonly redirect: 'manual';
    readonly signal: AbortSignal;
  },
) => Promise<ZoteroHttpResponse>;

interface ZoteroLocalApiClientOptions {
  readonly fetch?: ZoteroFetch;
  readonly timeoutMs?: number;
  readonly pageSize?: number;
  readonly maxItems?: number;
  readonly maxResponseBytes?: number;
}

interface RequestOptions {
  readonly allowMissingServerIdentity?: boolean;
  readonly expectedServerId?: string;
  readonly negotiateVersion?: boolean;
  readonly query?: Readonly<Record<string, number | string>>;
  readonly signal?: AbortSignal | undefined;
}

export class ZoteroLocalApiClient {
  private readonly fetch: ZoteroFetch;
  private readonly timeoutMs: number;
  private readonly pageSize: number;
  private readonly maxItems: number;
  private readonly maxResponseBytes: number;

  public constructor(options: ZoteroLocalApiClientOptions = {}) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    this.maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
    this.maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  }

  public async detectZotero(signal?: AbortSignal): Promise<ZoteroConnectionStatus> {
    try {
      const response = await this.request('', {
        allowMissingServerIdentity: true,
        negotiateVersion: true,
        signal,
      });
      const apiVersion = this.readApiVersion(response.headers);
      const serverIdentity = response.headers.get('zotero-server-id')
        ? this.readServerIdentity(response.headers)
        : await this.detectLegacyLibraryIdentity(this.readSchemaVersion(response.headers), signal);
      return { available: true, apiVersion, serverIdentity, error: null };
    } catch (error) {
      if (error instanceof ZoteroBridgeError && error.code === 'ZOTERO_CANCELLED') {
        throw error;
      }
      const connectionError = this.toConnectionError(error);
      return {
        available: false,
        apiVersion: null,
        serverIdentity: null,
        error: connectionError,
      };
    }
  }

  public requestTopItemsPage(
    library: ZoteroLibraryRef,
    serverId: string,
    start: number,
    limit: number,
    query: string | null = null,
    signal?: AbortSignal,
  ): Promise<RawZoteroPage<RawZoteroItem>> {
    const parameters: Record<string, number | string> = {
      direction: 'asc',
      itemType: '-attachment',
      sort: 'title',
    };
    if (query) {
      parameters.q = query;
      parameters.qmode = 'titleCreatorYear';
    }
    return this.requestPage(
      `${this.libraryPath(library)}/items/top`,
      rawZoteroItemSchema,
      serverId,
      start,
      limit,
      parameters,
      signal,
    );
  }

  public listCollectionTopItems(
    library: ZoteroLibraryRef,
    collectionKey: string,
    serverId: string,
  ): Promise<readonly RawZoteroItem[]> {
    return this.requestAll(
      `${this.libraryPath(library)}/collections/${collectionKey}/items/top`,
      rawZoteroItemSchema,
      serverId,
      { direction: 'asc', sort: 'title' },
    );
  }

  public async getItem(
    library: ZoteroLibraryRef,
    itemKey: string,
    serverId: string,
  ): Promise<RawZoteroItem> {
    const response = await this.request(`${this.libraryPath(library)}/items/${itemKey}`, {
      expectedServerId: serverId,
    });
    return this.parseJson(response, rawZoteroItemSchema);
  }

  public listCollections(
    library: ZoteroLibraryRef,
    serverId: string,
  ): Promise<readonly RawZoteroCollection[]> {
    return this.requestAll(
      `${this.libraryPath(library)}/collections`,
      rawZoteroCollectionSchema,
      serverId,
      { direction: 'asc', sort: 'title' },
    );
  }

  public listChildren(
    library: ZoteroLibraryRef,
    itemKey: string,
    serverId: string,
    signal?: AbortSignal,
  ): Promise<readonly RawZoteroItem[]> {
    return this.requestAll(
      `${this.libraryPath(library)}/items/${itemKey}/children`,
      rawZoteroItemSchema,
      serverId,
      {},
      signal,
    );
  }

  public async isAttachmentFileAvailable(
    library: ZoteroLibraryRef,
    attachmentKey: string,
    serverId: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      const response = await this.request(
        `${this.libraryPath(library)}/items/${attachmentKey}/file/view/url`,
        { expectedServerId: serverId, signal },
      );
      const value = response.body.trim();
      if (!value) {
        throw new ZoteroBridgeError(
          'ZOTERO_INVALID_RESPONSE',
          'Zotero returned an empty attachment location.',
        );
      }
      return true;
    } catch (error) {
      if (error instanceof ZoteroBridgeError && error.code === 'NOT_FOUND') {
        return false;
      }
      throw error;
    }
  }

  /** Main-process-only resolver for an attachment already authorized by a Zotero item ref. */
  public async resolveAttachmentFilePath(
    library: ZoteroLibraryRef,
    attachmentKey: string,
    serverId: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const response = await this.request(
      `${this.libraryPath(library)}/items/${attachmentKey}/file/view/url`,
      { expectedServerId: serverId, signal },
    );
    const value = response.body.trim();
    try {
      const url = new URL(value);
      if (url.protocol !== 'file:' || (url.hostname && url.hostname !== 'localhost')) {
        throw new Error('unsupported attachment location');
      }
      return fileURLToPath(url);
    } catch {
      throw new ZoteroBridgeError(
        'ZOTERO_INVALID_RESPONSE',
        'Zotero returned an invalid local attachment location.',
      );
    }
  }

  private async requestAll<T>(
    path: string,
    itemSchema: z.ZodType<T>,
    serverId: string,
    query: Readonly<Record<string, number | string>>,
    signal?: AbortSignal,
  ): Promise<readonly T[]> {
    const values: T[] = [];
    for (let start = 0; values.length < this.maxItems; start += this.pageSize) {
      const response = await this.request(path, {
        expectedServerId: serverId,
        query: { ...query, limit: this.pageSize, start },
        signal,
      });
      const page = this.parseJson(response, z.array(itemSchema).max(this.pageSize));
      values.push(...page.slice(0, this.maxItems - values.length));
      if (page.length < this.pageSize) {
        break;
      }
    }
    return values;
  }

  private async requestPage<T>(
    path: string,
    itemSchema: z.ZodType<T>,
    serverId: string,
    start: number,
    limit: number,
    query: Readonly<Record<string, number | string>>,
    signal?: AbortSignal,
  ): Promise<RawZoteroPage<T>> {
    const response = await this.request(path, {
      expectedServerId: serverId,
      query: { ...query, limit, start },
      signal,
    });
    const items = this.parseJson(response, z.array(itemSchema).max(limit));
    const total = this.readTotalResults(response.headers);
    return {
      items,
      start,
      limit,
      total,
      hasNext: total === null ? items.length === limit : start + items.length < total,
    };
  }

  private async request(path: string, options: RequestOptions): Promise<ZoteroResponse> {
    if (path && !/^[A-Za-z0-9_/-]+$/u.test(path)) {
      throw new ZoteroBridgeError('ZOTERO_INVALID_RESPONSE', 'Invalid internal Zotero endpoint.');
    }
    const url = new URL(`${ZOTERO_API_PREFIX}${path}`, ZOTERO_API_ORIGIN);
    for (const [name, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(name, String(value));
    }
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (!options.negotiateVersion) {
      headers['Zotero-API-Version'] = String(SUPPORTED_API_VERSION);
    }
    if (options.expectedServerId && !isLegacyLibraryIdentity(options.expectedServerId)) {
      headers['Zotero-Server-ID'] = options.expectedServerId;
    }

    const controller = new AbortController();
    const cancel = () => controller.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await this.fetch(url.toString(), {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw this.mapHttpError(response.status);
      }
      this.validateResponseIdentity(
        response.headers,
        options.expectedServerId,
        options.allowMissingServerIdentity,
      );
      return { headers: response.headers, body: await this.readBody(response) };
    } catch (error) {
      if (error instanceof ZoteroBridgeError) {
        throw error;
      }
      if (options.signal?.aborted) {
        throw new ZoteroBridgeError('ZOTERO_CANCELLED', 'The Zotero request was cancelled.', {
          cause: error,
        });
      }
      if (controller.signal.aborted) {
        throw new ZoteroBridgeError('ZOTERO_TIMEOUT', 'The Zotero request timed out.', {
          cause: error,
        });
      }
      throw new ZoteroBridgeError('ZOTERO_NOT_RUNNING', 'Zotero is not running.', {
        cause: error,
      });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
    }
  }

  private parseJson<T>(response: ZoteroResponse, schema: z.ZodType<T>): T {
    const body = response.body;
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch (error) {
      throw new ZoteroBridgeError('ZOTERO_INVALID_RESPONSE', 'Zotero returned invalid JSON.', {
        cause: error,
      });
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new ZoteroBridgeError(
        'ZOTERO_INVALID_RESPONSE',
        'Zotero returned an unexpected response shape.',
        { cause: result.error },
      );
    }
    return result.data;
  }

  private readTotalResults(headers: ZoteroHeaders): number | null {
    const raw = headers.get('total-results');
    if (raw === null) return null;
    const total = Number(raw);
    if (!Number.isInteger(total) || total < 0) {
      throw new ZoteroBridgeError(
        'ZOTERO_INVALID_RESPONSE',
        'Zotero returned an invalid result count.',
      );
    }
    return total;
  }

  private async readBody(response: ZoteroHttpResponse): Promise<string> {
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > this.maxResponseBytes) {
      throw new ZoteroBridgeError(
        'ZOTERO_INVALID_RESPONSE',
        'The Zotero response exceeded the allowed size.',
      );
    }
    if (!response.body) {
      return '';
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    for (;;) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      byteLength += result.value.byteLength;
      if (byteLength > this.maxResponseBytes) {
        await reader.cancel();
        throw new ZoteroBridgeError(
          'ZOTERO_INVALID_RESPONSE',
          'The Zotero response exceeded the allowed size.',
        );
      }
      chunks.push(result.value);
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
  }

  private validateResponseIdentity(
    headers: ZoteroHeaders,
    expectedServerId?: string,
    allowMissingServerIdentity = false,
  ): void {
    const apiVersion = this.readApiVersion(headers);
    if (apiVersion !== SUPPORTED_API_VERSION) {
      throw new ZoteroBridgeError(
        'ZOTERO_UNSUPPORTED_VERSION',
        `Zotero Local API version ${String(apiVersion)} is not supported.`,
      );
    }
    if (!headers.get('zotero-server-id')) {
      if (allowMissingServerIdentity || isLegacyLibraryIdentity(expectedServerId)) {
        return;
      }
      throw new ZoteroBridgeError(
        'ZOTERO_INVALID_RESPONSE',
        'Zotero did not provide a stable server identity.',
      );
    }
    const identity = this.readServerIdentity(headers);
    if (expectedServerId && identity.serverId !== expectedServerId) {
      throw new ZoteroBridgeError(
        'ZOTERO_IDENTITY_CHANGED',
        'The Zotero database identity changed. Refresh the integration before continuing.',
      );
    }
  }

  private readApiVersion(headers: ZoteroHeaders): number {
    const value = headers.get('zotero-api-version');
    const version = Number(value);
    if (!value || !Number.isInteger(version) || version <= 0) {
      throw new ZoteroBridgeError(
        'ZOTERO_INVALID_RESPONSE',
        'Zotero did not provide a valid API version.',
      );
    }
    if (version !== SUPPORTED_API_VERSION) {
      throw new ZoteroBridgeError(
        'ZOTERO_UNSUPPORTED_VERSION',
        `Zotero Local API version ${String(version)} is not supported.`,
      );
    }
    return version;
  }

  private readServerIdentity(headers: ZoteroHeaders): ZoteroServerIdentity {
    const serverId = headers.get('zotero-server-id')?.trim();
    if (!serverId || !/^[A-Za-z0-9_-]{8,128}$/u.test(serverId)) {
      throw new ZoteroBridgeError(
        'ZOTERO_INVALID_RESPONSE',
        'Zotero did not provide a stable server identity.',
      );
    }
    return { serverId, schemaVersion: this.readSchemaVersion(headers), kind: 'server' };
  }

  private readSchemaVersion(headers: ZoteroHeaders): number | null {
    const rawSchemaVersion = headers.get('zotero-schema-version');
    const schemaVersion = rawSchemaVersion === null ? null : Number(rawSchemaVersion);
    if (schemaVersion !== null && (!Number.isInteger(schemaVersion) || schemaVersion < 0)) {
      throw new ZoteroBridgeError(
        'ZOTERO_INVALID_RESPONSE',
        'Zotero did not provide a valid schema version.',
      );
    }
    return schemaVersion;
  }

  private async detectLegacyLibraryIdentity(
    schemaVersion: number | null,
    signal?: AbortSignal,
  ): Promise<ZoteroServerIdentity> {
    const itemResponse = await this.request('users/0/items/top', {
      allowMissingServerIdentity: true,
      query: { limit: 1 },
      signal,
    });
    const items = this.parseJson(itemResponse, z.array(rawZoteroItemSchema).max(1));
    const itemLibraryId = items[0]?.library ? String(items[0].library.id) : null;
    if (itemLibraryId && itemLibraryId !== '0') {
      return legacyIdentity(itemLibraryId, schemaVersion);
    }

    const collectionResponse = await this.request('users/0/collections', {
      allowMissingServerIdentity: true,
      query: { limit: 1 },
      signal,
    });
    const collections = this.parseJson(
      collectionResponse,
      z.array(rawZoteroCollectionSchema).max(1),
    );
    const collectionLibraryId = collections[0]?.library ? String(collections[0].library.id) : null;
    if (collectionLibraryId && collectionLibraryId !== '0') {
      return legacyIdentity(collectionLibraryId, schemaVersion);
    }

    throw new ZoteroBridgeError(
      'ZOTERO_INVALID_RESPONSE',
      'This Zotero version does not expose a stable server or library identity.',
    );
  }

  private mapHttpError(status: number): ZoteroBridgeError {
    if (status === 403) {
      return new ZoteroBridgeError(
        'ZOTERO_API_DISABLED',
        'Zotero local API access is disabled in Zotero settings.',
      );
    }
    if (status === 404) {
      return new ZoteroBridgeError('NOT_FOUND', 'The Zotero resource was not found.');
    }
    if (status === 412) {
      return new ZoteroBridgeError(
        'ZOTERO_IDENTITY_CHANGED',
        'The Zotero database identity changed. Refresh the integration before continuing.',
      );
    }
    return new ZoteroBridgeError(
      'ZOTERO_SERVER_ERROR',
      'The Zotero local API could not complete the request.',
    );
  }

  private toConnectionError(error: unknown): ZoteroConnectionError {
    if (!(error instanceof ZoteroBridgeError)) {
      return { code: 'server_error', message: 'Zotero detection failed.' };
    }
    const mapping: Partial<Record<typeof error.code, ZoteroConnectionError['code']>> = {
      ZOTERO_API_DISABLED: 'api_disabled',
      ZOTERO_INVALID_RESPONSE: 'invalid_response',
      ZOTERO_NOT_RUNNING: 'not_running',
      ZOTERO_SERVER_ERROR: 'server_error',
      ZOTERO_TIMEOUT: 'timeout',
      ZOTERO_UNSUPPORTED_VERSION: 'unsupported_version',
    };
    return {
      code: mapping[error.code] ?? 'invalid_response',
      message: error.message,
    };
  }

  private libraryPath(library: ZoteroLibraryRef): string {
    return `${library.type === 'user' ? 'users' : 'groups'}/${library.id}`;
  }
}

function isLegacyLibraryIdentity(serverId: string | undefined): boolean {
  return serverId?.startsWith('legacy-user-') === true;
}

function legacyIdentity(libraryId: string, schemaVersion: number | null): ZoteroServerIdentity {
  return {
    serverId: `legacy-user-${libraryId}`,
    schemaVersion,
    kind: 'library_fallback',
  };
}
