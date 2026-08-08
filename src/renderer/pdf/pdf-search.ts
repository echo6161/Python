import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface IndexedPdfPage {
  readonly pageNumber: number;
  readonly text: string;
}

export interface PdfSearchResult {
  readonly pageNumber: number;
  readonly start: number;
  readonly end: number;
  readonly snippet: string;
}

export async function buildPdfSearchIndex(
  document: PDFDocumentProxy,
  onProgress?: (completed: number, total: number) => void,
  signal?: AbortSignal,
): Promise<readonly IndexedPdfPage[]> {
  const pages: IndexedPdfPage[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    if (signal?.aborted) throw new DOMException('Search indexing was cancelled.', 'AbortError');
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .filter(
        (item): item is typeof item & { readonly str: string; readonly hasEOL?: boolean } =>
          'str' in item,
      )
      .map((item) => `${item.str}${item.hasEOL ? '\n' : ' '}`)
      .join('')
      .replaceAll(/[ \t]+/g, ' ')
      .trim();
    pages.push({ pageNumber, text });
    onProgress?.(pageNumber, document.numPages);
  }
  return pages;
}

export function searchPdfIndex(
  pages: readonly IndexedPdfPage[],
  rawQuery: string,
  maximumResults = 500,
): readonly PdfSearchResult[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return [];
  const results: PdfSearchResult[] = [];
  for (const page of pages) {
    const haystack = page.text.toLocaleLowerCase();
    let from = 0;
    while (from < haystack.length && results.length < maximumResults) {
      const start = haystack.indexOf(query, from);
      if (start < 0) break;
      const end = start + query.length;
      const snippetStart = Math.max(0, start - 45);
      const snippetEnd = Math.min(page.text.length, end + 65);
      results.push({
        pageNumber: page.pageNumber,
        start,
        end,
        snippet: `${snippetStart > 0 ? '...' : ''}${page.text.slice(snippetStart, snippetEnd)}${snippetEnd < page.text.length ? '...' : ''}`,
      });
      from = Math.max(end, start + 1);
    }
    if (results.length >= maximumResults) break;
  }
  return results;
}
