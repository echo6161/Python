import { Search, X } from 'lucide-react';

import type { PdfSearchResult } from '../pdf/pdf-search';

interface PdfSearchPanelProps {
  readonly query: string;
  readonly results: readonly PdfSearchResult[];
  readonly indexedPages: number;
  readonly totalPages: number;
  readonly onClose: () => void;
  readonly onQuery: (value: string) => void;
  readonly onResult: (pageNumber: number) => void;
}

export function PdfSearchPanel({
  query,
  results,
  indexedPages,
  totalPages,
  onClose,
  onQuery,
  onResult,
}: PdfSearchPanelProps) {
  const indexing = indexedPages < totalPages;
  return (
    <aside className="absolute bottom-0 left-0 top-0 z-30 flex w-72 flex-col border-r border-zinc-200 bg-white shadow-lg">
      <header className="flex h-12 items-center gap-2 border-b border-zinc-200 px-3">
        <Search aria-hidden="true" className="size-4 text-zinc-500" />
        <input
          autoFocus
          aria-label="Search PDF"
          className="min-w-0 flex-1 text-sm outline-none"
          placeholder="Search in paper"
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
        <button
          aria-label="Close PDF search"
          className="icon-button"
          title="Close search"
          type="button"
          onClick={onClose}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </header>
      <div className="border-b border-zinc-100 px-3 py-2 text-xs text-zinc-500" role="status">
        {indexing
          ? `Indexing ${String(indexedPages)} of ${String(totalPages)} pages`
          : query
            ? `${String(results.length)} results`
            : `${String(totalPages)} pages indexed`}
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto">
        {results.map((result, index) => (
          <li
            key={`${String(result.pageNumber)}:${String(result.start)}:${String(index)}`}
            className="border-b border-zinc-100"
          >
            <button
              className="w-full px-3 py-3 text-left hover:bg-zinc-50"
              type="button"
              onClick={() => onResult(result.pageNumber)}
            >
              <span className="block text-xs font-semibold text-emerald-700">
                Page {result.pageNumber}
              </span>
              <span className="mt-1 block text-xs leading-5 text-zinc-600">{result.snippet}</span>
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}
