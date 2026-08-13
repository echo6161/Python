import { useEffect, useRef } from 'react';
import { Trash2, X } from 'lucide-react';

interface PlanTaskDeleteDialogProps {
  readonly busy: boolean;
  readonly error: string | null;
  readonly returnFocusTo: HTMLElement;
  readonly taskTitle: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function PlanTaskDeleteDialog({
  busy,
  error,
  returnFocusTo,
  taskTitle,
  onCancel,
  onConfirm,
}: PlanTaskDeleteDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    return () => {
      if (returnFocusTo.isConnected) returnFocusTo.focus();
    };
  }, [returnFocusTo]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) {
          event.preventDefault();
          onCancel();
          return;
        }
        if (event.key !== 'Tab') return;
        const focusable =
          dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <section
        ref={dialogRef}
        aria-describedby="delete-plan-task-description"
        aria-labelledby="delete-plan-task-title"
        aria-modal="true"
        className="w-full max-w-md border border-zinc-700 bg-[#0d131c] shadow-2xl"
        role="alertdialog"
      >
        <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-100" id="delete-plan-task-title">
            Delete task?
          </h2>
          <button
            aria-label="Close task deletion"
            className="icon-button"
            disabled={busy}
            type="button"
            onClick={onCancel}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </header>
        <div className="px-5 py-5 text-sm leading-6 text-zinc-300">
          <p id="delete-plan-task-description">
            Delete <strong>{taskTitle}</strong> from this Plan? External papers, questions,
            memories, repositories, and source files are not deleted.
          </p>
          {error ? (
            <p
              className="mt-3 border border-red-900 bg-red-950/40 px-3 py-2 text-red-200"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>
        <footer className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-4">
          <button
            ref={cancelRef}
            className="secondary-button"
            disabled={busy}
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="research-plan-danger-button"
            disabled={busy}
            type="button"
            onClick={onConfirm}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            {busy ? 'Deleting...' : 'Confirm delete task'}
          </button>
        </footer>
      </section>
    </div>
  );
}
