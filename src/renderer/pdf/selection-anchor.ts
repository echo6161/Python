import type { BoundingRect, CreateAnnotationInput } from '../../shared/contracts/reader';

export type SelectionAnchor = Omit<
  CreateAnnotationInput,
  'paperId' | 'annotationType' | 'color' | 'comment'
>;

export function captureSelectionAnchor(
  selection: Selection,
  pageElement: HTMLElement,
  pageNumber: number,
): SelectionAnchor | null {
  if (selection.rangeCount !== 1 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!pageElement.contains(range.commonAncestorContainer)) return null;
  const startSpan = closestTextSpan(range.startContainer);
  const endSpan = closestTextSpan(range.endContainer);
  if (!startSpan || !endSpan) return null;

  const pageText = pageElement.dataset.pageText ?? '';
  const start =
    Number(startSpan.dataset.textStart) +
    boundaryOffset(range.startContainer, range.startOffset, startSpan);
  const end =
    Number(endSpan.dataset.textStart) +
    boundaryOffset(range.endContainer, range.endOffset, endSpan);
  const selectedText = selection.toString().replaceAll(/\s+/g, ' ').trim();
  if (!selectedText || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) {
    return null;
  }
  const pageBox = pageElement.getBoundingClientRect();
  const boundingRects = normalizeClientRects(Array.from(range.getClientRects()), pageBox);
  if (boundingRects.length === 0) return null;
  return {
    pageNumber,
    selectedText,
    textQuotePrefix: pageText.slice(Math.max(0, start - 120), start),
    textQuoteSuffix: pageText.slice(end, end + 120),
    textStart: start,
    textEnd: end,
    boundingRects,
  };
}

export function normalizeClientRects(
  rects: readonly Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>[],
  page: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
): readonly BoundingRect[] {
  if (page.width <= 0 || page.height <= 0) return [];
  return rects
    .filter(({ width, height }) => width > 0.5 && height > 0.5)
    .slice(0, 100)
    .map((rect) => {
      const x = clamp((rect.left - page.left) / page.width);
      const y = clamp((rect.top - page.top) / page.height);
      const right = clamp((rect.right - page.left) / page.width);
      const bottom = clamp((rect.bottom - page.top) / page.height);
      return {
        x,
        y,
        width: Math.max(0.0001, Number((right - x).toFixed(6))),
        height: Math.max(0.0001, Number((bottom - y).toFixed(6))),
      };
    });
}

function closestTextSpan(node: Node): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return (element?.closest('[data-text-start]') as HTMLElement | null) ?? null;
}

function boundaryOffset(node: Node, offset: number, span: HTMLElement): number {
  if (node.nodeType === Node.TEXT_NODE) return Math.min(offset, node.textContent?.length ?? 0);
  if (node === span) {
    let length = 0;
    for (let index = 0; index < Math.min(offset, span.childNodes.length); index += 1) {
      length += span.childNodes[index]?.textContent?.length ?? 0;
    }
    return length;
  }
  return 0;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, Number(value.toFixed(6))));
}
