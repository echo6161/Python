import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Braces, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';

import type {
  CodeSearchPage,
  CodeSymbolSearchResult,
} from '../../../../shared/contracts/code-intelligence';
import type { ResearchQuestionDetails } from '../../../../shared/contracts/question';
import type { WorkspaceRepositoryRef } from '../../../../shared/contracts/repository';

const PAGE_SIZE = 20;

export function AddCodeEvidenceDialog({
  workspaceId,
  questionId,
  onClose,
  onAdded,
}: {
  readonly workspaceId: string;
  readonly questionId: string;
  readonly onClose: () => void;
  readonly onAdded: (details: ResearchQuestionDetails) => void;
}) {
  const [repositories, setRepositories] = useState<readonly WorkspaceRepositoryRef[]>([]);
  const [repositoryId, setRepositoryId] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState<CodeSearchPage<CodeSymbolSearchResult> | null>(null);
  const [selected, setSelected] = useState<CodeSymbolSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchRef.current?.focus();
    void window.paperMind.repository
      .listForWorkspace(workspaceId)
      .then((result) => {
        if (!result.ok) return setError(result.error.message);
        const available = result.value.filter(({ availability }) => availability === 'available');
        setRepositories(available);
        setRepositoryId(available[0]?.id ?? '');
      })
      .catch(() => setError('Workspace repositories could not be loaded.'));
  }, [workspaceId]);

  const search = async (offset = 0) => {
    if (!repositoryId || !query.trim()) return;
    setBusy(true);
    setError(null);
    setSelected(null);
    try {
      const result = await window.paperMind.codeIntelligence.searchSymbols({
        repositoryId,
        query: query.trim(),
        offset,
        limit: PAGE_SIZE,
      });
      if (result.ok) setPage(result.value);
      else setError(result.error.message);
    } catch {
      setError('Indexed code could not be searched.');
    } finally {
      setBusy(false);
    }
  };
  const submit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await window.paperMind.question.addCodeEvidence({
        workspaceId,
        questionId,
        repositoryId: selected.repositoryId,
        sourceSnapshotIdentity: selected.snapshotIdentity,
        language: selected.language,
        relativePath: selected.relativePath,
        symbolKind: selected.symbolKind,
        symbolName: selected.symbolName,
        startLine: selected.startLine,
        endLine: selected.endLine,
        contentHash: selected.contentHash,
        note: formText(form, 'note'),
      });
      if (result.ok) onAdded(result.value);
      else setError(result.error.message);
    } catch {
      setError('The Code Evidence could not be added.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <form
        className="w-full max-w-2xl rounded border border-zinc-300 bg-white shadow-xl"
        onSubmit={(event) => void submit(event)}
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Braces aria-hidden="true" className="size-4" />
            Add Code Evidence
          </h3>
          <button aria-label="Close" className="icon-button" type="button" onClick={onClose}>
            <X aria-hidden="true" className="size-4" />
          </button>
        </header>
        <div className="grid gap-3 px-5 py-4">
          {error ? (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <select
              aria-label="Repository"
              className="rounded border border-zinc-300 px-3 py-2 text-sm"
              value={repositoryId}
              onChange={(event) => {
                setRepositoryId(event.target.value);
                setPage(null);
                setSelected(null);
              }}
            >
              {repositories.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.displayName}
                </option>
              ))}
            </select>
            <input
              ref={searchRef}
              aria-label="Search symbols"
              className="min-w-0 flex-1 rounded border border-zinc-300 px-3 py-2 text-sm"
              maxLength={200}
              placeholder="Search an indexed symbol"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              className="command-button"
              disabled={busy || !repositoryId || !query.trim()}
              type="button"
              onClick={() => void search()}
            >
              <Search aria-hidden="true" className="size-4" />
              Search
            </button>
          </div>
          {repositories.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Link and index an available repository in this Workspace first.
            </p>
          ) : null}
          {page ? (
            <>
              <ul
                aria-label="Code symbol results"
                className="max-h-64 divide-y divide-zinc-200 overflow-y-auto border-y border-zinc-200"
              >
                {page.results.length === 0 ? (
                  <li className="py-5 text-sm text-zinc-500">No indexed symbol matched.</li>
                ) : (
                  page.results.map((result) => (
                    <li
                      key={`${result.relativePath}:${String(result.startLine)}:${result.symbolName}`}
                    >
                      <button
                        aria-pressed={selected === result}
                        className={`block w-full px-3 py-2 text-left ${selected === result ? 'bg-zinc-100' : ''}`}
                        type="button"
                        onClick={() => setSelected(result)}
                      >
                        <span className="block text-sm font-medium">{result.qualifiedName}</span>
                        <span className="block font-mono text-xs text-zinc-500">
                          {result.relativePath}:{String(result.startLine)}-{String(result.endLine)}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
              <div className="flex justify-end gap-1">
                <button
                  aria-label="Previous code results"
                  className="icon-button"
                  disabled={page.offset === 0}
                  type="button"
                  onClick={() => void search(Math.max(0, page.offset - page.limit))}
                >
                  <ChevronLeft aria-hidden="true" className="size-4" />
                </button>
                <button
                  aria-label="Next code results"
                  className="icon-button"
                  disabled={page.offset + page.limit >= page.total}
                  type="button"
                  onClick={() => void search(page.offset + page.limit)}
                >
                  <ChevronRight aria-hidden="true" className="size-4" />
                </button>
              </div>
            </>
          ) : null}
          <label className="grid gap-1 text-xs font-medium text-zinc-700">
            Your Evidence note
            <textarea
              className="min-h-20 rounded border border-zinc-300 px-3 py-2 text-sm"
              maxLength={4000}
              name="note"
            />
          </label>
        </div>
        <footer className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3">
          <button className="text-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="command-button" disabled={busy || !selected} type="submit">
            Add Evidence
          </button>
        </footer>
      </form>
    </div>
  );
}

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}
