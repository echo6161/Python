import { useState } from 'react';
import { FileText, Save, Trash2 } from 'lucide-react';

import type { PaperDetails, PaperMetadataUpdate } from '../../shared/contracts/library';

interface PaperDetailsPanelProps {
  readonly isBusy: boolean;
  readonly paper: PaperDetails | null;
  readonly onDelete: () => void;
  readonly onSave: (input: PaperMetadataUpdate) => void;
}

interface Draft {
  readonly title: string;
  readonly abstract: string;
  readonly year: string;
  readonly doi: string;
  readonly venue: string;
  readonly language: string;
}

const EMPTY_DRAFT: Draft = { title: '', abstract: '', year: '', doi: '', venue: '', language: '' };

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PaperDetailsPanel({ isBusy, paper, onDelete, onSave }: PaperDetailsPanelProps) {
  const [draft, setDraft] = useState<Draft>(() =>
    paper
      ? {
          title: paper.title,
          abstract: paper.abstract ?? '',
          year: paper.year?.toString() ?? '',
          doi: paper.doi ?? '',
          venue: paper.venue ?? '',
          language: paper.language ?? '',
        }
      : EMPTY_DRAFT,
  );

  if (!paper) {
    return (
      <section aria-labelledby="details-heading" className="flex min-w-0 flex-col bg-zinc-100">
        <header className="flex h-14 items-center border-b border-zinc-200 bg-white px-5">
          <h2 id="details-heading" className="text-sm font-semibold text-zinc-900">
            Paper details
          </h2>
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center">
          <div>
            <FileText aria-hidden="true" className="mx-auto size-10 text-zinc-300" />
            <p className="mt-4 text-sm font-medium text-zinc-700">Select or import a paper</p>
          </div>
        </div>
      </section>
    );
  }

  const updateDraft = (field: keyof Draft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  return (
    <section
      aria-labelledby="details-heading"
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-50"
    >
      <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-5">
        <div className="min-w-0">
          <h2 id="details-heading" className="text-sm font-semibold text-zinc-900">
            Paper details
          </h2>
          <p className="truncate text-xs text-zinc-500">{paper.file.originalFilename}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            aria-label="Remove paper"
            className="flex size-8 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-red-700 disabled:opacity-50"
            disabled={isBusy}
            title="Remove paper"
            type="button"
            onClick={onDelete}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
          <button
            className="flex h-8 items-center gap-2 rounded-md bg-zinc-900 px-3 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
            disabled={isBusy || draft.title.trim().length === 0}
            type="button"
            onClick={() =>
              onSave({
                id: paper.id,
                rowVersion: paper.rowVersion,
                title: draft.title.trim(),
                abstract: draft.abstract.trim() || null,
                year: draft.year ? Number(draft.year) : null,
                doi: draft.doi.trim() || null,
                venue: draft.venue.trim() || null,
                language: draft.language.trim() || null,
              })
            }
          >
            <Save aria-hidden="true" className="size-4" />
            Save
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-3xl space-y-5">
          <label className="block text-xs font-medium text-zinc-600">
            Title
            <input
              className="mt-1.5 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-emerald-600"
              maxLength={500}
              value={draft.title}
              onChange={(event) => updateDraft('title', event.target.value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block text-xs font-medium text-zinc-600">
              Year
              <input
                className="mt-1.5 h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600"
                max="9999"
                min="1000"
                type="number"
                value={draft.year}
                onChange={(event) => updateDraft('year', event.target.value)}
              />
            </label>
            <label className="block text-xs font-medium text-zinc-600">
              Language
              <input
                className="mt-1.5 h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600"
                maxLength={35}
                placeholder="e.g. en"
                value={draft.language}
                onChange={(event) => updateDraft('language', event.target.value)}
              />
            </label>
          </div>

          <label className="block text-xs font-medium text-zinc-600">
            DOI
            <input
              className="mt-1.5 h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600"
              maxLength={300}
              value={draft.doi}
              onChange={(event) => updateDraft('doi', event.target.value)}
            />
          </label>

          <label className="block text-xs font-medium text-zinc-600">
            Venue
            <input
              className="mt-1.5 h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-600"
              maxLength={500}
              value={draft.venue}
              onChange={(event) => updateDraft('venue', event.target.value)}
            />
          </label>

          <label className="block text-xs font-medium text-zinc-600">
            Abstract
            <textarea
              className="mt-1.5 min-h-32 w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-emerald-600"
              maxLength={100_000}
              value={draft.abstract}
              onChange={(event) => updateDraft('abstract', event.target.value)}
            />
          </label>

          <section aria-labelledby="managed-file-heading" className="border-t border-zinc-200 pt-5">
            <h3 id="managed-file-heading" className="text-xs font-semibold uppercase text-zinc-500">
              Managed PDF
            </h3>
            <dl className="mt-3 grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-xs">
              <dt className="text-zinc-500">Original name</dt>
              <dd className="min-w-0 truncate text-zinc-800">{paper.file.originalFilename}</dd>
              <dt className="text-zinc-500">Internal name</dt>
              <dd className="min-w-0 truncate font-mono text-zinc-700">
                {paper.file.internalFilename}
              </dd>
              <dt className="text-zinc-500">Size</dt>
              <dd className="text-zinc-800">{formatBytes(paper.file.byteSize)}</dd>
              <dt className="text-zinc-500">SHA-256</dt>
              <dd className="min-w-0 truncate font-mono text-zinc-700" title={paper.file.sha256}>
                {paper.file.sha256}
              </dd>
            </dl>
          </section>
        </div>
      </div>
    </section>
  );
}
