import { useEffect, useRef, useState } from 'react';
import { Braces, ExternalLink, RefreshCw, Search, Square } from 'lucide-react';

import type {
  CodeFileSearchResult,
  CodeIndexProgress,
  CodeIndexStatus,
  CodeSearchPage,
  CodeSymbolSearchResult,
  CodeTextSearchResult,
} from '../../../../shared/contracts/code-intelligence';
import type { RepositoryRef } from '../../../../shared/contracts/repository';
import { rendererLogger } from '../../../logger';

type SearchKind = 'files' | 'symbols' | 'text';
type SearchResult = CodeFileSearchResult | CodeSymbolSearchResult | CodeTextSearchResult;

interface CodeSearchPanelProps {
  readonly repository: RepositoryRef;
  readonly onNavigate: (relativePath: string, line: number) => void;
  readonly onOpenInVscode: (relativePath: string, line: number) => void;
}

export function CodeSearchPanel({ repository, onNavigate, onOpenInVscode }: CodeSearchPanelProps) {
  const [status, setStatus] = useState<CodeIndexStatus | null>(null);
  const [progress, setProgress] = useState<CodeIndexProgress | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const activeRequestRef = useRef<string | null>(null);
  const [kind, setKind] = useState<SearchKind>('symbols');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState<CodeSearchPage<SearchResult> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const unsubscribe = window.paperMind.codeIntelligence.onProgress((event) => {
      if (event.repositoryId === repository.id && !disposed) setProgress(event);
    });
    void window.paperMind.codeIntelligence
      .getStatus(repository.id)
      .then((result) => {
        if (disposed) return;
        if (result.ok) setStatus(result.value);
        else setError(result.error.message);
      })
      .catch((caught: unknown) => {
        rendererLogger.error('Unable to load code index status', caught);
        if (!disposed) setError('Code index status could not be loaded.');
      });
    return () => {
      disposed = true;
      unsubscribe();
      if (activeRequestRef.current)
        void window.paperMind.codeIntelligence.cancelIndex(activeRequestRef.current);
    };
  }, [repository.id]);

  const runIndex = async (mode: 'incremental' | 'rebuild') => {
    const requestId = crypto.randomUUID();
    activeRequestRef.current = requestId;
    setActiveRequestId(requestId);
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const result = await window.paperMind.codeIntelligence.runIndex({
        repositoryId: repository.id,
        requestId,
        mode,
      });
      if (result.ok) setStatus(result.value);
      else setError(result.error.message);
    } catch (caught) {
      rendererLogger.error('Unable to build code index', caught);
      setError('The code index could not be built.');
    } finally {
      activeRequestRef.current = null;
      setActiveRequestId(null);
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!activeRequestId) return;
    const result = await window.paperMind.codeIntelligence.cancelIndex(activeRequestId);
    if (!result.ok) setError(result.error.message);
  };

  const search = async (offset = 0) => {
    const normalized = query.trim();
    if (!normalized) return;
    setBusy(true);
    setError(null);
    try {
      const input = { repositoryId: repository.id, query: normalized, offset, limit: 20 };
      const result =
        kind === 'files'
          ? await window.paperMind.codeIntelligence.searchFiles(input)
          : kind === 'symbols'
            ? await window.paperMind.codeIntelligence.searchSymbols(input)
            : await window.paperMind.codeIntelligence.searchText(input);
      if (result.ok) setPage(result.value);
      else setError(result.error.message);
    } catch (caught) {
      rendererLogger.error('Unable to search code index', caught);
      setError('Code search could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const isIndexing = Boolean(activeRequestId) || status?.status === 'indexing';
  return (
    <section aria-labelledby="code-search-heading" className="border-b border-zinc-200 bg-white">
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-2">
        <div>
          <h3
            id="code-search-heading"
            className="flex items-center gap-2 text-sm font-semibold text-zinc-900"
          >
            <Braces aria-hidden="true" className="size-4" /> Code search
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">{statusLabel(status)}</p>
        </div>
        <div className="flex items-center gap-1">
          {isIndexing ? (
            <button
              className="text-button inline-flex items-center gap-1"
              type="button"
              onClick={() => void cancel()}
            >
              <Square aria-hidden="true" className="size-3.5" /> Cancel
            </button>
          ) : (
            <>
              <button
                className="text-button inline-flex items-center gap-1"
                type="button"
                onClick={() => void runIndex('incremental')}
              >
                <RefreshCw aria-hidden="true" className="size-4" />{' '}
                {status?.snapshotIdentity ? 'Update index' : 'Build index'}
              </button>
              {status?.snapshotIdentity ? (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => void runIndex('rebuild')}
                >
                  Rebuild
                </button>
              ) : null}
            </>
          )}
        </div>
      </header>
      {progress && isIndexing ? (
        <p
          className="border-t border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-600"
          role="status"
        >
          {progress.phase} {String(progress.processedFiles)}/{String(progress.totalFiles)}
          {progress.currentFile ? ` | ${progress.currentFile}` : ''}
        </p>
      ) : null}
      {error ? (
        <p
          className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <form
        className="flex flex-wrap items-center gap-2 border-t border-zinc-200 px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <div className="flex" role="group" aria-label="Code search type">
          {(['symbols', 'text', 'files'] as const).map((value) => (
            <button
              aria-pressed={kind === value}
              className={`border border-zinc-300 px-3 py-1.5 text-xs font-medium first:rounded-l last:rounded-r ${kind === value ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-700'}`}
              key={value}
              type="button"
              onClick={() => {
                setKind(value);
                setPage(null);
              }}
            >
              {value[0]?.toUpperCase()}
              {value.slice(1)}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor={`code-search-${repository.id}`}>
          Search indexed code
        </label>
        <input
          className="min-w-48 flex-1 rounded border border-zinc-300 px-3 py-1.5 text-sm"
          id={`code-search-${repository.id}`}
          maxLength={200}
          placeholder={`Search ${kind}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          className="command-button"
          disabled={busy || !query.trim() || !status?.snapshotIdentity}
          type="submit"
        >
          <Search aria-hidden="true" className="size-4" /> Search
        </button>
      </form>
      {page ? (
        <div className="border-t border-zinc-200">
          {page.results.length === 0 ? (
            <p className="px-4 py-5 text-sm text-zinc-500">No indexed code matched this query.</p>
          ) : (
            <ul aria-label="Code search results" className="divide-y divide-zinc-200">
              {page.results.map((result, index) => (
                <li
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3"
                  key={`${result.relativePath}:${String(result.startLine)}:${String(index)}`}
                >
                  <button
                    className="min-w-0 text-left"
                    type="button"
                    onClick={() => onNavigate(result.relativePath, result.startLine)}
                  >
                    <span className="block truncate text-sm font-medium text-zinc-900">
                      {resultTitle(result)}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-xs text-zinc-500">
                      {result.relativePath}:{String(result.startLine)}-{String(result.endLine)}
                    </span>
                    <span className="mt-1 block line-clamp-2 text-xs text-zinc-600">
                      {result.snippet}
                    </span>
                    {result.stale ? (
                      <span className="mt-1 block text-xs font-medium text-amber-700">
                        Stale location: update the index before relying on this line.
                      </span>
                    ) : null}
                  </button>
                  <button
                    aria-label={`Open ${result.relativePath} line ${String(result.startLine)} in VS Code`}
                    className="icon-button"
                    title="Open indexed location in VS Code"
                    type="button"
                    onClick={() => onOpenInVscode(result.relativePath, result.startLine)}
                  >
                    <ExternalLink aria-hidden="true" className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <footer className="flex items-center justify-between border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500">
            <span>{String(page.total)} results</span>
            <div className="flex gap-2">
              <button
                className="text-button"
                disabled={page.offset === 0 || busy}
                type="button"
                onClick={() => void search(Math.max(0, page.offset - page.limit))}
              >
                Previous
              </button>
              <button
                className="text-button"
                disabled={page.offset + page.limit >= page.total || busy}
                type="button"
                onClick={() => void search(page.offset + page.limit)}
              >
                Next
              </button>
            </div>
          </footer>
        </div>
      ) : null}
    </section>
  );
}

function statusLabel(status: CodeIndexStatus | null): string {
  if (!status) return 'Checking index status...';
  if (status.status === 'unindexed') return 'Not indexed';
  const summary = `${String(status.fileCount)} files | ${String(status.symbolCount)} symbols`;
  if (status.status === 'stale') return `Stale | ${summary}`;
  if (status.status === 'cancelled') return `Cancelled; retry is available | ${summary}`;
  if (status.status === 'failed')
    return `${status.lastErrorMessage ?? 'Index failed'} | ${summary}`;
  return `${status.status === 'indexing' ? 'Indexing' : 'Ready'} | ${summary}`;
}

function resultTitle(result: SearchResult): string {
  if (
    'symbolName' in result &&
    result.symbolName &&
    ((result.symbolKind === 'import' && result.symbolName.startsWith('import ')) ||
      (result.symbolKind === 'export' && result.symbolName.startsWith('export ')))
  ) {
    return result.symbolName;
  }
  if ('symbolName' in result && result.symbolName)
    return `${result.symbolKind ?? 'symbol'} ${result.symbolName}`;
  return result.relativePath;
}
