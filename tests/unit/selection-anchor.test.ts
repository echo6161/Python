import { describe, expect, it } from 'vitest';

import { normalizeClientRects } from '../../src/renderer/pdf/selection-anchor';

describe('annotation geometry', () => {
  it('normalizes selection rectangles against the page instead of storing absolute pixels', () => {
    expect(
      normalizeClientRects(
        [{ left: 120, top: 240, right: 320, bottom: 280, width: 200, height: 40 }],
        { left: 20, top: 40, width: 400, height: 800 },
      ),
    ).toEqual([{ x: 0.25, y: 0.25, width: 0.5, height: 0.05 }]);
  });

  it('discards empty rectangles', () => {
    expect(
      normalizeClientRects([{ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }], {
        left: 0,
        top: 0,
        width: 100,
        height: 100,
      }),
    ).toEqual([]);
  });
});
