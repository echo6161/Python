import { useState } from 'react';
import { Check, Tags, X } from 'lucide-react';

import type { LibraryOrganization, ReadingStatus } from '../../shared/contracts/library';

export interface BatchActionBarProps {
  readonly selectedCount: number;
  readonly organization: LibraryOrganization;
  readonly isBusy: boolean;
  readonly onApply: (input: {
    readonly addTagIds: readonly string[];
    readonly readingStatus?: ReadingStatus;
  }) => Promise<boolean>;
  readonly onClear: () => void;
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

export function BatchActionBar({
  selectedCount,
  organization,
  isBusy,
  onApply,
  onClear,
}: BatchActionBarProps) {
  const [tagIds, setTagIds] = useState<readonly string[]>([]);
  const [readingStatus, setReadingStatus] = useState<ReadingStatus | ''>('');

  const toggleTag = (tagId: string) => {
    setTagIds((current) =>
      current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId],
    );
  };

  const canApply = !isBusy && (tagIds.length > 0 || readingStatus !== '');

  const resetActions = () => {
    setTagIds([]);
    setReadingStatus('');
  };

  const apply = async () => {
    const applied = await onApply({
      addTagIds: tagIds,
      ...(readingStatus === '' ? {} : { readingStatus }),
    });
    if (applied) resetActions();
  };

  const clear = () => {
    resetActions();
    onClear();
  };

  return (
    <div
      aria-label="Batch actions"
      className="grid grid-cols-[minmax(0,1fr)_2rem] gap-2 border-t border-zinc-300 bg-white p-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
      role="toolbar"
    >
      <span className="self-center truncate text-xs font-semibold tabular-nums text-zinc-800">
        {selectedCount} selected
      </span>

      <button
        aria-label="Clear selection"
        className="icon-button"
        disabled={isBusy}
        title="Clear selection"
        type="button"
        onClick={clear}
      >
        <X aria-hidden="true" className="size-4" />
      </button>

      <div className="col-span-2 grid min-w-0 grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)_auto] gap-2">
        <details className="group relative min-w-0">
          <summary
            aria-disabled={isBusy}
            className={`flex h-8 min-w-0 list-none items-center gap-1.5 rounded border border-zinc-300 bg-white px-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 ${isBusy ? 'pointer-events-none opacity-50' : ''}`}
            onClick={(event) => {
              if (isBusy) event.preventDefault();
            }}
          >
            <Tags aria-hidden="true" className="size-3.5" />
            <span className="truncate">
              Tags{tagIds.length > 0 ? ` (${String(tagIds.length)})` : ''}
            </span>
          </summary>
          <div className="absolute bottom-10 left-0 z-40 max-h-52 w-52 overflow-y-auto border border-zinc-200 bg-white p-2 shadow-lg">
            {organization.tags.length > 0 ? (
              organization.tags.map((tag) => (
                <label
                  key={tag.id}
                  className="flex h-7 min-w-0 items-center gap-2 px-1 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  <input
                    checked={tagIds.includes(tag.id)}
                    className="size-3.5 accent-emerald-700"
                    disabled={isBusy}
                    type="checkbox"
                    onChange={() => toggleTag(tag.id)}
                  />
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-sm border border-black/10"
                    style={{ backgroundColor: tag.color ?? '#a1a1aa' }}
                  />
                  <span className="truncate">{tag.name}</span>
                </label>
              ))
            ) : (
              <p className="px-1 py-2 text-xs text-zinc-400">No tags</p>
            )}
          </div>
        </details>

        <label className="min-w-0">
          <span className="sr-only">Set reading status</span>
          <select
            aria-label="Set reading status"
            className="h-8 w-full min-w-0 rounded border border-zinc-300 bg-white px-2 text-xs text-zinc-700 outline-none focus:border-emerald-600"
            disabled={isBusy}
            value={readingStatus}
            onChange={(event) => setReadingStatus(event.target.value as ReadingStatus | '')}
          >
            <option value="">Keep status</option>
            {READING_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button
          className="command-button px-2"
          disabled={!canApply}
          type="button"
          onClick={() => void apply()}
        >
          <Check aria-hidden="true" className="size-3.5" />
          Apply
        </button>
      </div>
    </div>
  );
}
