import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderGit2, Plus, RefreshCw, Trash2, Unlink } from 'lucide-react';

import type { Workspace } from '../../../../shared/contracts/workspace';
import type { WorkspaceRepositoryRef } from '../../../../shared/contracts/repository';
import { rendererLogger } from '../../../logger';
import { RepositoryBrowser } from './RepositoryBrowser';

export function WorkspaceRepositorySection({ workspace }: { readonly workspace: Workspace }) {
  const [repositories, setRepositories] = useState<readonly WorkspaceRepositoryRef[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const activeRequest = useRef<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await window.paperMind.repository.listForWorkspace(workspace.id);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setRepositories(result.value);
      setSelectedId((current) =>
        result.value.some(({ id }) => id === current) ? current : (result.value[0]?.id ?? null),
      );
    } catch (caught) {
      rendererLogger.error('Unable to load Workspace repositories', caught);
      setError('Workspace repositories could not be loaded.');
    }
  }, [workspace.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      if (activeRequest.current)
        void window.paperMind.repository.cancelRequest(activeRequest.current);
    };
  }, [load]);

  const choose = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await window.paperMind.repository.chooseAndLink(workspace.id);
      if (!result.ok) setError(result.error.message);
      else if (result.value) {
        setNotice('Repository linked. Local files were not copied or modified.');
        await load();
        setSelectedId(result.value.id);
      }
    } catch (caught) {
      rendererLogger.error('Unable to link repository', caught);
      setError('The selected repository could not be linked.');
    } finally {
      setBusy(false);
    }
  };

  const refresh = async (repository: WorkspaceRepositoryRef) => {
    const requestId = crypto.randomUUID();
    activeRequest.current = requestId;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await window.paperMind.repository.refresh({
        repositoryId: repository.id,
        requestId,
      });
      if (!result.ok) setError(result.error.message);
      else {
        setRepositories(
          (values) =>
            values?.map((value) =>
              value.id === result.value.id ? { ...value, ...result.value } : value,
            ) ?? [],
        );
        setNotice('Repository observation refreshed.');
      }
    } catch (caught) {
      rendererLogger.error('Unable to refresh repository', caught);
      setError('The repository observation could not be refreshed.');
    } finally {
      if (activeRequest.current === requestId) activeRequest.current = null;
      setBusy(false);
    }
  };

  const remove = async (repository: WorkspaceRepositoryRef) => {
    if (
      !window.confirm(
        `Remove "${repository.displayName}" from this Workspace? Local files and Git history will not be changed.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.paperMind.repository.removeFromWorkspace({
        workspaceId: workspace.id,
        repositoryId: repository.id,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setNotice('Repository removed from this Workspace. Local files were not changed.');
      await load();
    } catch (caught) {
      rendererLogger.error('Unable to remove Workspace repository', caught);
      setError('The repository could not be removed from this Workspace.');
    } finally {
      setBusy(false);
    }
  };

  const deleteReference = async (repository: WorkspaceRepositoryRef) => {
    if (
      !window.confirm(
        `Delete the PaperMind reference for "${repository.displayName}" from every Workspace? The local repository will not be changed.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.paperMind.repository.deleteReference({
        repositoryId: repository.id,
        confirmation: 'DELETE_REPOSITORY_REF',
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setNotice('PaperMind repository reference deleted. Local files were not changed.');
      await load();
    } catch (caught) {
      rendererLogger.error('Unable to delete repository reference', caught);
      setError('The PaperMind repository reference could not be deleted.');
    } finally {
      setBusy(false);
    }
  };

  const selected = repositories?.find(({ id }) => id === selectedId) ?? null;
  const archived = workspace.status === 'archived';
  return (
    <section
      aria-labelledby="workspace-repositories-heading"
      className="border-y border-zinc-200 bg-white"
    >
      <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
        <div>
          <h2 id="workspace-repositories-heading" className="text-sm font-semibold text-zinc-900">
            Repositories
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Read-only links to local Git repositories and source folders.
          </p>
        </div>
        <button
          className="command-button"
          disabled={archived || busy}
          type="button"
          onClick={() => void choose()}
        >
          <Plus aria-hidden="true" className="size-4" />
          Add repository
        </button>
      </header>
      {error || notice ? (
        <div
          className={`border-b px-5 py-2 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}
          role={error ? 'alert' : 'status'}
        >
          {error ?? notice}
          {error ? (
            <button
              className="ml-3 font-semibold underline"
              type="button"
              onClick={() => void load()}
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      {repositories === null ? (
        <p className="px-5 py-8 text-sm text-zinc-500">Loading repositories...</p>
      ) : repositories.length === 0 ? (
        <div className="px-5 py-8">
          <FolderGit2 aria-hidden="true" className="size-7 text-zinc-400" />
          <p className="mt-3 text-sm font-medium text-zinc-800">
            No repositories in this Workspace.
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Choose a Git repository or source folder. PaperMind will not copy or edit it.
          </p>
        </div>
      ) : (
        <div>
          <ul aria-label="Workspace repositories" className="divide-y divide-zinc-200">
            {repositories.map((repository) => (
              <li
                className={selectedId === repository.id ? 'bg-emerald-50' : ''}
                key={repository.id}
              >
                <div className="grid min-h-16 grid-cols-[minmax(0,1fr)_180px_auto] items-center gap-4 px-5 py-3">
                  <button
                    className="min-w-0 text-left"
                    type="button"
                    onClick={() => setSelectedId(repository.id)}
                  >
                    <span className="block truncate text-sm font-medium text-zinc-950">
                      {repository.displayName}
                    </span>
                    <span className="mt-1 block truncate text-xs text-zinc-500">
                      {repository.kind === 'git'
                        ? `${repository.currentBranch ?? 'Detached or unborn'} | ${repository.headCommit?.slice(0, 10) ?? 'No HEAD'}`
                        : 'Source folder'}
                    </span>
                  </button>
                  <span
                    className={`text-xs font-medium ${repository.availability === 'available' ? 'text-emerald-700' : 'text-amber-700'}`}
                  >
                    {availabilityLabel(repository.availability)}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      aria-label={`Refresh ${repository.displayName}`}
                      className="icon-button"
                      disabled={busy}
                      title="Refresh repository"
                      type="button"
                      onClick={() => void refresh(repository)}
                    >
                      <RefreshCw aria-hidden="true" className="size-4" />
                    </button>
                    <button
                      aria-label={`Remove ${repository.displayName} from Workspace`}
                      className="icon-button"
                      disabled={archived || busy}
                      title="Remove from Workspace"
                      type="button"
                      onClick={() => void remove(repository)}
                    >
                      <Unlink aria-hidden="true" className="size-4" />
                    </button>
                    <button
                      aria-label={`Delete ${repository.displayName} reference`}
                      className="icon-button text-red-700"
                      disabled={archived || busy}
                      title="Delete PaperMind reference"
                      type="button"
                      onClick={() => void deleteReference(repository)}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {selected ? <RepositoryBrowser key={selected.id} repository={selected} /> : null}
        </div>
      )}
    </section>
  );
}

function availabilityLabel(value: WorkspaceRepositoryRef['availability']): string {
  if (value === 'available') return 'Available';
  if (value === 'missing') return 'Missing or moved';
  if (value === 'permission_denied') return 'Permission denied';
  return 'Unavailable';
}
