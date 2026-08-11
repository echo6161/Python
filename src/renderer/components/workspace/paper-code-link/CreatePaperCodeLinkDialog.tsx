import { useEffect, useMemo, useState } from 'react';
import { Link2, Search, X } from 'lucide-react';

import type {
  CodeFileSearchResult,
  CodeSearchPage,
  CodeSymbolSearchResult,
  CodeTextSearchResult,
} from '../../../../shared/contracts/code-intelligence';
import type {
  PaperCodeLink,
  PaperCodeRelationType,
} from '../../../../shared/contracts/paper-code-link';
import type { WorkspaceRepositoryRef } from '../../../../shared/contracts/repository';
import type { Workspace, WorkspaceZoteroPaper } from '../../../../shared/contracts/workspace';
import { rendererLogger } from '../../../logger';
import { zoteroReferenceKey } from '../../../workspace/zotero-reference';

type SearchKind = 'files' | 'symbols' | 'text';
type SearchResult = CodeFileSearchResult | CodeSymbolSearchResult | CodeTextSearchResult;

export function CreatePaperCodeLinkDialog({
  workspace,
  onClose,
  onCreated,
}: {
  readonly workspace: Workspace;
  readonly onClose: () => void;
  readonly onCreated: (link: PaperCodeLink) => void;
}) {
  const [papers, setPapers] = useState<readonly WorkspaceZoteroPaper[]>([]);
  const [repositories, setRepositories] = useState<readonly WorkspaceRepositoryRef[]>([]);
  const [paperKey, setPaperKey] = useState('');
  const [repositoryId, setRepositoryId] = useState('');
  const [pageNumber, setPageNumber] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [kind, setKind] = useState<SearchKind>('symbols');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CodeSearchPage<SearchResult> | null>(null);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [relationType, setRelationType] = useState<PaperCodeRelationType>('implements');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    void Promise.all([
      window.paperMind.workspace.listPapers(workspace.id),
      window.paperMind.repository.listForWorkspace(workspace.id),
    ])
      .then(([paperResult, repositoryResult]) => {
        if (disposed) return;
        if (!paperResult.ok) throw new Error(paperResult.error.message);
        if (!repositoryResult.ok) throw new Error(repositoryResult.error.message);
        setPapers(paperResult.value);
        setRepositories(repositoryResult.value);
        setPaperKey(zoteroReferenceKey(paperResult.value[0]?.itemRef ?? emptyItemRef));
        setRepositoryId(repositoryResult.value[0]?.id ?? '');
      })
      .catch((caught: unknown) => {
        rendererLogger.error('Unable to prepare Paper-Code Link dialog', caught);
        if (!disposed) setError('Workspace papers or repositories could not be loaded.');
      });
    return () => {
      disposed = true;
    };
  }, [workspace.id]);

  const paper = useMemo(
    () => papers.find(({ itemRef }) => zoteroReferenceKey(itemRef) === paperKey) ?? null,
    [paperKey, papers],
  );

  const search = async (offset = 0) => {
    if (!repositoryId || !query.trim()) return;
    setBusy(true);
    setError(null);
    setSelected(null);
    try {
      const input = { repositoryId, query: query.trim(), offset, limit: 20 };
      const result =
        kind === 'files'
          ? await window.paperMind.codeIntelligence.searchFiles(input)
          : kind === 'symbols'
            ? await window.paperMind.codeIntelligence.searchSymbols(input)
            : await window.paperMind.codeIntelligence.searchText(input);
      if (!result.ok) setError(result.error.message);
      else setResults(result.value);
    } catch (caught) {
      rendererLogger.error('Unable to search code for link', caught);
      setError('Code search could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!paper || !selected) return;
    setBusy(true);
    setError(null);
    try {
      const symbol = symbolLocation(selected);
      const parsedPage = pageNumber ? Number(pageNumber) : undefined;
      const result = await window.paperMind.paperCodeLink.create({
        workspaceId: workspace.id,
        itemRef: paper.itemRef,
        ...(parsedPage === undefined ? {} : { pageNumber: parsedPage }),
        locationLabel: locationLabel.trim(),
        ...(selectedText.trim()
          ? { textAnchor: { exact: selectedText.trim(), prefix: '', suffix: '' } }
          : {}),
        repositoryId: selected.repositoryId,
        codeSnapshotIdentity: selected.snapshotIdentity,
        language: selected.language,
        relativePath: selected.relativePath,
        symbolKind: symbol.kind,
        symbolName: symbol.name,
        startLine: selected.startLine,
        endLine: selected.endLine,
        contentHash: selected.contentHash,
        relationType,
        label: label.trim(),
        description: description.trim(),
      });
      if (!result.ok) setError(result.error.message);
      else onCreated(result.value);
    } catch (caught) {
      rendererLogger.error('Unable to create Paper-Code Link', caught);
      setError('The Paper-Code Link could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
    >
      <section
        aria-labelledby="create-paper-code-link-heading"
        aria-modal="true"
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded border border-zinc-300 bg-white shadow-xl"
        role="dialog"
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div>
            <h2
              id="create-paper-code-link-heading"
              className="text-base font-semibold text-zinc-950"
            >
              Link paper location to code
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              The permanent link is saved only after this preview is confirmed.
            </p>
          </div>
          <button
            aria-label="Close link dialog"
            className="icon-button"
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </header>

        {error ? (
          <p
            className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-zinc-900">Paper location</legend>
            <label className="block text-xs font-medium text-zinc-700">
              Zotero paper
              <select
                className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                value={paperKey}
                onChange={(event) => setPaperKey(event.target.value)}
              >
                {papers.map((item) => (
                  <option
                    key={zoteroReferenceKey(item.itemRef)}
                    value={zoteroReferenceKey(item.itemRef)}
                  >
                    {item.item?.title ?? `Zotero item ${item.itemRef.itemKey}`}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <label className="text-xs font-medium text-zinc-700">
                Page
                <input
                  aria-label="Paper page"
                  className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                  min="1"
                  type="number"
                  value={pageNumber}
                  onChange={(event) => setPageNumber(event.target.value)}
                />
              </label>
              <label className="text-xs font-medium text-zinc-700">
                Location label
                <input
                  className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                  maxLength={300}
                  placeholder="Equation 7 or Section 3.2"
                  value={locationLabel}
                  onChange={(event) => setLocationLabel(event.target.value)}
                />
              </label>
            </div>
            <label className="block text-xs font-medium text-zinc-700">
              Optional selected text
              <textarea
                className="mt-1 min-h-20 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                maxLength={2000}
                value={selectedText}
                onChange={(event) => setSelectedText(event.target.value)}
              />
            </label>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-zinc-900">Code location</legend>
            <label className="block text-xs font-medium text-zinc-700">
              Repository
              <select
                className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                value={repositoryId}
                onChange={(event) => {
                  setRepositoryId(event.target.value);
                  setResults(null);
                  setSelected(null);
                }}
              >
                {repositories.map((repository) => (
                  <option key={repository.id} value={repository.id}>
                    {repository.displayName}
                  </option>
                ))}
              </select>
            </label>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void search();
              }}
            >
              <select
                aria-label="Code search type"
                className="rounded border border-zinc-300 px-2 text-sm"
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as SearchKind);
                  setResults(null);
                  setSelected(null);
                }}
              >
                <option value="symbols">Symbols</option>
                <option value="text">Text</option>
                <option value="files">Files</option>
              </select>
              <input
                aria-label="Search code for link"
                className="min-w-0 flex-1 rounded border border-zinc-300 px-3 py-2 text-sm"
                maxLength={200}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button
                aria-label="Search code"
                className="icon-button"
                disabled={busy || !query.trim() || !repositoryId}
                title="Search code"
                type="submit"
              >
                <Search aria-hidden="true" className="size-4" />
              </button>
            </form>
            {results ? (
              <div className="max-h-56 overflow-y-auto border border-zinc-200">
                <ul aria-label="Code locations" className="divide-y divide-zinc-200">
                  {results.results.map((result, index) => (
                    <li key={`${result.relativePath}:${String(result.startLine)}:${String(index)}`}>
                      <button
                        aria-pressed={selected === result}
                        className={`w-full px-3 py-2 text-left text-xs ${selected === result ? 'bg-emerald-50' : 'bg-white'}`}
                        disabled={result.stale}
                        type="button"
                        onClick={() => setSelected(result)}
                      >
                        <span className="block font-medium text-zinc-900">
                          {resultTitle(result)}
                        </span>
                        <span className="block font-mono text-zinc-500">
                          {result.relativePath}:{String(result.startLine)}-{String(result.endLine)}
                        </span>
                        {result.stale ? (
                          <span className="text-amber-700">
                            Stale; update the index before linking.
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
                <footer className="flex justify-between border-t border-zinc-200 px-3 py-2 text-xs text-zinc-500">
                  <span>{String(results.total)} results</span>
                  <div className="flex gap-2">
                    <button
                      className="text-button"
                      disabled={results.offset === 0 || busy}
                      type="button"
                      onClick={() => void search(Math.max(0, results.offset - results.limit))}
                    >
                      Previous
                    </button>
                    <button
                      className="text-button"
                      disabled={results.offset + results.limit >= results.total || busy}
                      type="button"
                      onClick={() => void search(results.offset + results.limit)}
                    >
                      Next
                    </button>
                  </div>
                </footer>
              </div>
            ) : null}
          </fieldset>
        </div>

        <div className="grid gap-4 border-t border-zinc-200 bg-zinc-50 p-5 lg:grid-cols-3">
          <label className="text-xs font-medium text-zinc-700">
            Relation
            <select
              className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              value={relationType}
              onChange={(event) => setRelationType(event.target.value as PaperCodeRelationType)}
            >
              <option value="implements">Implements</option>
              <option value="corresponds_to">Corresponds to</option>
              <option value="extends">Extends</option>
              <option value="uses">Uses</option>
            </select>
          </label>
          <label className="text-xs font-medium text-zinc-700">
            Label
            <input
              className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              maxLength={300}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <label className="text-xs font-medium text-zinc-700">
            Description
            <textarea
              className="mt-1 min-h-16 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              maxLength={4000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
        </div>
        <div className="border-t border-zinc-200 px-5 py-4">
          <h3 className="text-xs font-semibold uppercase text-zinc-500">Preview</h3>
          <p className="mt-2 text-sm text-zinc-800">
            {paper?.item?.title ?? 'Select a paper'} {paperLocation(pageNumber, locationLabel)}{' '}
            <span aria-hidden="true">↔</span>{' '}
            {selected
              ? `${selected.relativePath}:${String(selected.startLine)}-${String(selected.endLine)}`
              : 'Select a code location'}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button className="text-button" type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="command-button"
              disabled={busy || !paper || !selected}
              type="button"
              onClick={() => void save()}
            >
              <Link2 aria-hidden="true" className="size-4" />
              Save link
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

const emptyItemRef = { serverId: '', library: { type: 'user' as const, id: '' }, itemKey: '' };

function symbolLocation(result: SearchResult) {
  if ('symbolKind' in result && result.symbolKind && 'symbolName' in result && result.symbolName)
    return { kind: result.symbolKind, name: result.symbolName };
  return { kind: null, name: null };
}

function resultTitle(result: SearchResult): string {
  const symbol = symbolLocation(result);
  return symbol.name ? `${symbol.kind} ${symbol.name}` : result.relativePath;
}

function paperLocation(page: string, label: string): string {
  const parts = [page ? `p.${page}` : '', label.trim()].filter(Boolean);
  return parts.length ? `(${parts.join(' / ')})` : '';
}
