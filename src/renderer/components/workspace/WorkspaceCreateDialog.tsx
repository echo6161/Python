import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Plus, X } from 'lucide-react';

import type { CreateWorkspaceInput } from '../../../shared/contracts/workspace';

interface WorkspaceCreateDialogProps {
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onCreate: (input: CreateWorkspaceInput) => Promise<void>;
}

export function WorkspaceCreateDialog({ busy, onClose, onCreate }: WorkspaceCreateDialogProps) {
  const [name, setName] = useState('');
  const [researchGoal, setResearchGoal] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    nameRef.current?.focus();
    return () => opener?.focus();
  }, []);

  const submit = (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    void onCreate({ name, description: '', researchGoal });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-6"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) onClose();
      }}
    >
      <section
        aria-labelledby="create-workspace-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-md border border-zinc-300 bg-white shadow-xl"
        role="dialog"
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h2 id="create-workspace-title" className="text-base font-semibold text-zinc-950">
            Create Workspace
          </h2>
          <button
            aria-label="Close"
            className="icon-button"
            disabled={busy}
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </header>
        <form className="space-y-4 px-5 py-5" onSubmit={submit}>
          <div>
            <label className="text-xs font-semibold text-zinc-700" htmlFor="new-workspace-name">
              Name
            </label>
            <input
              ref={nameRef}
              id="new-workspace-name"
              className="mt-1 h-10 w-full rounded border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              maxLength={200}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-700" htmlFor="new-workspace-goal">
              Research Goal
            </label>
            <textarea
              id="new-workspace-goal"
              className="mt-1 min-h-28 w-full resize-y rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              maxLength={10_000}
              placeholder="What do you want to understand, compare, or validate?"
              value={researchGoal}
              onChange={(event) => setResearchGoal(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4">
            <button className="text-button" disabled={busy} type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="command-button" disabled={busy || !name.trim()} type="submit">
              <Plus aria-hidden="true" className="size-4" />
              {busy ? 'Creating...' : 'Create Workspace'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
