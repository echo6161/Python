import { useEffect, useState } from 'react';
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

import type { WorkspaceRepositoryRef } from '../../../shared/contracts/repository';
import type { Workspace } from '../../../shared/contracts/workspace';
import type { ZoteroCollection } from '../../../shared/contracts/zotero';
import type { AppView } from '../Sidebar';
import type { WorkspaceTab } from './WorkspaceDashboard';

interface WorkspaceNavigatorProps {
  readonly appVersion: string | undefined;
  readonly currentId: string | null;
  readonly loading: boolean;
  readonly workspaces: readonly Workspace[];
  readonly onCreate: () => void;
  readonly onNavigateApp: (view: AppView) => void;
  readonly onNavigateWorkspace: (tab: WorkspaceTab) => void;
  readonly onSelect: (workspace: Workspace) => void;
}

export function WorkspaceNavigator({
  appVersion,
  currentId,
  loading,
  workspaces,
  onCreate,
  onNavigateApp,
  onNavigateWorkspace,
  onSelect,
}: WorkspaceNavigatorProps) {
  const current = workspaces.filter(({ status }) => status !== 'archived');
  const archived = workspaces.filter(({ status }) => status === 'archived');
  const [collections, setCollections] = useState<readonly ZoteroCollection[] | null>(null);
  const [repositoryState, setRepositoryState] = useState<{
    readonly workspaceId: string;
    readonly items: readonly WorkspaceRepositoryRef[];
  } | null>(null);

  useEffect(() => {
    let active = true;
    void window.paperMind.zotero
      .listCollections()
      .then((result) => {
        if (active) setCollections(result.ok ? result.value : []);
      })
      .catch(() => {
        if (active) setCollections([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!currentId) {
      return () => {
        active = false;
      };
    }
    void window.paperMind.repository
      .listForWorkspace(currentId)
      .then((result) => {
        if (active) {
          setRepositoryState({
            workspaceId: currentId,
            items: result.ok ? result.value : [],
          });
        }
      })
      .catch(() => {
        if (active) setRepositoryState({ workspaceId: currentId, items: [] });
      });
    return () => {
      active = false;
    };
  }, [currentId]);

  const repositories = currentId
    ? repositoryState?.workspaceId === currentId
      ? repositoryState.items
      : null
    : [];

  return (
    <aside className="workspace-navigator flex w-[248px] shrink-0 flex-col border-r border-zinc-800 bg-[#0d131c] text-zinc-300">
      <header className="workspace-navigator-brand flex h-16 items-center gap-3 border-b border-zinc-800 px-4">
        <span className="workspace-brand-mark flex size-8 items-center justify-center rounded bg-emerald-400 text-zinc-950">
          <BookOpen aria-hidden="true" className="size-5" />
        </span>
        <span className="workspace-brand-name text-base font-semibold text-zinc-50">PaperMind</span>
      </header>

      <div className="workspace-create-area border-b border-zinc-800 p-3">
        <button className="workspace-new-button" type="button" onClick={onCreate}>
          <Plus aria-hidden="true" className="size-4" /> New Workspace
        </button>
      </div>

      <nav
        aria-label="Research resources"
        className="workspace-list min-h-0 flex-1 overflow-y-auto px-2 py-3"
      >
        <details className="workspace-resource-group" open>
          <summary>
            <span>Workspaces</span>
            <small>{current.length}</small>
          </summary>
          {loading ? <p className="workspace-nav-message">Loading...</p> : null}
          {!loading && workspaces.length === 0 ? (
            <p className="workspace-nav-message">No Workspaces yet.</p>
          ) : null}
          <WorkspaceGroup currentId={currentId} items={current} onSelect={onSelect} />
          {archived.length > 0 ? (
            <div className="mt-3">
              <p className="workspace-nav-label">Archived</p>
              <WorkspaceGroup currentId={currentId} items={archived} onSelect={onSelect} />
            </div>
          ) : null}
        </details>

        <ResourceButton
          icon={Waypoints}
          label="Zotero Library"
          onClick={() => onNavigateApp('zotero')}
        />

        <details className="workspace-resource-group" open>
          <summary>
            <span>Collections</span>
            <small>{collections?.length ?? 0}</small>
          </summary>
          {collections === null ? <p className="workspace-nav-message">Loading...</p> : null}
          {collections?.length === 0 ? (
            <p className="workspace-nav-message">No Zotero collections available.</p>
          ) : null}
          <ul className="workspace-compact-resources">
            {collections?.slice(0, 6).map((collection) => (
              <li key={collection.ref.collectionKey}>
                <button type="button" onClick={() => onNavigateApp('zotero')}>
                  <BookOpen aria-hidden="true" className="size-3.5" />
                  <span title={collection.name}>{collection.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>

        <details className="workspace-resource-group" open>
          <summary>
            <span>Repositories</span>
            <small>{repositories?.length ?? 0}</small>
          </summary>
          {repositories === null ? <p className="workspace-nav-message">Loading...</p> : null}
          {repositories?.length === 0 ? (
            <p className="workspace-nav-message">No repositories linked.</p>
          ) : null}
          <ul className="workspace-compact-resources">
            {repositories?.slice(0, 6).map((repository) => (
              <li key={repository.id}>
                <button type="button" onClick={() => onNavigateWorkspace('code')}>
                  <FolderKanban aria-hidden="true" className="size-3.5" />
                  <span title={repository.displayName}>{repository.displayName}</span>
                  <i data-status={repository.availability} />
                </button>
              </li>
            ))}
          </ul>
        </details>
      </nav>

      <nav
        aria-label="PaperMind resources"
        className="workspace-resources border-t border-zinc-800 px-2 py-3"
      >
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
      <footer className="workspace-navigator-footer border-t border-zinc-800 px-4 py-3 text-xs text-zinc-600">
        <strong>Sync status</strong>
        <div className="mt-1 flex items-center gap-2 text-zinc-500">
          <span aria-hidden="true" className="workspace-local-dot size-2 rounded-full" /> Local
          first
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
              className={`workspace-nav-item ${selected ? 'is-selected' : ''}`}
              type="button"
              onClick={() => onSelect(workspace)}
            >
              <StatusIcon aria-hidden="true" className="workspace-nav-icon" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{workspace.name}</span>
                <span className="workspace-nav-status block text-xs capitalize">
                  {workspace.status}
                </span>
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
    <button className="workspace-resource-button" type="button" onClick={onClick}>
      <Icon aria-hidden="true" className="size-4" /> {label}
    </button>
  );
}
