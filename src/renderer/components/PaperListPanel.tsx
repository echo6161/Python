import { FileText, Search, Upload } from 'lucide-react';

import type { PaperSummary } from '../../shared/contracts/library';

interface PaperListPanelProps {
  readonly isBusy: boolean;
  readonly papers: readonly PaperSummary[];
  readonly search: string;
  readonly selectedId: string | null;
  readonly total: number;
  readonly onImport: () => void;
  readonly onSearch: (search: string) => void;
  readonly onSelect: (id: string) => void;
}

export function PaperListPanel({
  isBusy,
  papers,
  search,
  selectedId,
  total,
  onImport,
  onSearch,
  onSelect,
}: PaperListPanelProps) {
  return (
    <section
      aria-labelledby="library-heading"
      className="flex min-w-0 flex-col border-r border-zinc-200"
    >
      <header className="border-b border-zinc-200 px-4 py-3">
        <div className="flex h-8 items-center justify-between gap-3">
          <div>
            <h2 id="library-heading" className="text-sm font-semibold text-zinc-900">
              All papers
            </h2>
            <span className="text-xs tabular-nums text-zinc-500">{total} papers</span>
          </div>
          <button
            className="flex h-8 items-center gap-2 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            disabled={isBusy}
            title="Import PDF"
            type="button"
            onClick={onImport}
          >
            <Upload aria-hidden="true" className="size-4" />
            Import
          </button>
        </div>
        <label className="mt-3 flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 text-zinc-500 focus-within:border-emerald-600">
          <Search aria-hidden="true" className="size-4 shrink-0" />
          <span className="sr-only">Search library</span>
          <input
            className="min-w-0 flex-1 bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
            placeholder="Search library"
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
        </label>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {papers.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <div>
              <span className="mx-auto flex size-10 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-500">
                <FileText aria-hidden="true" className="size-5" />
              </span>
              <p className="mt-3 text-sm font-medium text-zinc-800">
                {search ? 'No matching papers' : 'Library is empty'}
              </p>
            </div>
          </div>
        ) : (
          <ul aria-label="Papers" className="divide-y divide-zinc-100">
            {papers.map((paper) => (
              <li key={paper.id}>
                <button
                  aria-current={paper.id === selectedId ? 'true' : undefined}
                  className={`w-full px-4 py-3 text-left hover:bg-zinc-50 ${
                    paper.id === selectedId
                      ? 'border-l-2 border-emerald-600 bg-emerald-50/60 pl-3.5'
                      : ''
                  }`}
                  type="button"
                  onClick={() => onSelect(paper.id)}
                >
                  <span className="block truncate text-sm font-medium text-zinc-900">
                    {paper.title}
                  </span>
                  <span className="mt-1 block truncate text-xs text-zinc-500">
                    {paper.authors.length > 0
                      ? paper.authors.join(', ')
                      : paper.file.originalFilename}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
