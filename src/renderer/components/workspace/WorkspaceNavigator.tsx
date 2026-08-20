import {
  Archive,
  BookOpen,
  FolderKanban,
  Library,
  PauseCircle,
  Plus,
  Settings,
  Waypoints,
} from 'lucide-react';

import type { Workspace } from '../../../shared/contracts/workspace';
import type { AppView } from '../Sidebar';

interface WorkspaceNavigatorProps {
  readonly appVersion: string | undefined;
  readonly currentId: string | null;
  readonly loading: boolean;
  readonly workspaces: readonly Workspace[];
  readonly onCreate: () => void;
  readonly onNavigateApp: (view: AppView) => void;
  readonly onSelect: (workspace: Workspace) => void;
}

export function WorkspaceNavigator({
  appVersion,
  currentId,
  loading,
  workspaces,
  onCreate,
  onNavigateApp,
  onSelect,
}: WorkspaceNavigatorProps) {
  const current = workspaces.filter(({ status }) => status !== 'archived');
  const archived = workspaces.filter(({ status }) => status === 'archived');

  return (
    <aside className="flex w-[248px] shrink-0 flex-col border-r border-zinc-800 bg-[#0d131c] text-zinc-300">
      <header className="flex h-16 items-center gap-3 border-b border-zinc-800 px-4">
        <span className="flex size-8 items-center justify-center rounded bg-emerald-400 text-zinc-950">
          <BookOpen aria-hidden="true" className="size-5" />
        </span>
        <span className="text-base font-semibold text-zinc-50">PaperMind</span>
      </header>

      <div className="border-b border-zinc-800 p-3">
        <button className="workspace-new-button" type="button" onClick={onCreate}>
          <Plus aria-hidden="true" className="size-4" /> New Workspace
        </button>
      </div>

      <nav aria-label="Workspaces" className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase text-zinc-500">Workspaces</p>
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

      <nav aria-label="PaperMind resources" className="border-t border-zinc-800 px-2 py-3">
        <ResourceButton
          icon={Waypoints}
          label="Zotero Library"
          onClick={() => onNavigateApp('zotero')}
        />
        <ResourceButton
          icon={Library}
          label="Legacy Library"
          onClick={() => onNavigateApp('library')}
        />
        <ResourceButton
          icon={Settings}
          label="Settings"
          onClick={() => onNavigateApp('settings')}
        />
      </nav>
      <footer className="border-t border-zinc-800 px-4 py-3 text-xs text-zinc-600">
        <div className="flex items-center gap-2 text-zinc-500">
          <span aria-hidden="true" className="size-2 rounded-full bg-emerald-400" /> Local first
        </div>
        <p className="mt-1">{appVersion ? `v${appVersion}` : 'Version unavailable'}</p>
      </footer>
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
              className={`flex min-h-10 w-full items-center gap-2 rounded px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                selected
                  ? 'bg-sky-950/70 text-sky-100'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
              }`}
              type="button"
              onClick={() => onSelect(workspace)}
            >
              <StatusIcon
                aria-hidden="true"
                className={`size-4 shrink-0 ${selected ? 'text-sky-400' : 'text-zinc-600'}`}
              />
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

function ResourceButton({
  icon: Icon,
  label,
  onClick,
}: {
  readonly icon: typeof Library;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      className="flex h-9 w-full items-center gap-3 rounded px-3 text-left text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-emerald-400"
      type="button"
      onClick={onClick}
    >
      <Icon aria-hidden="true" className="size-4" /> {label}
    </button>
  );
}
