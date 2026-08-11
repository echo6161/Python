import { useEffect, useRef } from 'react';
import { Archive, Trash2, X } from 'lucide-react';

interface WorkspaceLifecycleDialogProps {
  readonly action: 'archive' | 'delete';
  readonly busy: boolean;
  readonly workspaceName: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => Promise<void>;
}

export function WorkspaceLifecycleDialog({
  action,
  busy,
  workspaceName,
  onCancel,
  onConfirm,
}: WorkspaceLifecycleDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => opener?.focus();
  }, []);

  const deleting = action === 'delete';
  const title = deleting ? 'Delete Workspace?' : 'Archive Workspace?';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-6"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) onCancel();
      }}
    >
      <section
        aria-labelledby="workspace-lifecycle-title"
        aria-modal="true"
        className="w-full max-w-md rounded-md border border-zinc-300 bg-white shadow-xl"
        role="alertdialog"
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h2 id="workspace-lifecycle-title" className="text-base font-semibold text-zinc-950">
            {title}
          </h2>
          <button
            aria-label="Close"
            className="icon-button"
            disabled={busy}
            type="button"
            onClick={onCancel}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </header>
        <div className="px-5 py-5 text-sm leading-6 text-zinc-700">
          {deleting ? (
            <p>
              Delete <strong>{workspaceName}</strong> and its PaperMind-owned links? Zotero items,
              PDFs, annotations, and legacy library data will not be deleted.
            </p>
          ) : (
            <p>
              Archive <strong>{workspaceName}</strong>? Its research goal and Zotero links will be
              preserved and remain readable.
            </p>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-4">
          <button
            ref={cancelRef}
            className="text-button"
            disabled={busy}
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className={`command-button ${deleting ? '!bg-red-700 hover:!bg-red-800' : ''}`}
            disabled={busy}
            type="button"
            onClick={() => void onConfirm()}
          >
            {deleting ? (
              <Trash2 aria-hidden="true" className="size-4" />
            ) : (
              <Archive aria-hidden="true" className="size-4" />
            )}
            {busy ? 'Working...' : deleting ? 'Delete Workspace' : 'Archive Workspace'}
          </button>
        </footer>
      </section>
    </div>
  );
}
