import { request as httpsRequest, type RequestOptions } from 'node:https';
import { Readable } from 'node:stream';

import { createPublicAiLookup, normalizeAiBaseUrl } from './base-url-policy';

export const secureAiFetch: typeof fetch = async (input, init) => {
  const sourceRequest = input instanceof Request ? input : null;
  const url = input instanceof Request ? new URL(input.url) : new URL(input);
  normalizeAiBaseUrl(url.toString());

  const headers = new Headers(sourceRequest?.headers);
  new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
  const body = init?.body ?? (sourceRequest ? await sourceRequest.arrayBuffer() : null);
  const signal = init?.signal ?? sourceRequest?.signal;
  const options: RequestOptions = {
    method: init?.method ?? sourceRequest?.method ?? 'GET',
    headers: Object.fromEntries(headers.entries()),
    lookup: createPublicAiLookup(),
    signal: signal ?? undefined,
  };

  return new Promise<Response>((resolve, reject) => {
    const request = httpsRequest(url, options, (response) => {
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) {
          for (const item of value) responseHeaders.append(name, item);
        } else if (value !== undefined) {
          responseHeaders.set(name, value);
        }
      }
      resolve(
        new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>, {
          status: response.statusCode ?? 500,
          headers: responseHeaders,
          ...(response.statusMessage ? { statusText: response.statusMessage } : {}),
        }),
      );
    });
    request.once('error', reject);
    void writeRequestBody(request, body).catch((error: unknown) => {
      request.destroy(error instanceof Error ? error : new Error('AI request body failed.'));
    });
  });
};

async function writeRequestBody(
  request: ReturnType<typeof httpsRequest>,
  body: RequestInit['body'] | null,
): Promise<void> {
  if (body === null) {
    request.end();
    return;
  }
  if (typeof body === 'string' || body instanceof Uint8Array) {
    request.end(body);
    return;
  }
  if (body instanceof ArrayBuffer) {
    request.end(Buffer.from(body));
    return;
  }
  if (body instanceof URLSearchParams) {
    request.end(body.toString());
    return;
  }
  if (body instanceof Blob) {
    request.end(Buffer.from(await body.arrayBuffer()));
    return;
  }
  throw new TypeError('Unsupported AI request body type.');
}
