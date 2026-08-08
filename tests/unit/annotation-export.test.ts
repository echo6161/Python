import { describe, expect, it } from 'vitest';

import { createAnnotationExport } from '../../src/main/reader/annotation-export';
import type { Annotation } from '../../src/shared/contracts/reader';

const annotation: Annotation = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  paperId: '550e8400-e29b-41d4-a716-446655440000',
  paperFileId: '550e8400-e29b-41d4-a716-446655440001',
  pageNumber: 3,
  selectedText: 'Quoted finding',
  textQuotePrefix: 'before',
  textQuoteSuffix: 'after',
  textStart: 10,
  textEnd: 24,
  boundingRects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
  annotationType: 'highlight',
  color: 'green',
  comment: 'Review this result.',
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
  rowVersion: 1,
};

describe('annotation export', () => {
  it('includes readable quotes, comments, pages, and stable ids in Markdown', () => {
    const exported = createAnnotationExport(
      { id: annotation.paperId, title: 'Paper' },
      [annotation],
      'markdown',
    );
    expect(exported.extension).toBe('md');
    expect(exported.content).toContain('## Highlight - page 3');
    expect(exported.content).toContain('> Quoted finding');
    expect(exported.content).toContain(`papermind:${annotation.id}`);
  });

  it('emits versioned structured JSON with full anchors', () => {
    const exported = createAnnotationExport(
      { id: annotation.paperId, title: 'Paper' },
      [annotation],
      'json',
    );
    const parsed = JSON.parse(exported.content) as {
      schemaVersion: number;
      annotations: Annotation[];
    };
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.annotations[0]?.boundingRects).toEqual(annotation.boundingRects);
    expect(parsed.annotations[0]?.textStart).toBe(10);
  });
});
