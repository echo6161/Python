import {
  AiProviderError,
  type AiProvider,
  type AiProviderEvent,
  type AiProviderRequest,
} from './provider';
import type { CodexAppServerClient } from './codex-app-server-client';

export class CodexProvider implements AiProvider {
  public readonly id = 'codex' as const;

  public constructor(private readonly client: CodexAppServerClient) {}

  public async *stream(
    request: AiProviderRequest,
    signal: AbortSignal,
  ): AsyncIterable<AiProviderEvent> {
    const events: AiProviderEvent[] = [];
    let wake: (() => void) | null = null;
    const state = { complete: false };
    let failure: Error | null = null;
    const prompt = [
      request.instructions,
      'You are a text-only research assistant. Do not use tools, commands, files, web search, skills, plugins, or subagents.',
      ...request.messages.map(({ role, content }) => `${role.toUpperCase()}:\n${content}`),
      'ASSISTANT:',
    ].join('\n\n');
    const task = this.client
      .runTurn(prompt, request.settings.model, signal, {
        onDelta: (delta) => {
          events.push({ type: 'delta', delta });
          wake?.();
        },
        onUnsafeActivity: () => undefined,
      })
      .then((result) => {
        events.push({
          type: 'completed',
          providerRequestId: result.requestId,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        });
      })
      .catch((error: unknown) => {
        failure = error instanceof Error ? error : new Error('Codex failed.');
      })
      .finally(() => {
        state.complete = true;
        wake?.();
      });

    while (!state.complete || events.length > 0) {
      const event = events.shift();
      if (event) {
        yield event;
        continue;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
      wake = null;
    }
    await task;
    const terminalFailure = failure as Error | null;
    if (terminalFailure) {
      const cancelled = signal.aborted || terminalFailure.message.toLowerCase().includes('cancel');
      throw new AiProviderError(
        cancelled
          ? { code: 'CANCELLED', message: 'The AI request was cancelled.', retryable: false }
          : { code: 'PROVIDER', message: terminalFailure.message.slice(0, 500), retryable: true },
        { cause: terminalFailure },
      );
    }
  }
}
