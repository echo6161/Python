import type { ApiError, ApiErrorCode } from '../../shared/contracts/library';

export class RepositoryError extends Error {
  public constructor(
    public readonly code: ApiErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'RepositoryError';
  }
}

export function toRepositoryApiError(error: unknown): ApiError {
  if (error instanceof RepositoryError) return { code: error.code, message: error.message };
  return {
    code: 'STORAGE_ERROR',
    message: 'PaperMind could not complete the repository operation.',
  };
}

export function mapFileSystemError(error: unknown, fallback: string): RepositoryError {
  if (error instanceof RepositoryError) return error;
  const code = systemErrorCode(error);
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    return new RepositoryError('FILE_NOT_FOUND', 'The repository or source path is missing.');
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return new RepositoryError('PERMISSION_DENIED', 'PaperMind cannot access this source path.');
  }
  return new RepositoryError('STORAGE_ERROR', fallback, { cause: error });
}

export function systemErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}
