import type { ApiError, ApiErrorCode } from '../../shared/contracts/library';
import type {
  ZoteroConnectionError,
  ZoteroConnectionErrorCode,
} from '../../shared/contracts/zotero';

export type ZoteroBridgeErrorCode = Extract<ApiErrorCode, `ZOTERO_${string}`> | 'NOT_FOUND';

export class ZoteroBridgeError extends Error {
  public readonly code: ZoteroBridgeErrorCode;

  public constructor(code: ZoteroBridgeErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ZoteroBridgeError';
    this.code = code;
  }
}

const CONNECTION_TO_API_CODE: Readonly<Record<ZoteroConnectionErrorCode, ZoteroBridgeErrorCode>> = {
  api_disabled: 'ZOTERO_API_DISABLED',
  invalid_response: 'ZOTERO_INVALID_RESPONSE',
  not_running: 'ZOTERO_NOT_RUNNING',
  server_error: 'ZOTERO_SERVER_ERROR',
  timeout: 'ZOTERO_TIMEOUT',
  unsupported_version: 'ZOTERO_UNSUPPORTED_VERSION',
};

export function connectionErrorToBridgeError(error: ZoteroConnectionError): ZoteroBridgeError {
  return new ZoteroBridgeError(CONNECTION_TO_API_CODE[error.code], error.message);
}

export function toZoteroApiError(error: unknown): ApiError {
  if (error instanceof ZoteroBridgeError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: 'ZOTERO_SERVER_ERROR',
    message: 'PaperMind could not complete the Zotero request.',
  };
}
