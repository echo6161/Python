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
    const sources = [
      ...(request.messages
        .at(-1)
        ?.content.matchAll(
          /<source alias="([A-Z][A-Z0-9]+)" type="(paper|code|question|link)">/gu,
        ) ?? []),
    ].flatMap((match) => (match[1] && match[2] ? [{ alias: match[1], type: match[2] }] : []));
    const paper = sources.find(({ type }) => type === 'paper');
    const code = sources.find(({ type }) => type === 'code');
    const first = sources[0];
    const output = sources.length
      ? `## Evidence summary\n\nThe selected evidence supports a bounded comparison across the Workspace.${paper ? ` The paper excerpt states the research mechanism [${paper.alias}].` : ''}${code ? ` The code excerpt shows the corresponding implementation surface [${code.alias}].` : ''}\n\n## Synthesis\n\nRead together, the sources connect the conceptual claim to an inspectable implementation without extending beyond the supplied excerpts${first ? ` [${first.alias}]` : ''}.\n\n## Limits\n\nThis answer uses only the selected bounded context and does not infer access to the full paper or repository.`
      : selected
        ? `## Mock response\n\nSelection: ${selected}`
        : 'No selected sources were available, so the bounded context is insufficient.';
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
  if (signal.aborted) {
    throw new AiProviderError({
      code: 'CANCELLED',
      message: 'The AI request was cancelled.',
      retryable: false,
    });
  }
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
