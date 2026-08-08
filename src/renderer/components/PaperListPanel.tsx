import { FileText, Search, Star, Upload } from 'lucide-react';

import type {
  LibraryOrganization,
  PaperListQuery,
  PaperSummary,
  ReadingStatus,
} from '../../shared/contracts/library';
import { BatchActionBar } from './BatchActionBar';
import { LibraryFilterPanel } from './LibraryFilterPanel';

interface PaperListPanelProps {
  readonly isBusy: boolean;
  readonly organization: LibraryOrganization;
  readonly papers: readonly PaperSummary[];
  readonly query: PaperListQuery;
  readonly selectedId: string | null;
  readonly selectedIds: readonly string[];
  readonly total: number;
  readonly onBatchApply: (input: {
    readonly addTagIds: readonly string[];
    readonly readingStatus?: ReadingStatus;
  }) => Promise<boolean>;
  readonly onClearSelection: () => void;
  readonly onImport: () => void;
  readonly onQueryChange: (query: PaperListQuery) => void;
  readonly onSelect: (id: string) => void;
  readonly onToggleSelected: (id: string) => void;
}

const STATUS_LABELS: Readonly<Record<ReadingStatus, string>> = {
  unread: 'Unread',
  reading: 'Reading',
  completed: 'Completed',
  shelved: 'Shelved',
};

export function PaperListPanel({
  isBusy,
  organization,
  papers,
  query,
  selectedId,
  selectedIds,
  total,
  onBatchApply,
  onClearSelection,
  onImport,
  onQueryChange,
  onSelect,
  onToggleSelected,
}: PaperListPanelProps) {
  const search = query.search ?? '';
  const hasActiveFilters = [
    search.trim().length > 0,
    (query.title?.trim().length ?? 0) > 0,
    (query.author?.trim().length ?? 0) > 0,
    query.year !== undefined,
    (query.tagIds?.length ?? 0) > 0,
    query.collectionId !== undefined,
    (query.readingStatuses?.length ?? 0) > 0,
    query.favorite !== undefined,
    (query.fullText?.trim().length ?? 0) > 0,
  ].some(Boolean);
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
            className="command-button bg-emerald-700 text-white hover:bg-emerald-800"
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
          <span className="sr-only">Search titles and authors</span>
          <input
            className="min-w-0 flex-1 bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
            disabled={isBusy}
            placeholder="Search titles and authors"
            type="search"
            value={search}
            onChange={(event) => {
              const next = { ...query, offset: 0 };
              if (event.target.value) next.search = event.target.value;
              else delete next.search;
              onQueryChange(next);
            }}
          />
        </label>
      </header>

      <LibraryFilterPanel
        isBusy={isBusy}
        organization={organization}
        query={query}
        onChange={onQueryChange}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {papers.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <div>
              <span className="mx-auto flex size-10 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-500">
                <FileText aria-hidden="true" className="size-5" />
              </span>
              <p className="mt-3 text-sm font-medium text-zinc-800">
                {hasActiveFilters ? 'No matching papers' : 'Library is empty'}
              </p>
            </div>
          </div>
        ) : (
          <ul aria-label="Papers" className="divide-y divide-zinc-100">
            {papers.map((paper) => (
              <li
                key={paper.id}
                className={`flex items-start ${paper.id === selectedId ? 'border-l-2 border-emerald-600 bg-emerald-50/60' : ''}`}
              >
                <label
                  className="flex h-11 w-9 shrink-0 items-center justify-center"
                  title="Select for batch action"
                >
                  <span className="sr-only">Select {paper.title}</span>
                  <input
                    checked={selectedIds.includes(paper.id)}
                    className="size-3.5 accent-emerald-700"
                    disabled={isBusy}
                    type="checkbox"
                    onChange={() => onToggleSelected(paper.id)}
                  />
                </label>
                <button
                  aria-current={paper.id === selectedId ? 'true' : undefined}
                  className="min-w-0 flex-1 px-1 py-3 pr-3 text-left hover:bg-zinc-50"
                  disabled={isBusy}
                  type="button"
                  onClick={() => onSelect(paper.id)}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="block min-w-0 flex-1 truncate text-sm font-medium text-zinc-900">
                      {paper.title}
                    </span>
                    {paper.isFavorite ? (
                      <Star
                        aria-label="Favorite"
                        className="size-3.5 shrink-0 fill-amber-500 text-amber-600"
                      />
                    ) : null}
                  </span>
                  <span className="mt-1 flex min-w-0 items-center gap-2 text-xs text-zinc-500">
                    <span className="min-w-0 flex-1 truncate">
                      {paper.authors.length > 0
                        ? paper.authors.join(', ')
                        : paper.file.originalFilename}
                    </span>
                    <span className="shrink-0">{STATUS_LABELS[paper.readingStatus]}</span>
                  </span>
                  {paper.metadataReviewStatus === 'pending' ? (
                    <span className="mt-1 block text-[10px] font-medium text-amber-700">
                      Metadata pending confirmation
                    </span>
                  ) : null}
                  {paper.tags.length > 0 ? (
                    <span className="mt-1 flex gap-1 overflow-hidden">
                      {paper.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag.id}
                          className="truncate rounded-sm bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600"
                        >
                          {tag.name}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedIds.length > 0 ? (
        <BatchActionBar
          isBusy={isBusy}
          organization={organization}
          selectedCount={selectedIds.length}
          onApply={onBatchApply}
          onClear={onClearSelection}
        />
      ) : null}
    </section>
  );
}
