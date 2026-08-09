import type { AiError, AiMessageRole, AiProviderSettings } from '../../shared/contracts/ai';

export interface AiProviderMessage {
  readonly role: AiMessageRole;
  readonly content: string;
}

export interface AiProviderRequest {
  readonly instructions: string;
  readonly messages: readonly AiProviderMessage[];
  readonly settings: AiProviderSettings;
}

export type AiProviderEvent =
  | { readonly type: 'delta'; readonly delta: string }
  | {
      readonly type: 'completed';
      readonly providerRequestId: string | null;
      readonly inputTokens: number | null;
      readonly outputTokens: number | null;
    };

export interface AiProvider {
  readonly id: 'openai' | 'mock';
  stream(request: AiProviderRequest, signal: AbortSignal): AsyncIterable<AiProviderEvent>;
}

export class AiProviderError extends Error {
  public constructor(
    public readonly safeError: AiError,
    options?: ErrorOptions,
  ) {
    super(safeError.message, options);
    this.name = 'AiProviderError';
  }
}
