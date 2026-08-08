// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LibraryDatabase } from '../../src/main/database/library-database';
import { PaperFileStorage } from '../../src/main/library/file-storage';
import { initializeLibraryPaths } from '../../src/main/library/library-paths';
import { PaperLibraryService } from '../../src/main/library/paper-library-service';
import { createFailedExtractionResult } from '../../src/main/metadata/pdf-metadata-extractor';
import { writePdfFixture, writeStructuredPdfFixture } from '../helpers/pdf-fixture';

const temporaryRoots: string[] = [];

async function createHarness() {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'papermind-phase4-test-'));
  temporaryRoots.push(temporaryRoot);
  const sourceDirectory = path.join(temporaryRoot, 'source');
  const paths = await initializeLibraryPaths(path.join(temporaryRoot, 'PaperMind Library'));
  const database = new LibraryDatabase(paths.database);
  const storage = new PaperFileStorage(paths);
  const service = new PaperLibraryService(database, storage, paths);
  return { temporaryRoot, sourceDirectory, paths, database, storage, service };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe('paper metadata and library organization', () => {
  it('extracts local candidates, supports organization and filters, and preserves manual values', async () => {
    const harness = await createHarness();
    const metadataPdf = await writeStructuredPdfFixture(
      harness.sourceDirectory,
      'metadata-source.pdf',
      {
        metadata: {
          title: 'Reliable Metadata Title',
          author: 'Ada Lovelace; Alan Turing',
        },
        pages: [
          [
            { text: 'Visible Page Heading', fontSize: 24, y: 740 },
            { text: 'Abstract', fontSize: 12, y: 680 },
            {
              text: 'This abstract is visibly present on the first page for local extraction.',
              fontSize: 10,
              y: 655,
            },
            { text: 'DOI: 10.4242/PAPERMIND.2026', fontSize: 10, y: 620 },
            { text: 'Introduction', fontSize: 12, y: 590 },
          ],
          [{ text: 'Quantum pineapple fulltext needle', fontSize: 12, y: 700 }],
        ],
      },
    );
    const plainPdf = await writePdfFixture(
      harness.sourceDirectory,
      'no-standard-metadata.pdf',
      'Plain searchable body',
    );

    const imported = await harness.service.importPdfPaths([metadataPdf, plainPdf]);
    expect(imported.items.map(({ status }) => status)).toEqual(['imported', 'imported']);
    const extracted = imported.items[0]?.paper;
    const plain = imported.items[1]?.paper;
    expect(extracted).toBeTruthy();
    expect(plain).toBeTruthy();
    if (!extracted || !plain) return;

    expect(extracted).toMatchObject({
      title: 'Reliable Metadata Title',
      authors: ['Ada Lovelace', 'Alan Turing'],
      doi: '10.4242/papermind.2026',
      metadataReviewStatus: 'pending',
      file: { pageCount: 2, textExtractionStatus: 'succeeded' },
    });
    expect(extracted.abstract).toContain('visibly present');
    expect(extracted.abstract).not.toContain('10.4242');
    expect(extracted.metadataEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'title', source: 'pdf_metadata', confidence: 'medium' }),
        expect.objectContaining({ field: 'doi', source: 'first_page', confidence: 'medium' }),
      ]),
    );
    expect(plain).toMatchObject({
      title: 'no-standard-metadata',
      authors: [],
      doi: null,
      metadataReviewStatus: 'pending',
    });
    expect(plain.metadataEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'title', source: 'filename', confidence: 'unconfirmed' }),
        expect.objectContaining({ field: 'authors', source: 'none', confidence: 'unconfirmed' }),
      ]),
    );

    const manuallyConfirmed = await harness.service.updatePaperMetadata({
      id: extracted.id,
      rowVersion: extracted.rowVersion,
      title: 'Manually Corrected Title',
      authors: ['Grace Hopper'],
      abstract: 'Manually corrected abstract.',
      year: 2025,
      doi: 'https://doi.org/10.5555/MANUAL.42',
      venue: 'Local Systems',
      language: 'en',
    });
    expect(manuallyConfirmed).toMatchObject({
      title: 'Manually Corrected Title',
      authors: ['Grace Hopper'],
      doi: '10.5555/manual.42',
      metadataReviewStatus: 'confirmed',
    });
    expect(manuallyConfirmed.metadataEvidence.every(({ userEdited }) => userEdited)).toBe(true);

    const methodsTag = await harness.service.createTag({ name: 'Methods', color: '#0f766e' });
    const reviewTag = await harness.service.createTag({ name: 'Review', color: null });
    const collection = await harness.service.createCollection({
      name: 'Dissertation',
      description: 'Core reading',
    });
    const temporaryTag = await harness.service.createTag({ name: 'Temporary', color: null });
    const temporaryCollection = await harness.service.createCollection({
      name: 'Temporary collection',
      description: null,
    });
    const temporarilyOrganized = await harness.service.updatePaperOrganization({
      id: plain.id,
      rowVersion: plain.rowVersion,
      readingStatus: 'unread',
      isFavorite: false,
      tagIds: [temporaryTag.id],
      collectionIds: [temporaryCollection.id],
    });
    await harness.service.deleteTag(temporaryTag.id);
    const afterTagDeletion = await harness.service.getPaper(plain.id);
    expect(afterTagDeletion).toMatchObject({
      rowVersion: temporarilyOrganized.rowVersion + 1,
      tags: [],
      collections: [temporaryCollection],
    });
    await harness.service.deleteCollection(temporaryCollection.id);
    expect(await harness.service.getPaper(plain.id)).toMatchObject({
      rowVersion: temporarilyOrganized.rowVersion + 2,
      tags: [],
      collections: [],
    });
    expect(await harness.service.listOrganization()).toEqual({
      tags: [methodsTag, reviewTag],
      collections: [collection],
    });
    const organized = await harness.service.updatePaperOrganization({
      id: manuallyConfirmed.id,
      rowVersion: manuallyConfirmed.rowVersion,
      readingStatus: 'reading',
      isFavorite: true,
      tagIds: [methodsTag.id],
      collectionIds: [collection.id],
    });
    expect(organized).toMatchObject({ readingStatus: 'reading', isFavorite: true });

    await expect(
      harness.service.updatePaperDetails({
        metadata: {
          id: organized.id,
          rowVersion: organized.rowVersion,
          title: 'This title must roll back',
          authors: ['Rollback Author'],
          abstract: null,
          year: 2024,
          doi: null,
          venue: null,
          language: null,
        },
        organization: {
          readingStatus: 'completed',
          isFavorite: false,
          tagIds: ['550e8400-e29b-41d4-a716-446655449999'],
          collectionIds: [],
        },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await harness.service.getPaper(organized.id)).toMatchObject({
      title: 'Manually Corrected Title',
      readingStatus: 'reading',
      rowVersion: organized.rowVersion,
    });

    expect((await harness.service.listPapers({ author: 'Grace' })).items).toHaveLength(1);
    expect((await harness.service.listPapers({ title: 'Corrected' })).items).toHaveLength(1);
    expect((await harness.service.listPapers({ year: 2025 })).items).toHaveLength(1);
    expect((await harness.service.listPapers({ tagIds: [methodsTag.id] })).items).toHaveLength(1);
    expect((await harness.service.listPapers({ collectionId: collection.id })).items).toHaveLength(
      1,
    );
    expect((await harness.service.listPapers({ readingStatuses: ['reading'] })).items).toHaveLength(
      1,
    );
    expect((await harness.service.listPapers({ favorite: true })).items).toHaveLength(1);
    expect(
      (await harness.service.listPapers({ fullText: 'quantum pineapple' })).items,
    ).toHaveLength(1);
    expect(
      (await harness.service.listPapers({ fullText: 'visible pineapple' })).items,
    ).toHaveLength(1);

    await expect(
      harness.service.batchUpdatePapers({
        ids: [plain.id],
        addTagIds: ['550e8400-e29b-41d4-a716-446655449999'],
        readingStatus: 'completed',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await harness.service.getPaper(plain.id)).readingStatus).toBe('unread');

    await harness.service.batchUpdatePapers({
      ids: [plain.id],
      addTagIds: [methodsTag.id, reviewTag.id],
      readingStatus: 'completed',
    });
    expect((await harness.service.listPapers({ tagIds: [methodsTag.id] })).items).toHaveLength(2);
    expect(
      (await harness.service.listPapers({ readingStatuses: ['completed'] })).items[0]?.id,
    ).toBe(plain.id);
    expect(
      (await harness.service.listPapers({ sortBy: 'title', sortDirection: 'asc' })).items.map(
        ({ title }) => title,
      ),
    ).toEqual(['Manually Corrected Title', 'no-standard-metadata']);

    const extractedForAuthorSort = await harness.service.getPaper(extracted.id);
    await harness.service.updatePaperMetadata({
      id: extractedForAuthorSort.id,
      rowVersion: extractedForAuthorSort.rowVersion,
      title: extractedForAuthorSort.title,
      authors: ['Grace Hopper', 'Ada Secondary'],
      abstract: extractedForAuthorSort.abstract,
      year: extractedForAuthorSort.year,
      doi: extractedForAuthorSort.doi,
      venue: extractedForAuthorSort.venue,
      language: extractedForAuthorSort.language,
    });
    const plainForAuthorSort = await harness.service.getPaper(plain.id);
    await harness.service.updatePaperMetadata({
      id: plainForAuthorSort.id,
      rowVersion: plainForAuthorSort.rowVersion,
      title: plainForAuthorSort.title,
      authors: ['Bob First'],
      abstract: plainForAuthorSort.abstract,
      year: plainForAuthorSort.year,
      doi: plainForAuthorSort.doi,
      venue: plainForAuthorSort.venue,
      language: plainForAuthorSort.language,
    });
    expect(
      (await harness.service.listPapers({ sortBy: 'author', sortDirection: 'asc' })).items.map(
        ({ id }) => id,
      ),
    ).toEqual([plain.id, extracted.id]);

    await harness.database.close();
    const reopened = new LibraryDatabase(harness.paths.database);
    const persisted = await reopened.getPaper(extracted.id);
    expect(persisted).toMatchObject({
      title: 'Manually Corrected Title',
      authors: ['Grace Hopper', 'Ada Secondary'],
      doi: '10.5555/manual.42',
      readingStatus: 'reading',
      isFavorite: true,
      metadataReviewStatus: 'confirmed',
    });
    expect(
      persisted?.metadataEvidence.every(
        ({ source, confidence, userEdited }) =>
          source === 'manual' && confidence === 'confirmed' && userEdited,
      ),
    ).toBe(true);
    await reopened.close();
  });

  it('backfills the searchable text index for upgraded pending paper files', async () => {
    const harness = await createHarness();
    const source = await writePdfFixture(
      harness.sourceDirectory,
      'upgrade-backfill.pdf',
      'Legacy corpus backfill needle',
    );
    const imported = await harness.service.importPdfPaths([source]);
    const paper = imported.items[0]?.paper;
    expect(paper).toBeTruthy();
    if (!paper) return;

    await harness.database.close();
    const raw = new (await import('better-sqlite3')).default(harness.paths.database);
    raw.prepare('DELETE FROM paper_full_text WHERE paper_id = ?').run(paper.id);
    raw.prepare('DELETE FROM document_pages WHERE paper_file_id = ?').run(paper.file.id);
    raw
      .prepare(
        "UPDATE paper_files SET text_extraction_status = 'pending', extraction_error_code = NULL WHERE id = ?",
      )
      .run(paper.file.id);
    raw.close();

    const reopened = new LibraryDatabase(harness.paths.database);
    const cancelledService = new PaperLibraryService(reopened, harness.storage, harness.paths, {
      extract: () =>
        Promise.resolve(
          createFailedExtractionResult({
            code: 'EXTRACTION_CANCELLED',
            message: 'Test shutdown cancellation.',
            pageNumber: null,
          }),
        ),
    });
    await cancelledService.backfillPendingPaperTextExtractions();
    expect((await cancelledService.getPaper(paper.id)).file.textExtractionStatus).toBe('pending');

    const service = new PaperLibraryService(reopened, harness.storage, harness.paths);
    await service.backfillPendingPaperTextExtractions();
    expect((await service.listPapers({ fullText: 'backfill needle' })).items).toHaveLength(1);
    expect((await service.getPaper(paper.id)).file.textExtractionStatus).toBe('succeeded');
    await reopened.close();
  });
});
