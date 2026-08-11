import { Worker } from 'node:worker_threads';

import { RepositoryError } from '../repository/repository-errors';
import type { CodeParserInput, ParsedCodeFile } from './code-parser';

export const CODE_PARSER_WORKER_RESOURCE_LIMITS = Object.freeze({ maxOldGenerationSizeMb: 256 });
const WORKER_TIMEOUT_MS = 120_000;

export class CodeParserClient {
  public constructor(
    private readonly workerPath: string,
    private readonly timeoutMs = WORKER_TIMEOUT_MS,
  ) {}

  public parseFiles(
    files: readonly CodeParserInput[],
    signal?: AbortSignal,
    onProgress?: (processed: number, relativePath: string) => void,
  ): Promise<readonly ParsedCodeFile[]> {
    if (signal?.aborted) return Promise.reject(cancelled());
    const worker = new Worker(this.workerPath, {
      workerData: { files },
      resourceLimits: CODE_PARSER_WORKER_RESOURCE_LIMITS,
    });
    return new Promise((resolve, reject) => {
      const results: ParsedCodeFile[] = [];
      let settled = false;
      const finish = (operation: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        worker.removeAllListeners();
        void worker.terminate();
        operation();
      };
      const abort = () => finish(() => reject(cancelled()));
      const timeout = setTimeout(
        () => finish(() => reject(new RepositoryError('STORAGE_ERROR', 'Code parsing timed out.'))),
        this.timeoutMs,
      );
      signal?.addEventListener('abort', abort, { once: true });
      worker.on('message', (message: unknown) => {
        if (!isWorkerMessage(message)) {
          finish(() =>
            reject(new RepositoryError('STORAGE_ERROR', 'Code parser returned invalid data.')),
          );
          return;
        }
        if (message.type === 'file') {
          results.push(message.result);
          onProgress?.(results.length, message.result.relativePath);
        } else if (message.type === 'done') {
          finish(() => resolve(results));
        } else {
          finish(() => reject(new RepositoryError('STORAGE_ERROR', message.message)));
        }
      });
      worker.once('error', () =>
        finish(() => reject(new RepositoryError('STORAGE_ERROR', 'Code parser worker failed.'))),
      );
      worker.once('exit', (code) => {
        if (code !== 0) {
          finish(() => reject(new RepositoryError('STORAGE_ERROR', 'Code parser worker stopped.')));
        }
      });
    });
  }
}

type WorkerMessage =
  | { readonly type: 'file'; readonly index: number; readonly result: ParsedCodeFile }
  | { readonly type: 'done' }
  | { readonly type: 'error'; readonly message: string };

function isWorkerMessage(value: unknown): value is WorkerMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false;
  if (value.type === 'done') return true;
  if (value.type === 'error') return 'message' in value && typeof value.message === 'string';
  return value.type === 'file' && 'result' in value && typeof value.result === 'object';
}

function cancelled(): RepositoryError {
  return new RepositoryError('CODE_INDEX_CANCELLED', 'Code indexing was cancelled.');
}
