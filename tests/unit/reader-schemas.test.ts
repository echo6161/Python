import { describe, expect, it } from 'vitest';

import { createAnnotationSchema, saveReadingStateSchema } from '../../src/main/ipc/reader-schemas';

const validAnnotation = {
  paperId: '550e8400-e29b-41d4-a716-446655440000',
  pageNumber: 2,
  selectedText: 'anchored text',
  textQuotePrefix: 'before ',
  textQuoteSuffix: ' after',
  textStart: 12,
  textEnd: 25,
  boundingRects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
  annotationType: 'highlight',
  color: 'yellow',
  comment: null,
};

describe('reader IPC schemas', () => {
  it('requires text anchors and normalized rectangles for annotations', () => {
    expect(createAnnotationSchema.parse(validAnnotation)).toEqual(validAnnotation);
    expect(createAnnotationSchema.safeParse({ ...validAnnotation, selectedText: '' }).success).toBe(
      false,
    );
    expect(
      createAnnotationSchema.safeParse({
        ...validAnnotation,
        boundingRects: [{ x: 0.9, y: 0.2, width: 0.3, height: 0.04 }],
      }).success,
    ).toBe(false);
  });

  it('bounds persisted scale and page values', () => {
    expect(
      saveReadingStateSchema.safeParse({
        paperId: validAnnotation.paperId,
        pageNumber: 1,
        scale: 1.25,
      }).success,
    ).toBe(true);
    expect(
      saveReadingStateSchema.safeParse({
        paperId: validAnnotation.paperId,
        pageNumber: 0,
        scale: 10,
      }).success,
    ).toBe(false);
  });
});
