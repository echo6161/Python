import { Worker } from 'node:worker_threads';

import {
  createFailedExtractionResult,
  type ExtractedPaperData,
  type PdfMetadataExtractionLimits,
} from './pdf-metadata-extractor';

export interface PdfMetadataExtractionClientOptions {
  readonly timeoutMs?: number;
  readonly extractionLimits?: Partial<PdfMetadataExtractionLimits>;
}

export const PDF_METADATA_WORKER_RESOURCE_LIMITS = Object.freeze({
  maxOldGenerationSizeMb: 384,
});

const DEFAULT_TIMEOUT_MS = 120_000;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function isExtractedPaperData(value: unknown): value is ExtractedPaperData {
  return (
    isRecord(value) &&
    (value.status === 'complete' || value.status === 'partial' || value.status === 'failed') &&
    Array.isArray(value.pages) &&
    Array.isArray(value.issues) &&
    isRecord(value.title) &&
    isRecord(value.authors) &&
    isRecord(value.abstract) &&
    isRecord(value.doi)
  );
}

function workerFailure(message: string): ExtractedPaperData {
  return createFailedExtractionResult({
    code: 'WORKER_FAILED',
    message,
    pageNumber: null,
  });
}

function cancelledExtraction(): ExtractedPaperData {
  return createFailedExtractionResult({
    code: 'EXTRACTION_CANCELLED',
    message: 'Local PDF metadata extraction was cancelled.',
    pageNumber: null,
  });
}

export class PdfMetadataExtractionClient {
  private readonly workers = new Set<Worker>();
  private readonly timeoutMs: number;
  private readonly extractionLimits: Partial<PdfMetadataExtractionLimits> | undefined;
  private closed = false;

  public constructor(
    private readonly workerPath: string,
    options: PdfMetadataExtractionClientOptions = {},
  ) {
    const requestedTimeout = options.timeoutMs;
    this.timeoutMs =
      typeof requestedTimeout === 'number' &&
      Number.isSafeInteger(requestedTimeout) &&
      requestedTimeout > 0
        ? requestedTimeout
        : DEFAULT_TIMEOUT_MS;
    this.extractionLimits = options.extractionLimits;
  }

  public extract(filePath: string, signal?: AbortSignal): Promise<ExtractedPaperData> {
    if (this.closed) {
      return Promise.resolve(cancelledExtraction());
    }

    let worker: Worker;
    try {
      worker = new Worker(this.workerPath, {
        workerData: {
          filePath,
          ...(this.extractionLimits ? { limits: this.extractionLimits } : {}),
        },
        resourceLimits: PDF_METADATA_WORKER_RESOURCE_LIMITS,
      });
    } catch {
      return Promise.resolve(workerFailure('The metadata extraction worker could not start.'));
    }

    this.workers.add(worker);
    return new Promise<ExtractedPaperData>((resolve) => {
      let settled = false;
      const finish = (result: ExtractedPaperData, terminate = true): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener('abort', cancel);
        this.workers.delete(worker);
        worker.removeAllListeners();
        if (terminate) void worker.terminate();
        resolve(result);
      };
      const timeout = setTimeout(() => {
        finish(
          this.closed
            ? cancelledExtraction()
            : createFailedExtractionResult({
                code: 'EXTRACTION_TIMEOUT',
                message: 'Local PDF metadata extraction timed out.',
                pageNumber: null,
              }),
        );
      }, this.timeoutMs);
      const cancel = (): void => finish(cancelledExtraction());
      if (signal?.aborted) {
        cancel();
        return;
      }
      signal?.addEventListener('abort', cancel, { once: true });

      worker.once('message', (message: unknown) => {
        finish(
          this.closed
            ? cancelledExtraction()
            : isExtractedPaperData(message)
              ? message
              : workerFailure('The metadata extraction worker returned an invalid result.'),
        );
      });
      worker.once('error', () => {
        finish(
          this.closed
            ? cancelledExtraction()
            : workerFailure('The metadata extraction worker failed.'),
        );
      });
      worker.once('exit', (code) => {
        if (this.closed) {
          finish(cancelledExtraction(), false);
          return;
        }
        if (code !== 0) {
          finish(workerFailure('The metadata extraction worker stopped unexpectedly.'), false);
        } else {
          finish(workerFailure('The metadata extraction worker exited without a result.'), false);
        }
      });
    });
  }

  public async close(): Promise<void> {
    this.closed = true;
    const activeWorkers = [...this.workers];
    this.workers.clear();
    await Promise.all(activeWorkers.map((worker) => worker.terminate()));
  }
}
