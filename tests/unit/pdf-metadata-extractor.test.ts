// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PdfMetadataExtractor,
  inferPaperMetadata,
  normalizeDoi,
  textItemsToLines,
  type StandardPdfMetadata,
} from '../../src/main/metadata/pdf-metadata-extractor';
import { writePdfFixture } from '../helpers/pdf-fixture';

const emptyMetadata: StandardPdfMetadata = {
  title: null,
  author: null,
  description: null,
  subject: null,
  keywords: null,
  doi: null,
};

describe('PDF metadata inference', () => {
  it('normalizes DOI syntax without performing a lookup', () => {
    expect(normalizeDoi('https://doi.org/10.1000/ABC.123.')).toBe('10.1000/abc.123');
    expect(normalizeDoi('doi: 10.5555/example(test)')).toBe('10.5555/example(test)');
    expect(normalizeDoi('ISBN 978-1-4028-9462-6')).toBeNull();
    expect(normalizeDoi('10.12/not-a-doi')).toBeNull();
  });

  it('prefers standard PDF metadata and preserves source and confidence', () => {
    const result = inferPaperMetadata({
      metadata: {
        ...emptyMetadata,
        title: 'Reliable PDF Title',
        author: 'Ada Lovelace; Alan Turing',
        description: 'A description explicitly stored in the document metadata.',
        doi: '10.1000/PAPER.META',
      },
      firstPageLines: [
        { text: 'Different first-page heading', fontSize: 24, y: 700 },
        { text: 'DOI: 10.1000/other', fontSize: 10, y: 650 },
      ],
    });

    expect(result.title).toEqual({
      value: 'Reliable PDF Title',
      source: 'pdf_metadata',
      confidence: 'medium',
    });
    expect(result.authors.value).toEqual(['Ada Lovelace', 'Alan Turing']);
    expect(result.authors.source).toBe('pdf_metadata');
    expect(result.authors.confidence).toBe('medium');
    expect(result.abstract.confidence).toBe('medium');
    expect(result.doi).toEqual({
      value: '10.1000/paper.meta',
      source: 'pdf_metadata',
      confidence: 'high',
    });
  });

  it('makes cautious first-page candidates only from visible evidence', () => {
    const result = inferPaperMetadata({
      metadata: emptyMetadata,
      firstPageLines: [
        { text: 'A Careful Study of Local Paper Libraries', fontSize: 24, y: 760 },
        { text: 'Authors: Grace Hopper; Barbara Liskov', fontSize: 11, y: 720 },
        { text: 'Abstract', fontSize: 12, y: 670 },
        {
          text: 'This paper studies reliable local metadata extraction without network access.',
          fontSize: 10,
          y: 645,
        },
        { text: 'DOI: 10.4242/PAPERMIND.2026', fontSize: 10, y: 620 },
        { text: 'Introduction', fontSize: 12, y: 590 },
      ],
    });

    expect(result.title).toEqual({
      value: 'A Careful Study of Local Paper Libraries',
      source: 'first_page',
      confidence: 'medium',
    });
    expect(result.authors).toEqual({
      value: ['Grace Hopper', 'Barbara Liskov'],
      source: 'first_page',
      confidence: 'medium',
    });
    expect(result.abstract.value).toContain('without network access');
    expect(result.abstract.source).toBe('first_page');
    expect(result.doi).toEqual({
      value: '10.4242/papermind.2026',
      source: 'first_page',
      confidence: 'medium',
    });
  });

  it('returns unconfirmed empty candidates when evidence is insufficient', () => {
    const result = inferPaperMetadata({
      metadata: { ...emptyMetadata, title: 'Untitled', author: 'Unknown' },
      firstPageLines: [
        { text: 'Page 1', fontSize: 10, y: 700 },
        { text: 'ordinary body text', fontSize: 10, y: 680 },
      ],
    });

    expect(result.title).toEqual({
      value: null,
      source: 'none',
      confidence: 'unconfirmed',
    });
    expect(result.authors).toEqual({
      value: null,
      source: 'none',
      confidence: 'unconfirmed',
    });
    expect(result.abstract.value).toBeNull();
    expect(result.doi.value).toBeNull();
  });

  it('rejects obvious producer, filename, and local-account placeholders', () => {
    const producerResult = inferPaperMetadata({
      metadata: {
        ...emptyMetadata,
        title: 'Microsoft Word - manuscript.docx',
        author: 'Administrator',
      },
      firstPageLines: [{ text: 'Evidence Based First Page Title', fontSize: 22, y: 700 }],
    });
    const filenameResult = inferPaperMetadata({
      metadata: { ...emptyMetadata, title: 'submitted-paper.pdf', author: 'owner' },
      firstPageLines: [],
    });

    expect(producerResult.title).toEqual({
      value: 'Evidence Based First Page Title',
      source: 'first_page',
      confidence: 'low',
    });
    expect(producerResult.authors.source).toBe('none');
    expect(filenameResult.title.source).toBe('none');
    expect(filenameResult.authors.source).toBe('none');
  });

  it('keeps an unlabelled first-page DOI at low confidence', () => {
    const result = inferPaperMetadata({
      metadata: emptyMetadata,
      firstPageLines: [
        { text: 'A Visible Research Paper Title', fontSize: 20, y: 700 },
        { text: 'Reference 10.7777/UNLABELLED.42', fontSize: 10, y: 600 },
      ],
    });

    expect(result.doi).toEqual({
      value: '10.7777/unlabelled.42',
      source: 'first_page',
      confidence: 'low',
    });
  });

  it('groups PDF.js text items into page lines for parsing and indexing', () => {
    const lines = textItemsToLines([
      { str: 'Paper', transform: [1, 0, 0, 20, 10, 700], height: 20, hasEOL: false },
      { str: 'Title', transform: [1, 0, 0, 20, 80, 700], height: 20, hasEOL: true },
      { str: 'Abstract', transform: [1, 0, 0, 12, 10, 650], height: 12, hasEOL: true },
    ]);

    expect(lines).toEqual([
      { text: 'Paper Title', fontSize: 20, y: 700 },
      { text: 'Abstract', fontSize: 12, y: 650 },
    ]);
  });

  it('reads every page of a local PDF through pdfjs-dist', async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'papermind-metadata-test-'));
    try {
      const filePath = await writePdfFixture(temporaryRoot, 'local.pdf', [
        'First page text',
        'Second page text',
      ]);
      const result = await new PdfMetadataExtractor().extract(filePath);

      expect(result.status).toBe('complete');
      expect(result.pageCount).toBe(2);
      expect(result.pages).toEqual([
        { pageNumber: 1, text: 'First page text', status: 'complete' },
        { pageNumber: 2, text: 'Second page text', status: 'complete' },
      ]);
      expect(result.title.source).toBe('none');
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('marks bounded page and text output as partial', async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'papermind-metadata-limit-test-'));
    try {
      const filePath = await writePdfFixture(temporaryRoot, 'bounded.pdf', [
        'First page text exceeds the configured bound',
        'Second page is beyond the configured page bound',
      ]);
      const result = await new PdfMetadataExtractor({
        maxPages: 1,
        maxTextCharactersPerPage: 10,
        maxTotalTextCharacters: 10,
      }).extract(filePath);

      expect(result.status).toBe('partial');
      expect(result.pageCount).toBe(2);
      expect(result.pages).toEqual([{ pageNumber: 1, text: 'First page', status: 'complete' }]);
      expect(result.issues.some(({ code }) => code === 'EXTRACTION_LIMIT_REACHED')).toBe(true);
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('rejects extraction input above its memory bound before PDF.js reads it', async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'papermind-input-limit-test-'));
    try {
      const filePath = await writePdfFixture(temporaryRoot, 'oversized-for-test.pdf', 'Body');
      const result = await new PdfMetadataExtractor({ maxInputBytes: 8 }).extract(filePath);

      expect(result.status).toBe('failed');
      expect(result.pages).toEqual([]);
      expect(result.issues[0]).toMatchObject({ code: 'EXTRACTION_LIMIT_REACHED' });
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });
});
