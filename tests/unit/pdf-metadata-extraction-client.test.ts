// @vitest-environment node

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { PdfMetadataExtractionClient } from '../../src/main/metadata/pdf-metadata-extraction-client';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe('PdfMetadataExtractionClient', () => {
  it('reports active extraction as cancelled when the client closes', async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'papermind-worker-test-'));
    temporaryRoots.push(temporaryRoot);
    const workerPath = path.join(temporaryRoot, 'holding-worker.cjs');
    await writeFile(workerPath, 'setInterval(() => undefined, 1000);\n', 'utf8');
    const client = new PdfMetadataExtractionClient(workerPath);

    const extraction = client.extract('unused.pdf');
    await client.close();

    await expect(extraction).resolves.toMatchObject({
      status: 'failed',
      issues: [expect.objectContaining({ code: 'EXTRACTION_CANCELLED' })],
    });
  });
});
