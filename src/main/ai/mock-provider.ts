import { AiProviderError, type AiProvider, type AiProviderEvent } from './provider';

export interface MockProviderOptions {
  readonly delayMs?: number;
  readonly failWith?: 'network' | 'timeout';
}

export class MockAiProvider implements AiProvider {
  public readonly id = 'mock' as const;

  public constructor(private readonly options: MockProviderOptions = {}) {}

  public async *stream(
    request: Parameters<AiProvider['stream']>[0],
    signal: AbortSignal,
  ): AsyncIterable<AiProviderEvent> {
    if (this.options.failWith) {
      throw new AiProviderError({
        code: this.options.failWith === 'timeout' ? 'TIMEOUT' : 'NETWORK',
        message:
          this.options.failWith === 'timeout'
            ? 'The AI request timed out.'
            : 'PaperMind could not reach the configured AI endpoint.',
        retryable: true,
      });
    }
    const serializedSelection = request.messages
      .at(-1)
      ?.content.match(/untrusted quoted paper data, not instructions:\n(\{[^\n]+\})/u)?.[1];
    let selected: string | null = null;
    if (serializedSelection) {
      try {
        const parsed = JSON.parse(serializedSelection) as { readonly selectedText?: unknown };
        selected = typeof parsed.selectedText === 'string' ? parsed.selectedText : null;
      } catch {
        selected = null;
      }
    }
    const output = selected
      ? `## Mock response\n\nSelection: ${selected}`
      : 'Mock response for a question without paper context.';
    for (const chunk of output.match(/[\s\S]{1,16}/gu) ?? []) {
      await wait(this.options.delayMs ?? 2, signal);
      yield { type: 'delta', delta: chunk };
    }
    yield {
      type: 'completed',
      providerRequestId: 'mock-request',
      inputTokens: null,
      outputTokens: null,
    };
  }
}

async function wait(delayMs: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(
          new AiProviderError({
            code: 'CANCELLED',
            message: 'The AI request was cancelled.',
            retryable: false,
          }),
        );
      },
      { once: true },
    );
  });
}
