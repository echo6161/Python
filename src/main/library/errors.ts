import type { ApiError, ApiErrorCode } from '../../shared/contracts/library';

export class LibraryError extends Error {
  public readonly code: ApiErrorCode;

  public constructor(code: ApiErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LibraryError';
    this.code = code;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof LibraryError) {
    return { code: error.code, message: error.message };
  }

  return {
    code: 'DATABASE_ERROR',
    message: 'PaperMind could not complete the local library operation.',
  };
}
