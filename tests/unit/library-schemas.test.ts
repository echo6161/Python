import { describe, expect, it } from 'vitest';

import { paperImportBatchSchema } from '../../src/main/ipc/library-schemas';
import type { PaperDetails } from '../../src/shared/contracts/library';

const paper: PaperDetails = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Local paper',
  abstract: null,
  year: null,
  doi: null,
  venue: null,
  language: null,
  authors: [],
  tags: [],
  collections: [],
  status: 'ready',
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
  rowVersion: 1,
  file: {
    id: '550e8400-e29b-41d4-a716-446655440001',
    originalFilename: 'paper.pdf',
    internalFilename: `${'a'.repeat(64)}.pdf`,
    byteSize: 100,
    sha256: 'a'.repeat(64),
    mimeType: 'application/pdf',
    importedAt: '2026-08-08T00:00:00.000Z',
  },
};

describe('library IPC output schemas', () => {
  it('accepts complete paper details in imported and duplicate results', () => {
    for (const status of ['imported', 'duplicate'] as const) {
      expect(
        paperImportBatchSchema.parse({
          cancelled: false,
          items: [{ originalFilename: 'paper.pdf', status, paper, error: null }],
        }).items[0]?.status,
      ).toBe(status);
    }
  });
});
