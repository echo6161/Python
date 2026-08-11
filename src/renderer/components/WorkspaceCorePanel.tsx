import { useEffect, useState, type SyntheticEvent } from 'react';
import { Check, FolderKanban, Plus } from 'lucide-react';

import type { Workspace } from '../../shared/contracts/workspace';

export function WorkspaceCorePanel() {
  const [workspaces, setWorkspaces] = useState<readonly Workspace[]>([]);
  const [lastActiveId, setLastActiveId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      window.paperMind.workspace.list(),
      window.paperMind.workspace.getLastActive(),
    ])
      .then(([listResult, activeResult]) => {
        if (!active) return;
        if (!listResult.ok) throw new Error(listResult.error.message);
        if (!activeResult.ok) throw new Error(activeResult.error.message);
        setWorkspaces(listResult.value);
        setLastActiveId(activeResult.value?.id ?? null);
      })
      .catch(() => {
        if (active) setMessage('Workspace data could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, []);

  const createWorkspace = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      const result = await window.paperMind.workspace.create({
        name,
        description: '',
        researchGoal: '',
      });
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      setWorkspaces((current) => [result.value, ...current]);
      setLastActiveId((current) => current ?? result.value.id);
      setName('');
    } catch {
      setMessage('Workspace could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const selectWorkspace = async (workspaceId: string) => {
    setMessage(null);
    const result = await window.paperMind.workspace.setLastActive({ workspaceId });
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setLastActiveId(result.value?.id ?? null);
  };

  return (
    <section
      aria-labelledby="workspace-core-settings"
      className="border-y border-zinc-200 bg-white"
    >
      <header className="flex items-center gap-3 border-b border-zinc-200 px-5 py-3">
        <FolderKanban aria-hidden="true" className="size-4 text-zinc-500" />
        <h2 id="workspace-core-settings" className="text-sm font-semibold text-zinc-900">
          Research workspaces
        </h2>
      </header>

      <form
        className="flex gap-2 border-b border-zinc-200 px-5 py-4"
        onSubmit={(event) => void createWorkspace(event)}
      >
        <label className="sr-only" htmlFor="workspace-name">
          Workspace name
        </label>
        <input
          id="workspace-name"
          className="min-w-0 flex-1 border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-600"
          maxLength={200}
          placeholder="Workspace name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          className="inline-flex items-center gap-2 bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={busy || !name.trim()}
          type="submit"
        >
          <Plus aria-hidden="true" className="size-4" />
          Create
        </button>
      </form>

      {message ? (
        <p className="px-5 py-3 text-sm text-red-700" role="alert">
          {message}
        </p>
      ) : null}
      {workspaces.length === 0 ? (
        <p className="px-5 py-4 text-sm text-zinc-500">No research workspaces.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {workspaces.map((workspace) => (
            <li
              className="flex min-h-14 items-center justify-between gap-4 px-5"
              key={workspace.id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-900">{workspace.name}</p>
                <p className="text-xs capitalize text-zinc-500">{workspace.status}</p>
              </div>
              <button
                aria-label={`Set ${workspace.name} as last active`}
                className="inline-flex size-8 shrink-0 items-center justify-center border border-zinc-300 text-zinc-600 disabled:border-emerald-600 disabled:text-emerald-700"
                disabled={workspace.id === lastActiveId}
                title={
                  workspace.id === lastActiveId ? 'Last active Workspace' : 'Set as last active'
                }
                type="button"
                onClick={() => void selectWorkspace(workspace.id)}
              >
                <Check aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
