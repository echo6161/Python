// @vitest-environment node

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { CodeParserClient } from '../../src/main/code-intelligence/code-parser-client';

const roots: string[] = [];
const input = {
  relativePath: 'wait.ts',
  language: 'typescript' as const,
  content: 'export const wait = true;\n',
  contentHash: 'a'.repeat(64),
  byteSize: 26,
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('CodeParserClient lifecycle', () => {
  it('maps an unresponsive worker to a bounded timeout', async () => {
    const workerPath = await unresponsiveWorker();
    await expect(new CodeParserClient(workerPath, 25).parseFiles([input])).rejects.toMatchObject({
      code: 'STORAGE_ERROR',
      message: 'Code parsing timed out.',
    });
  });

  it('terminates an active worker when cancelled', async () => {
    const workerPath = await unresponsiveWorker();
    const controller = new AbortController();
    const task = new CodeParserClient(workerPath, 5_000).parseFiles([input], controller.signal);
    setTimeout(() => controller.abort(), 20);

    await expect(task).rejects.toMatchObject({ code: 'CODE_INDEX_CANCELLED' });
  });
});

async function unresponsiveWorker(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'papermind-parser-worker-'));
  roots.push(root);
  const workerPath = path.join(root, 'worker.cjs');
  await writeFile(workerPath, 'setInterval(() => undefined, 1000);\n', 'utf8');
  return workerPath;
}
