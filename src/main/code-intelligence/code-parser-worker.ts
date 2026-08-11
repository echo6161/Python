import { parentPort, workerData } from 'node:worker_threads';

import { parseCodeFile, type CodeParserInput } from './code-parser';

interface CodeParserWorkerData {
  readonly files: readonly CodeParserInput[];
}

const port = (() => {
  if (!parentPort) throw new Error('Code parsing must run inside a worker thread.');
  return parentPort;
})();

function validData(value: unknown): value is CodeParserWorkerData {
  return (
    typeof value === 'object' && value !== null && 'files' in value && Array.isArray(value.files)
  );
}

function run(): void {
  if (!validData(workerData)) throw new Error('Code parser worker received invalid data.');
  for (const [index, file] of workerData.files.entries()) {
    port.postMessage({ type: 'file', index, result: parseCodeFile(file) });
  }
  port.postMessage({ type: 'done' });
}

try {
  run();
} catch {
  port.postMessage({ type: 'error', message: 'The code parser worker failed.' });
}
