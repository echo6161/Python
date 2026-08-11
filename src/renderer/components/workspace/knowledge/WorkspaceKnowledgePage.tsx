import { useState } from 'react';
import {
  Braces,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  FileText,
  Link2,
  LoaderCircle,
  RefreshCw,
  Search,
  Square,
  Trash2,
  X,
} from 'lucide-react';

import type {
  KnowledgeSearchResult,
  KnowledgeSourceType,
} from '../../../../shared/contracts/knowledge';
import type { Workspace } from '../../../../shared/contracts/workspace';
import { useKnowledgeController } from './use-knowledge-controller';

const sourceOptions = [
  { id: 'paper', label: 'Papers', icon: FileText },
  { id: 'code', label: 'Code', icon: Braces },
  { id: 'question', label: 'Questions', icon: CircleHelp },
  { id: 'link', label: 'Links', icon: Link2 },
] as const;

export function WorkspaceKnowledgePage({
  workspace,
  onNavigate,
}: {
  readonly workspace: Workspace;
  readonly onNavigate?: (target: 'links' | 'questions') => void;
}) {
  const controller = useKnowledgeController(workspace.id);
  const [query, setQuery] = useState('');
  const [types, setTypes] = useState<readonly KnowledgeSourceType[]>(
    sourceOptions.map(({ id }) => id),
  );
  const [selected, setSelected] = useState<KnowledgeSearchResult | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const resultPage = controller.results;

  const submit = (offset = 0) => {
    if (query.trim() && types.length > 0) void controller.search(query.trim(), types, offset);
  };

  return (
    <div className="knowledge-page mx-auto flex h-full w-full max-w-[1720px] flex-col overflow-hidden p-3 xl:p-4">
      <form
        className="flex shrink-0 items-center gap-2"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="knowledge-search-field min-w-0 flex-1">
          <Search aria-hidden="true" className="size-4" />
          <span className="sr-only">Search Workspace Knowledge</span>
          <input
            aria-label="Search Workspace Knowledge"
            autoComplete="off"
            placeholder="Search papers, code, questions, and confirmed links"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          className="knowledge-primary-button"
          disabled={!query.trim() || types.length === 0 || controller.searching}
          type="submit"
        >
          {controller.searching ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Search aria-hidden="true" className="size-4" />
          )}
          Search
        </button>
      </form>

      <div className="mt-2 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
        <fieldset className="flex flex-wrap items-center gap-1" aria-label="Knowledge sources">
          {sourceOptions.map(({ id, label, icon: Icon }) => {
            const checked = types.includes(id);
            return (
              <label className={`knowledge-filter ${checked ? 'is-active' : ''}`} key={id}>
                <input
                  checked={checked}
                  type="checkbox"
                  onChange={() =>
                    setTypes(checked ? types.filter((type) => type !== id) : [...types, id])
                  }
                />
                <Icon aria-hidden="true" className="size-3.5" /> {label}
              </label>
            );
          })}
        </fieldset>
        <IndexControls
          confirmRemove={confirmRemove}
          controller={controller}
          onConfirmRemove={setConfirmRemove}
        />
      </div>

      {controller.feedback ? (
        <p className="mt-2 shrink-0 text-xs text-red-300" role="alert">
          {controller.feedback}
        </p>
      ) : null}

      <div className={`knowledge-work-area mt-2 min-h-0 flex-1 ${selected ? '' : 'is-single'}`}>
        <section
          aria-label="Knowledge search results"
          className="min-h-0 overflow-y-auto border border-zinc-800 bg-[#0d131c]"
        >
          <ResultHeader controller={controller} />
          {controller.searching ? (
            <StateMessage icon={LoaderCircle} message="Searching the local index..." spin />
          ) : null}
          {!controller.searching && !resultPage ? (
            <StateMessage
              icon={Search}
              message="Enter a query to inspect indexed Workspace sources."
            />
          ) : null}
          {!controller.searching && resultPage?.results.length === 0 ? (
            <StateMessage icon={Search} message="No matching indexed sources." />
          ) : null}
          <ol className="divide-y divide-zinc-800">
            {resultPage?.results.map((result) => (
              <li key={result.chunkId}>
                <button
                  aria-current={selected?.chunkId === result.chunkId ? 'true' : undefined}
                  className="knowledge-result"
                  type="button"
                  onClick={() => setSelected(result)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <SourceBadge sourceType={result.sourceType} />
                    <strong className="truncate text-sm text-zinc-100">{result.title}</strong>
                  </span>
                  <span className="mt-1.5 line-clamp-3 text-left text-xs leading-5 text-zinc-400">
                    {result.snippet}
                  </span>
                  <span className="mt-2 flex items-center justify-between gap-3 text-[11px] text-zinc-500">
                    <span className="truncate">{result.citation}</span>
                    <span className="shrink-0">score {result.score.toFixed(2)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {resultPage && resultPage.total > resultPage.limit ? (
            <div className="flex items-center justify-between border-t border-zinc-800 px-3 py-2 text-xs text-zinc-500">
              <span>
                {resultPage.offset + 1}-
                {Math.min(resultPage.offset + resultPage.results.length, resultPage.total)} of{' '}
                {resultPage.total}
              </span>
              <span className="flex gap-1">
                <button
                  aria-label="Previous results"
                  className="icon-button"
                  disabled={resultPage.offset === 0}
                  type="button"
                  onClick={() => submit(Math.max(0, resultPage.offset - resultPage.limit))}
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  aria-label="Next results"
                  className="icon-button"
                  disabled={resultPage.offset + resultPage.limit >= resultPage.total}
                  type="button"
                  onClick={() => submit(resultPage.offset + resultPage.limit)}
                >
                  <ChevronRight className="size-4" />
                </button>
              </span>
            </div>
          ) : null}
        </section>

        {selected ? (
          <KnowledgeDetail
            result={selected}
            workspaceId={workspace.id}
            onClose={() => setSelected(null)}
            {...(onNavigate ? { onNavigate } : {})}
          />
        ) : null}
      </div>
    </div>
  );
}

function IndexControls({
  confirmRemove,
  controller,
  onConfirmRemove,
}: {
  readonly confirmRemove: boolean;
  readonly controller: ReturnType<typeof useKnowledgeController>;
  readonly onConfirmRemove: (value: boolean) => void;
}) {
  const indexing = controller.status?.status === 'indexing';
  const percent = controller.progress?.totalSources
    ? Math.round((controller.progress.processedSources / controller.progress.totalSources) * 100)
    : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`knowledge-index-state is-${controller.status?.status ?? 'unindexed'}`}>
        <span aria-hidden="true" />
        {controller.loading ? 'Checking index' : (controller.status?.status ?? 'unindexed')}
      </span>
      <span
        className="hidden text-zinc-500 lg:inline"
        title={
          controller.status?.embeddingProvider
            ? `Embedding provider: ${controller.status.embeddingProvider}`
            : 'Embedding provider unavailable; keyword retrieval remains active.'
        }
      >
        {indexing
          ? `${controller.progress?.phase ?? 'starting'} ${String(percent)}%`
          : `${String(controller.status?.sourceCount ?? 0)} sources / ${String(controller.status?.chunkCount ?? 0)} chunks / keyword only`}
      </span>
      {indexing ? (
        <button
          aria-label="Cancel indexing"
          className="icon-button"
          title="Cancel indexing"
          type="button"
          onClick={() => void controller.cancel()}
        >
          <Square className="size-3.5" />
        </button>
      ) : (
        <button
          className="knowledge-secondary-button"
          type="button"
          onClick={() => void controller.runIndex('incremental')}
        >
          <RefreshCw className="size-3.5" /> Update
        </button>
      )}
      {!indexing && controller.status?.status === 'ready' ? (
        <button
          aria-label="Rebuild index"
          className="icon-button"
          title="Rebuild index"
          type="button"
          onClick={() => void controller.runIndex('rebuild')}
        >
          <RefreshCw className="size-3.5" />
        </button>
      ) : null}
      {!indexing && controller.status?.status !== 'unindexed' ? (
        confirmRemove ? (
          <span className="flex items-center gap-1">
            <button
              className="text-xs text-red-300"
              type="button"
              onClick={() => {
                void controller.remove();
                onConfirmRemove(false);
              }}
            >
              Confirm remove
            </button>
            <button
              aria-label="Cancel remove"
              className="icon-button"
              type="button"
              onClick={() => onConfirmRemove(false)}
            >
              <X className="size-3.5" />
            </button>
          </span>
        ) : (
          <button
            aria-label="Remove index"
            className="icon-button"
            title="Remove rebuildable index"
            type="button"
            onClick={() => onConfirmRemove(true)}
          >
            <Trash2 className="size-3.5" />
          </button>
        )
      ) : null}
    </div>
  );
}

function ResultHeader({
  controller,
}: {
  readonly controller: ReturnType<typeof useKnowledgeController>;
}) {
  return (
    <header className="sticky top-0 z-[1] flex h-10 items-center justify-between border-b border-zinc-800 bg-[#111821] px-3 text-xs">
      <strong className="text-zinc-300">Results</strong>
      <span className="text-zinc-500">
        {controller.results
          ? `${String(controller.results.total)} matches / ${controller.results.mode}`
          : 'Local index'}
      </span>
    </header>
  );
}

function KnowledgeDetail({
  result,
  workspaceId,
  onClose,
  onNavigate,
}: {
  readonly result: KnowledgeSearchResult;
  readonly workspaceId: string;
  readonly onClose: () => void;
  readonly onNavigate?: (target: 'links' | 'questions') => void;
}) {
  const [opening, setOpening] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const provenance = (Object.entries(result.provenance) as readonly [string, unknown][]).filter(
    ([key]) => !['sourceType', 'indexedAt'].includes(key),
  );
  return (
    <aside
      aria-label="Source provenance"
      className="knowledge-detail-panel min-h-0 overflow-y-auto border border-zinc-800 bg-[#0d131c]"
    >
      <header className="sticky top-0 flex items-center justify-between border-b border-zinc-800 bg-[#111821] px-3 py-2">
        <span className="flex items-center gap-2">
          <SourceBadge sourceType={result.sourceType} />
          <strong className="text-sm text-zinc-100">Source detail</strong>
        </span>
        <button
          aria-label="Close source detail"
          className="icon-button xl:hidden"
          type="button"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </header>
      <div className="p-4">
        <h2 className="text-base font-semibold text-zinc-50">{result.title}</h2>
        <p className="mt-3 text-sm leading-6 text-zinc-300">{result.snippet}</p>
        <div className="mt-4 border-y border-zinc-800 py-3">
          <p className="text-[11px] font-semibold uppercase text-zinc-500">Citation</p>
          <p className="mt-1 text-sm text-sky-200">{result.citation}</p>
        </div>
        <dl className="mt-3 grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
          {provenance.map(([key, value]) => (
            <ProvenanceRow key={key} label={key} value={value} />
          ))}
          <dt className="text-zinc-500">Indexed</dt>
          <dd className="truncate text-zinc-300">
            {new Date(result.provenance.indexedAt).toLocaleString()}
          </dd>
        </dl>
        {result.unavailableReason ? (
          <p className="mt-4 text-xs text-amber-300">{result.unavailableReason}</p>
        ) : null}
        {reason ? (
          <p className="mt-3 text-xs text-amber-300" role="status">
            {reason}
          </p>
        ) : null}
        <button
          className="knowledge-primary-button mt-5"
          disabled={opening}
          type="button"
          onClick={() => {
            setOpening(true);
            void window.paperMind.knowledge
              .openResult({ workspaceId, chunkId: result.chunkId })
              .then((response) => {
                if (!response.ok) setReason(response.error.message);
                else if (!response.value.opened) setReason(response.value.reason);
                else if (response.value.target === 'question') onNavigate?.('questions');
                else if (response.value.target === 'link') onNavigate?.('links');
              })
              .finally(() => setOpening(false));
          }}
        >
          {opening ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <ExternalLink className="size-4" />
          )}{' '}
          Open source
        </button>
      </div>
    </aside>
  );
}

function ProvenanceRow({ label, value }: { readonly label: string; readonly value: unknown }) {
  const display = displayValue(value);
  return (
    <>
      <dt className="capitalize text-zinc-500">{label.replace(/([A-Z])/gu, ' $1')}</dt>
      <dd className="break-all text-zinc-300">{display}</dd>
    </>
  );
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value === null || value === undefined) return 'N/A';
  return JSON.stringify(value);
}

function SourceBadge({ sourceType }: { readonly sourceType: KnowledgeSourceType }) {
  const option = sourceOptions.find(({ id }) => id === sourceType) ?? sourceOptions[0];
  const Icon = option.icon;
  return (
    <span className={`knowledge-source-badge is-${sourceType}`}>
      <Icon aria-hidden="true" className="size-3" />
      {option.label.slice(0, -1)}
    </span>
  );
}

function StateMessage({
  icon: Icon,
  message,
  spin = false,
}: {
  readonly icon: typeof Search;
  readonly message: string;
  readonly spin?: boolean;
}) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-zinc-500">
      <Icon aria-hidden="true" className={`size-5 ${spin ? 'animate-spin' : ''}`} />
      {message}
    </div>
  );
}
