import { FileMinus, Trash2, X } from 'lucide-react';

import type { PaperDetails, PaperRemovalMode } from '../../shared/contracts/library';

interface DeletePaperDialogProps {
  readonly isBusy: boolean;
  readonly paper: PaperDetails;
  readonly onCancel: () => void;
  readonly onConfirm: (mode: PaperRemovalMode) => void;
}

export function DeletePaperDialog({ isBusy, paper, onCancel, onConfirm }: DeletePaperDialogProps) {
  return (
    <div
      aria-labelledby="remove-paper-title"
      aria-modal="true"
      className="absolute inset-0 z-40 flex items-center justify-center bg-zinc-950/45 p-6"
      role="dialog"
    >
      <div className="w-full max-w-lg rounded-md bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id="remove-paper-title" className="text-base font-semibold text-zinc-900">
              Remove paper?
            </h2>
            <p className="mt-1 truncate text-sm text-zinc-500">{paper.title}</p>
          </div>
          <button
            aria-label="Cancel removal"
            className="flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
            disabled={isBusy}
            title="Cancel"
            type="button"
            onClick={onCancel}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </header>

        <div className="space-y-3 px-5 py-5">
          <button
            className="flex w-full items-start gap-3 rounded-md border border-zinc-200 p-4 text-left hover:border-zinc-400 disabled:opacity-50"
            disabled={isBusy}
            type="button"
            onClick={() => onConfirm('record-only')}
          >
            <FileMinus aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-zinc-600" />
            <span>
              <span className="block text-sm font-semibold text-zinc-900">Remove record only</span>
              <span className="mt-1 block text-xs leading-5 text-zinc-500">
                Keep the managed PDF copy in the PaperMind library.
              </span>
            </span>
          </button>

          <button
            className="flex w-full items-start gap-3 rounded-md border border-red-200 p-4 text-left hover:border-red-500 disabled:opacity-50"
            disabled={isBusy}
            type="button"
            onClick={() => onConfirm('record-and-managed-file')}
          >
            <Trash2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-red-700" />
            <span>
              <span className="block text-sm font-semibold text-red-800">
                Remove record and managed copy
              </span>
              <span className="mt-1 block text-xs leading-5 text-zinc-500">
                The original PDF you imported remains untouched.
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
