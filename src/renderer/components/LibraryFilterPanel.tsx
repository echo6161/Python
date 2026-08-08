import { useId, useState } from 'react';
import { ChevronDown, ChevronUp, Filter, RotateCcw, Star } from 'lucide-react';

import type {
  LibraryOrganization,
  PaperListQuery,
  ReadingStatus,
} from '../../shared/contracts/library';

export interface LibraryFilterPanelProps {
  readonly isBusy: boolean;
  readonly query: PaperListQuery;
  readonly organization: LibraryOrganization;
  readonly onChange: (next: PaperListQuery) => void;
}

const READING_STATUS_OPTIONS: readonly {
  readonly value: ReadingStatus;
  readonly label: string;
}[] = [
  { value: 'unread', label: 'Unread' },
  { value: 'reading', label: 'Reading' },
  { value: 'completed', label: 'Completed' },
  { value: 'shelved', label: 'Shelved' },
];

const INPUT_CLASS =
  'h-8 min-w-0 w-full rounded border border-zinc-300 bg-white px-2 text-xs text-zinc-800 outline-none focus:border-emerald-600';

type TextFilterKey = 'title' | 'author' | 'fullText';

function updateTextFilter(
  query: PaperListQuery,
  key: TextFilterKey,
  value: string,
): PaperListQuery {
  if (key === 'title') {
    const next = { ...query, offset: 0 };
    if (value) next.title = value;
    else delete next.title;
    return next;
  }

  if (key === 'author') {
    const next = { ...query, offset: 0 };
    if (value) next.author = value;
    else delete next.author;
    return next;
  }

  const next = { ...query, offset: 0 };
  if (value) next.fullText = value;
  else delete next.fullText;
  return next;
}

function toggleValue<T>(values: readonly T[] | undefined, value: T): readonly T[] {
  const current = values ?? [];
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

function activeFilterCount(query: PaperListQuery): number {
  return [
    query.title?.trim(),
    query.author?.trim(),
    query.year,
    query.tagIds?.length,
    query.collectionId,
    query.readingStatuses?.length,
    query.favorite,
    query.fullText?.trim(),
  ].filter(Boolean).length;
}

function clearFilters(query: PaperListQuery): PaperListQuery {
  const { limit, search, sortBy, sortDirection } = query;
  return {
    ...(search === undefined ? {} : { search }),
    ...(sortBy === undefined ? {} : { sortBy }),
    ...(sortDirection === undefined ? {} : { sortDirection }),
    ...(limit === undefined ? {} : { limit }),
    offset: 0,
  };
}

export function LibraryFilterPanel({
  isBusy,
  query,
  organization,
  onChange,
}: LibraryFilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const panelId = useId();
  const filterCount = activeFilterCount(query);

  const changeYear = (value: string) => {
    const next = { ...query, offset: 0 };
    if (value === '') {
      delete next.year;
    } else {
      next.year = Number(value);
    }
    onChange(next);
  };

  const changeTags = (tagId: string) => {
    const tagIds = toggleValue(query.tagIds, tagId);
    const next = { ...query, offset: 0 };
    if (tagIds.length > 0) {
      next.tagIds = tagIds;
    } else {
      delete next.tagIds;
    }
    onChange(next);
  };

  const changeReadingStatuses = (status: ReadingStatus) => {
    const readingStatuses = toggleValue(query.readingStatuses, status);
    const next = { ...query, offset: 0 };
    if (readingStatuses.length > 0) {
      next.readingStatuses = readingStatuses;
    } else {
      delete next.readingStatuses;
    }
    onChange(next);
  };

  return (
    <section className="border-b border-zinc-200 bg-zinc-50" aria-label="Library filters">
      <div className="flex h-9 items-center gap-2 px-3">
        <button
          aria-controls={panelId}
          aria-expanded={isExpanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-semibold text-zinc-700 hover:text-zinc-950 disabled:opacity-50"
          type="button"
          disabled={isBusy}
          onClick={() => setIsExpanded((current) => !current)}
        >
          <Filter aria-hidden="true" className="size-3.5 shrink-0" />
          <span>Filters</span>
          {filterCount > 0 ? (
            <span className="flex size-5 items-center justify-center rounded-full bg-emerald-700 text-[11px] tabular-nums text-white">
              {filterCount}
            </span>
          ) : null}
          {isExpanded ? (
            <ChevronUp aria-hidden="true" className="ml-auto size-3.5" />
          ) : (
            <ChevronDown aria-hidden="true" className="ml-auto size-3.5" />
          )}
        </button>
        {filterCount > 0 ? (
          <button
            aria-label="Clear filters"
            className="icon-button size-7"
            title="Clear filters"
            type="button"
            disabled={isBusy}
            onClick={() => onChange(clearFilters(query))}
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
          </button>
        ) : null}
      </div>

      {isExpanded ? (
        <div id={panelId} className="space-y-3 border-t border-zinc-200 px-3 py-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-medium text-zinc-600">
              Title
              <input
                className={`mt-1 ${INPUT_CLASS}`}
                maxLength={200}
                disabled={isBusy}
                value={query.title ?? ''}
                onChange={(event) => onChange(updateTextFilter(query, 'title', event.target.value))}
              />
            </label>
            <label className="text-[11px] font-medium text-zinc-600">
              Author
              <input
                className={`mt-1 ${INPUT_CLASS}`}
                maxLength={200}
                disabled={isBusy}
                value={query.author ?? ''}
                onChange={(event) =>
                  onChange(updateTextFilter(query, 'author', event.target.value))
                }
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-medium text-zinc-600">
              Year
              <input
                className={`mt-1 ${INPUT_CLASS}`}
                max={9999}
                min={1000}
                disabled={isBusy}
                type="number"
                value={query.year ?? ''}
                onChange={(event) => changeYear(event.target.value)}
              />
            </label>
            <label className="text-[11px] font-medium text-zinc-600">
              Collection
              <select
                aria-label="Collection"
                className={`mt-1 ${INPUT_CLASS}`}
                disabled={isBusy}
                value={query.collectionId ?? ''}
                onChange={(event) => {
                  const next = { ...query, offset: 0 };
                  if (event.target.value) next.collectionId = event.target.value;
                  else delete next.collectionId;
                  onChange(next);
                }}
              >
                <option value="">Any collection</option>
                {organization.collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-[11px] font-medium text-zinc-600">
            Full text
            <input
              className={`mt-1 ${INPUT_CLASS}`}
              maxLength={200}
              disabled={isBusy}
              value={query.fullText ?? ''}
              onChange={(event) =>
                onChange(updateTextFilter(query, 'fullText', event.target.value))
              }
            />
          </label>

          <fieldset>
            <legend className="text-[11px] font-medium text-zinc-600">Reading status</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1.5">
              {READING_STATUS_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex h-6 min-w-0 items-center gap-2 text-xs text-zinc-700"
                >
                  <input
                    checked={query.readingStatuses?.includes(option.value) ?? false}
                    className="size-3.5 accent-emerald-700"
                    disabled={isBusy}
                    type="checkbox"
                    onChange={() => changeReadingStatuses(option.value)}
                  />
                  <span className="truncate">{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-[11px] font-medium text-zinc-600">Tags</legend>
            {organization.tags.length > 0 ? (
              <div className="mt-1.5 max-h-24 space-y-1 overflow-y-auto pr-1">
                {organization.tags.map((tag) => (
                  <label
                    key={tag.id}
                    className="flex h-6 min-w-0 items-center gap-2 text-xs text-zinc-700"
                  >
                    <input
                      checked={query.tagIds?.includes(tag.id) ?? false}
                      className="size-3.5 accent-emerald-700"
                      disabled={isBusy}
                      type="checkbox"
                      onChange={() => changeTags(tag.id)}
                    />
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-sm border border-black/10"
                      style={{ backgroundColor: tag.color ?? '#a1a1aa' }}
                    />
                    <span className="truncate">{tag.name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-zinc-400">No tags</p>
            )}
          </fieldset>

          <label className="flex h-7 items-center gap-2 text-xs font-medium text-zinc-700">
            <input
              checked={query.favorite === true}
              className="size-3.5 accent-emerald-700"
              disabled={isBusy}
              type="checkbox"
              onChange={(event) => {
                const next = { ...query, offset: 0 };
                if (event.target.checked) next.favorite = true;
                else delete next.favorite;
                onChange(next);
              }}
            />
            <Star aria-hidden="true" className="size-3.5 text-amber-600" />
            Favorites only
          </label>

          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
            <label className="text-[11px] font-medium text-zinc-600">
              Sort by
              <select
                aria-label="Sort by"
                className={`mt-1 ${INPUT_CLASS}`}
                disabled={isBusy}
                value={query.sortBy ?? 'updatedAt'}
                onChange={(event) =>
                  onChange({
                    ...query,
                    sortBy: event.target.value as NonNullable<PaperListQuery['sortBy']>,
                    offset: 0,
                  })
                }
              >
                <option value="updatedAt">Updated</option>
                <option value="importedAt">Imported</option>
                <option value="title">Title</option>
                <option value="year">Year</option>
                <option value="author">Author</option>
              </select>
            </label>
            <label className="text-[11px] font-medium text-zinc-600">
              Direction
              <select
                aria-label="Sort direction"
                className={`mt-1 ${INPUT_CLASS}`}
                disabled={isBusy}
                value={query.sortDirection ?? 'desc'}
                onChange={(event) =>
                  onChange({
                    ...query,
                    sortDirection: event.target.value as NonNullable<
                      PaperListQuery['sortDirection']
                    >,
                    offset: 0,
                  })
                }
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </label>
          </div>
        </div>
      ) : null}
    </section>
  );
}
