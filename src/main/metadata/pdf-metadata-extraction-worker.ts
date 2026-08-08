import { parentPort, workerData } from 'node:worker_threads';

import {
  createFailedExtractionResult,
  PdfMetadataExtractor,
  type PdfMetadataExtractionLimits,
} from './pdf-metadata-extractor';

interface PdfMetadataWorkerData {
  readonly filePath: string;
  readonly limits?: Partial<PdfMetadataExtractionLimits>;
}

function isWorkerData(value: unknown): value is PdfMetadataWorkerData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'filePath' in value &&
    typeof value.filePath === 'string' &&
    value.filePath.length > 0
  );
}

const port = (() => {
  if (!parentPort) {
    throw new Error('PDF metadata extraction must run inside a worker thread.');
  }
  return parentPort;
})();

async function run(): Promise<void> {
  if (!isWorkerData(workerData)) {
    port.postMessage(
      createFailedExtractionResult({
        code: 'WORKER_FAILED',
        message: 'The metadata extraction worker received invalid input.',
        pageNumber: null,
      }),
    );
    return;
  }

  const extractor = new PdfMetadataExtractor(workerData.limits);
  port.postMessage(await extractor.extract(workerData.filePath));
}

void run().catch(() => {
  port.postMessage(
    createFailedExtractionResult({
      code: 'WORKER_FAILED',
      message: 'The metadata extraction worker failed.',
      pageNumber: null,
    }),
  );
});
