import { describe, expect, it } from 'vitest';

import { searchPdfIndex } from '../../src/renderer/pdf/pdf-search';

describe('PDF search', () => {
  it('finds case-insensitive matches on multiple pages with stable page anchors', () => {
    const results = searchPdfIndex(
      [
        { pageNumber: 1, text: 'A local-first research library.' },
        { pageNumber: 8, text: 'Privacy-first and LOCAL-FIRST by design.' },
      ],
      'local-first',
    );
    expect(results.map(({ pageNumber, start }) => ({ pageNumber, start }))).toEqual([
      { pageNumber: 1, start: 2 },
      { pageNumber: 8, start: 18 },
    ]);
  });

  it('returns no results for a blank query and respects the result cap', () => {
    expect(searchPdfIndex([{ pageNumber: 1, text: 'test test test' }], ' ')).toEqual([]);
    expect(searchPdfIndex([{ pageNumber: 1, text: 'test test test' }], 'test', 2)).toHaveLength(2);
  });
});
