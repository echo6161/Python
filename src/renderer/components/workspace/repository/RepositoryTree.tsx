import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, File, Folder, Link2 } from 'lucide-react';

import type {
  RepositoryRef,
  RepositoryTreeEntry,
  RepositoryTreePage,
} from '../../../../shared/contracts/repository';
import { rendererLogger } from '../../../logger';

interface DirectoryState {
  readonly entries: readonly RepositoryTreeEntry[];
  readonly hasNext: boolean;
  readonly nextStart: number;
  readonly loading: boolean;
  readonly error: string | null;
}

interface RepositoryTreeProps {
  readonly repository: RepositoryRef;
  readonly onOpenFile: (relativePath: string) => void;
}

export function RepositoryTree({ repository, onOpenFile }: RepositoryTreeProps) {
  const [directories, setDirectories] = useState<Readonly<Record<string, DirectoryState>>>({});
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set(['']));
  const activeRequests = useRef(new Set<string>());

  const load = useCallback(
    async (directory: string, start = 0) => {
      const requestId = crypto.randomUUID();
      activeRequests.current.add(requestId);
      setDirectories((values) => ({
        ...values,
        [directory]: {
          entries: start === 0 ? [] : (values[directory]?.entries ?? []),
          hasNext: false,
          nextStart: start,
          loading: true,
          error: null,
        },
      }));
      try {
        const result = await window.paperMind.repository.listTree({
          repositoryId: repository.id,
          requestId,
          relativePath: directory,
          start,
          limit: 50,
        });
        if (!result.ok) {
          setDirectoryError(setDirectories, directory, result.error.message);
          return;
        }
        setDirectories((values) => ({
          ...values,
          [directory]: pageState(
            result.value,
            start === 0 ? [] : (values[directory]?.entries ?? []),
          ),
        }));
      } catch (error) {
        rendererLogger.error('Unable to list repository tree', error);
        setDirectoryError(setDirectories, directory, 'The source tree could not be loaded.');
      } finally {
        activeRequests.current.delete(requestId);
      }
    },
    [repository.id],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(''), 0);
    const requests = activeRequests.current;
    return () => {
      window.clearTimeout(timer);
      for (const requestId of requests) void window.paperMind.repository.cancelRequest(requestId);
      requests.clear();
    };
  }, [load]);

  const toggle = (entry: RepositoryTreeEntry) => {
    if (entry.kind !== 'directory') return;
    setExpanded((values) => {
      const next = new Set(values);
      if (next.has(entry.relativePath)) next.delete(entry.relativePath);
      else next.add(entry.relativePath);
      return next;
    });
    if (!directories[entry.relativePath]) void load(entry.relativePath);
  };

  return (
    <nav
      aria-label={`${repository.displayName} source tree`}
      className="min-h-72 overflow-auto border-r border-zinc-200 bg-zinc-50"
    >
      <DirectoryRows
        directory=""
        directories={directories}
        expanded={expanded}
        level={0}
        onLoad={load}
        onOpenFile={onOpenFile}
        onToggle={toggle}
      />
    </nav>
  );
}

function DirectoryRows({
  directory,
  directories,
  expanded,
  level,
  onLoad,
  onOpenFile,
  onToggle,
}: {
  readonly directory: string;
  readonly directories: Readonly<Record<string, DirectoryState>>;
  readonly expanded: ReadonlySet<string>;
  readonly level: number;
  readonly onLoad: (directory: string, start?: number) => Promise<void>;
  readonly onOpenFile: (relativePath: string) => void;
  readonly onToggle: (entry: RepositoryTreeEntry) => void;
}) {
  const state = directories[directory];
  if (!state || (state.loading && state.entries.length === 0)) {
    return <p className="px-3 py-3 text-xs text-zinc-500">Loading source tree...</p>;
  }
  if (state.error) {
    return (
      <div className="px-3 py-3 text-xs text-red-700" role="alert">
        {state.error}
        <button
          className="ml-2 font-semibold underline"
          type="button"
          onClick={() => void onLoad(directory)}
        >
          Retry
        </button>
      </div>
    );
  }
  return (
    <ul aria-label={directory ? `${directory} entries` : 'Repository root entries'}>
      {state.entries.map((entry) => {
        const isExpanded = expanded.has(entry.relativePath);
        const Icon = entry.kind === 'directory' ? Folder : entry.kind === 'symlink' ? Link2 : File;
        return (
          <li key={entry.relativePath}>
            <button
              aria-expanded={entry.kind === 'directory' ? isExpanded : undefined}
              className="flex h-8 w-full items-center gap-1.5 truncate pr-2 text-left text-xs text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:text-zinc-400"
              disabled={entry.kind === 'symlink'}
              style={{ paddingLeft: `${String(8 + level * 16)}px` }}
              title={entry.kind === 'symlink' ? 'Links are not followed' : entry.name}
              type="button"
              onClick={() =>
                entry.kind === 'file' ? onOpenFile(entry.relativePath) : onToggle(entry)
              }
            >
              {entry.kind === 'directory' ? (
                isExpanded ? (
                  <ChevronDown aria-hidden="true" className="size-3.5" />
                ) : (
                  <ChevronRight aria-hidden="true" className="size-3.5" />
                )
              ) : (
                <span className="w-3.5" />
              )}
              <Icon aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{entry.name}</span>
            </button>
            {entry.kind === 'directory' && isExpanded ? (
              <DirectoryRows
                directory={entry.relativePath}
                directories={directories}
                expanded={expanded}
                level={level + 1}
                onLoad={onLoad}
                onOpenFile={onOpenFile}
                onToggle={onToggle}
              />
            ) : null}
          </li>
        );
      })}
      {state.hasNext ? (
        <li className="px-3 py-2">
          <button
            className="text-button"
            disabled={state.loading}
            type="button"
            onClick={() => void onLoad(directory, state.nextStart)}
          >
            {state.loading ? 'Loading...' : 'Load more'}
          </button>
        </li>
      ) : null}
      {state.entries.length === 0 ? (
        <li className="px-3 py-4 text-xs text-zinc-500">No visible source files.</li>
      ) : null}
    </ul>
  );
}

function pageState(
  page: RepositoryTreePage,
  previous: readonly RepositoryTreeEntry[],
): DirectoryState {
  return {
    entries: [...previous, ...page.entries],
    hasNext: page.hasNext,
    nextStart: page.start + page.limit,
    loading: false,
    error: null,
  };
}

function setDirectoryError(
  setDirectories: React.Dispatch<React.SetStateAction<Readonly<Record<string, DirectoryState>>>>,
  directory: string,
  message: string,
) {
  setDirectories((values) => ({
    ...values,
    [directory]: {
      entries: values[directory]?.entries ?? [],
      hasNext: false,
      nextStart: 0,
      loading: false,
      error: message,
    },
  }));
}
