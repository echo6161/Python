import { describe, expect, it } from 'vitest';

import {
  batchPaperUpdateSchema,
  paperDetailsUpdateSchema,
  paperImportBatchSchema,
  paperListQuerySchema,
  paperMetadataUpdateSchema,
} from '../../src/main/ipc/library-schemas';
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
  readingStatus: 'unread',
  isFavorite: false,
  metadataReviewStatus: 'pending',
  metadataEvidence: [
    { field: 'title', source: 'filename', confidence: 'unconfirmed', userEdited: false },
    { field: 'authors', source: 'none', confidence: 'unconfirmed', userEdited: false },
    { field: 'abstract', source: 'none', confidence: 'unconfirmed', userEdited: false },
    { field: 'year', source: 'none', confidence: 'unconfirmed', userEdited: false },
    { field: 'doi', source: 'none', confidence: 'unconfirmed', userEdited: false },
  ],
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
    pageCount: 1,
    textExtractionStatus: 'succeeded',
    importedAt: '2026-08-08T00:00:00.000Z',
  },
};

describe('library IPC output schemas', () => {
  it('accepts complete paper details in imported and duplicate results', () => {
    for (const status of ['imported', 'duplicate'] as const) {
      expect(
        paperImportBatchSchema.parse({
          cancelled: false,
          items: [{ originalFilename: 'paper.pdf', status, paper, warning: null, error: null }],
        }).items[0]?.status,
      ).toBe(status);
    }
  });

  it('accepts bounded Phase 4 filters and rejects unknown sorting fields', () => {
    expect(
      paperListQuerySchema.parse({
        title: 'Local',
        author: 'Ada',
        year: 2026,
        tagIds: ['550e8400-e29b-41d4-a716-446655440002'],
        readingStatuses: ['reading'],
        favorite: true,
        fullText: 'searchable result',
        sortBy: 'author',
        sortDirection: 'asc',
      }),
    ).toMatchObject({ sortBy: 'author', sortDirection: 'asc' });
    expect(() => paperListQuerySchema.parse({ sortBy: 'raw_sql' })).toThrow();
  });

  it('requires bounded, unique batch IDs and at least one actual change', () => {
    expect(() =>
      batchPaperUpdateSchema.parse({
        ids: [paper.id, paper.id],
        addTagIds: [],
        readingStatus: 'completed',
      }),
    ).toThrow();
    expect(() => batchPaperUpdateSchema.parse({ ids: [paper.id], addTagIds: [] })).toThrow();
  });

  it('requires explicit authors when confirming extracted metadata', () => {
    expect(() =>
      paperMetadataUpdateSchema.parse({
        id: paper.id,
        rowVersion: 1,
        title: 'Confirmed title',
        abstract: null,
        year: null,
        doi: null,
        venue: null,
        language: null,
      }),
    ).toThrow();
  });

  it('validates one atomic details update with a single optimistic version', () => {
    expect(
      paperDetailsUpdateSchema.parse({
        metadata: {
          id: paper.id,
          rowVersion: paper.rowVersion,
          title: paper.title,
          authors: [],
          abstract: null,
          year: null,
          doi: null,
          venue: null,
          language: null,
        },
        organization: {
          readingStatus: 'reading',
          isFavorite: true,
          tagIds: [],
          collectionIds: [],
        },
      }).organization,
    ).toMatchObject({ readingStatus: 'reading', isFavorite: true });
  });
});
