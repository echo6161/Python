import type { AiError } from '../../shared/contracts/ai';
import { LibraryError } from '../library/errors';
import { normalizeAiBaseUrl } from './base-url-policy';
import {
  AiProviderError,
  type AiProvider,
  type AiProviderEvent,
  type AiProviderRequest,
} from './provider';
import { secureAiFetch } from './secure-https-fetch';

const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 60_000;
const MAX_SSE_BUFFER_CHARACTERS = 1_000_000;
const MAX_SSE_EVENT_COUNT = 100_000;

type NetworkGuard = (baseUrl: string) => Promise<void>;

export class OpenAiProvider implements AiProvider {
  public readonly id = 'openai' as const;

  public constructor(
    private readonly apiKey: string,
    private readonly networkGuard: NetworkGuard = () => Promise.resolve(),
    private readonly fetchImplementation: typeof fetch = secureAiFetch,
  ) {}

  public async *stream(
    request: AiProviderRequest,
    signal: AbortSignal,
  ): AsyncIterable<AiProviderEvent> {
    const baseUrl = normalizeAiBaseUrl(request.settings.baseUrl);
    if (baseUrl !== request.settings.baseUrl) {
      throw new AiProviderError({
        code: 'PERMISSION',
        message: 'The configured AI endpoint did not pass validation.',
        retryable: false,
      });
    }

    try {
      await raceWithAbort(this.networkGuard(baseUrl), signal);
    } catch (error) {
      throw new AiProviderError(classifyTransportError(error, signal, null));
    }

    const requestBody = JSON.stringify({
      model: request.settings.model,
      instructions: request.instructions,
      input: request.messages.map(({ role, content }) => ({ role, content })),
      temperature: request.settings.temperature,
      max_output_tokens: request.settings.maxOutputTokens,
      store: false,
      stream: true,
    });

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const timeoutSignal = AbortSignal.timeout(ATTEMPT_TIMEOUT_MS);
      const attemptSignal = AbortSignal.any([signal, timeoutSignal]);
      let response: Response;
      try {
        response = await this.fetchImplementation(`${baseUrl}/responses`, {
          method: 'POST',
          headers: {
            accept: 'text/event-stream',
            authorization: `Bearer ${this.apiKey}`,
            'content-type': 'application/json',
          },
          body: requestBody,
          redirect: 'error',
          signal: attemptSignal,
        });
      } catch (error) {
        const safeError = classifyTransportError(error, signal, timeoutSignal);
        if (safeError.retryable && attempt + 1 < MAX_ATTEMPTS) {
          await retryDelay(attempt, signal);
          continue;
        }
        throw new AiProviderError(safeError);
      }

      if (!response.ok) {
        const safeError = classifyHttpStatus(response.status);
        await response.body?.cancel().catch(() => undefined);
        if (safeError.retryable && attempt + 1 < MAX_ATTEMPTS) {
          await retryDelay(attempt, signal);
          continue;
        }
        throw new AiProviderError(safeError);
      }
      if (!response.body) {
        throw new AiProviderError(providerFailure());
      }

      let completed = false;
      try {
        for await (const event of parseResponseEvents(response.body, attemptSignal)) {
          if (event.type === 'completed') completed = true;
          yield event;
        }
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        throw new AiProviderError(classifyTransportError(error, signal, timeoutSignal));
      }
      if (!completed) throw new AiProviderError(providerFailure());
      return;
    }
  }
}

async function* parseResponseEvents(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncIterable<AiProviderEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventCount = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > MAX_SSE_BUFFER_CHARACTERS) {
        throw new AiProviderError(providerFailure());
      }
      for (;;) {
        const delimiter = /\r?\n\r?\n/u.exec(buffer);
        if (!delimiter) break;
        const block = buffer.slice(0, delimiter.index);
        buffer = buffer.slice(delimiter.index + delimiter[0].length);
        eventCount += 1;
        if (eventCount > MAX_SSE_EVENT_COUNT) {
          throw new AiProviderError(providerFailure());
        }
        const event = parseSseBlock(block);
        if (event) yield event;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const event = parseSseBlock(buffer);
      if (event) yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

async function raceWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw abortReason(signal);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortReason(signal));
    signal.addEventListener('abort', abort, { once: true });
    void operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('The AI request was aborted.');
}

function parseSseBlock(block: string): AiProviderEvent | null {
  const data = block
    .split(/\r?\n/u)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /u, ''))
    .join('\n');
  if (!data || data === '[DONE]') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(data) as unknown;
  } catch {
    throw new AiProviderError(providerFailure());
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AiProviderError(providerFailure());
  }
  const event = parsed as Record<string, unknown>;
  if (
    (event.type === 'response.output_text.delta' || event.type === 'response.refusal.delta') &&
    typeof event.delta === 'string'
  ) {
    return { type: 'delta', delta: event.delta };
  }
  if (event.type === 'response.completed') {
    const response = objectRecord(event.response);
    const usage = objectRecord(response?.usage);
    return {
      type: 'completed',
      providerRequestId: typeof response?.id === 'string' ? response.id : null,
      inputTokens: finiteNumber(usage?.input_tokens),
      outputTokens: finiteNumber(usage?.output_tokens),
    };
  }
  if (
    event.type === 'response.failed' ||
    event.type === 'response.incomplete' ||
    event.type === 'error'
  ) {
    throw new AiProviderError(providerFailure());
  }
  return null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function classifyHttpStatus(status: number): AiError {
  if (status === 401) {
    return {
      code: 'AUTHENTICATION',
      message: 'OpenAI rejected the API key. Check the key in Settings.',
      retryable: false,
    };
  }
  if (status === 403) {
    return {
      code: 'PERMISSION',
      message: 'The configured OpenAI account cannot use this model.',
      retryable: false,
    };
  }
  if (status === 400 || status === 404 || status === 422) {
    return {
      code: 'INVALID_REQUEST',
      message: 'OpenAI rejected the model or request settings.',
      retryable: false,
    };
  }
  if (status === 408) {
    return { code: 'TIMEOUT', message: 'The AI request timed out.', retryable: true };
  }
  if (status === 409 || status === 429) {
    return {
      code: 'RATE_LIMIT',
      message: 'OpenAI is rate-limiting this request. Try again later.',
      retryable: true,
    };
  }
  return providerFailure();
}

function classifyTransportError(
  error: unknown,
  userSignal: AbortSignal,
  timeoutSignal: AbortSignal | null,
): AiError {
  if (userSignal.aborted) {
    return { code: 'CANCELLED', message: 'The AI request was cancelled.', retryable: false };
  }
  if (timeoutSignal?.aborted) {
    return { code: 'TIMEOUT', message: 'The AI request timed out.', retryable: true };
  }
  if (error instanceof LibraryError && error.code === 'PERMISSION_DENIED') {
    return {
      code: 'PERMISSION',
      message: 'The configured AI endpoint is blocked by the local network policy.',
      retryable: false,
    };
  }
  if ((error as NodeJS.ErrnoException | null)?.code === 'EACCES') {
    return {
      code: 'PERMISSION',
      message: 'The configured AI endpoint is blocked by the local network policy.',
      retryable: false,
    };
  }
  return {
    code: 'NETWORK',
    message: 'PaperMind could not reach the configured AI endpoint.',
    retryable: true,
  };
}

async function retryDelay(attempt: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, 250 * 2 ** attempt);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(new AiProviderError(classifyTransportError(null, signal, null)));
      },
      { once: true },
    );
  });
}

function providerFailure(): AiError {
  return {
    code: 'PROVIDER',
    message: 'The AI provider could not complete the response.',
    retryable: true,
  };
}
