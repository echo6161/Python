import { Archive, FolderKanban, PauseCircle, Plus } from 'lucide-react';

import type { Workspace } from '../../../shared/contracts/workspace';

interface WorkspaceNavigatorProps {
  readonly currentId: string | null;
  readonly loading: boolean;
  readonly workspaces: readonly Workspace[];
  readonly onCreate: () => void;
  readonly onSelect: (workspace: Workspace) => void;
}

export function WorkspaceNavigator({
  currentId,
  loading,
  workspaces,
  onCreate,
  onSelect,
}: WorkspaceNavigatorProps) {
  const current = workspaces.filter(({ status }) => status !== 'archived');
  const archived = workspaces.filter(({ status }) => status === 'archived');

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <header className="flex h-16 items-center justify-between border-b border-zinc-200 px-4">
        <div>
          <p className="text-xs font-semibold uppercase text-zinc-500">Research</p>
          <h1 className="text-sm font-semibold text-zinc-950">Workspaces</h1>
        </div>
        <button
          aria-label="Create Workspace"
          className="icon-button"
          title="Create Workspace"
          type="button"
          onClick={onCreate}
        >
          <Plus aria-hidden="true" className="size-4" />
        </button>
      </header>

      <nav aria-label="Workspaces" className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {loading ? <p className="px-3 py-3 text-xs text-zinc-500">Loading...</p> : null}
        {!loading && workspaces.length === 0 ? (
          <p className="px-3 py-3 text-xs leading-5 text-zinc-500">No Workspaces yet.</p>
        ) : null}
        <WorkspaceGroup currentId={currentId} items={current} onSelect={onSelect} />
        {archived.length > 0 ? (
          <div className="mt-5">
            <p className="px-3 pb-1 text-xs font-semibold uppercase text-zinc-400">Archived</p>
            <WorkspaceGroup currentId={currentId} items={archived} onSelect={onSelect} />
          </div>
        ) : null}
      </nav>
    </aside>
  );
}

function WorkspaceGroup({
  currentId,
  items,
  onSelect,
}: {
  readonly currentId: string | null;
  readonly items: readonly Workspace[];
  readonly onSelect: (workspace: Workspace) => void;
}) {
  return (
    <ul className="space-y-1">
      {items.map((workspace) => {
        const selected = workspace.id === currentId;
        const StatusIcon =
          workspace.status === 'archived'
            ? Archive
            : workspace.status === 'paused'
              ? PauseCircle
              : FolderKanban;
        return (
          <li key={workspace.id}>
            <button
              aria-current={selected ? 'page' : undefined}
              className={`flex min-h-11 w-full items-center gap-2 rounded px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                selected ? 'bg-emerald-50 text-emerald-950' : 'text-zinc-700 hover:bg-zinc-100'
              }`}
              type="button"
              onClick={() => onSelect(workspace)}
            >
              <StatusIcon aria-hidden="true" className="size-4 shrink-0 text-zinc-500" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{workspace.name}</span>
                <span className="block text-xs capitalize text-zinc-500">{workspace.status}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
