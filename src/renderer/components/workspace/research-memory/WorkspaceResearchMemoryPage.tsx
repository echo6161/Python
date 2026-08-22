import { useCallback, useEffect, useState } from 'react';
import {
  BookMarked,
  Bot,
  ChevronRight,
  ExternalLink,
  FileDown,
  FileText,
  List,
  LoaderCircle,
  MemoryStick,
  PanelRight,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';

import type {
  ResearchContentItem,
  ResearchContentSummary,
  ResearchContentType,
  ResearchMemoryExportPreview,
  ResearchMemoryProposal,
} from '../../../../shared/contracts/research-memory';
import type { KnowledgeSourceType } from '../../../../shared/contracts/knowledge';
import type { Workspace } from '../../../../shared/contracts/workspace';

interface Props {
  readonly workspace: Workspace;
  readonly onNavigate: (target: 'code' | 'links' | 'papers' | 'questions') => void;
}

interface SourceResult {
  readonly chunkId: string;
  readonly sourceType: KnowledgeSourceType;
  readonly title: string;
  readonly citation: string;
  readonly snippet: string;
}

export function WorkspaceResearchMemoryPage({ workspace, onNavigate }: Props) {
  const [summaries, setSummaries] = useState<readonly ResearchContentSummary[]>([]);
  const [proposals, setProposals] = useState<readonly ResearchMemoryProposal[]>([]);
  const [selected, setSelected] = useState<ResearchContentItem | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ResearchContentType>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('active');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceResults, setSourceResults] = useState<readonly SourceResult[]>([]);
  const [proposalReason, setProposalReason] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<ResearchMemoryProposal | null>(null);
  const [exportPreview, setExportPreview] = useState<ResearchMemoryExportPreview | null>(null);

  const loadList = useCallback(async () => {
    const [items, pending] = await Promise.all([
      window.paperMind.researchMemory.list({
        workspaceId: workspace.id,
        ...(query.trim() ? { query: query.trim() } : {}),
        ...(typeFilter === 'all' ? {} : { types: [typeFilter] }),
      }),
      window.paperMind.researchMemory.listProposals(workspace.id),
    ]);
    if (!items.ok) throw new Error(items.error.message);
    if (!pending.ok) throw new Error(pending.error.message);
    setSummaries(items.value);
    setProposals(pending.value);
    return items.value;
  }, [query, typeFilter, workspace.id]);

  const selectItem = useCallback(
    async (summary: ResearchContentSummary, closeList = true) => {
      setError(null);
      const result = await window.paperMind.researchMemory.get({
        workspaceId: workspace.id,
        type: summary.type,
        id: summary.id,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setSelected(result.value);
      setTitle(result.value.title);
      setBody(result.value.bodyMarkdown);
      setStatus(result.value.status);
      if (closeList) setShowList(false);
    },
    [workspace.id],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadList()
        .then((items) => {
          if (!selected && items[0]) void selectItem(items[0], false);
        })
        .catch((caught: unknown) =>
          setError(
            caught instanceof Error ? caught.message : 'Notes and Memory could not be loaded.',
          ),
        );
    }, 120);
    return () => window.clearTimeout(timer);
  }, [loadList, selectItem, selected]);

  const dirty = selected
    ? title !== selected.title || body !== selected.bodyMarkdown || status !== selected.status
    : false;
  const pendingProposals = proposals.filter(
    ({ status: proposalStatus }) => proposalStatus === 'pending',
  );

  const perform = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The operation could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const createItem = (type: ResearchContentType) =>
    void perform(async () => {
      const result = await window.paperMind.researchMemory.create({
        workspaceId: workspace.id,
        type,
        title: type === 'note' ? 'Untitled Note' : 'Untitled Memory',
        bodyMarkdown: '',
      });
      if (!result.ok) throw new Error(result.error.message);
      await loadList();
      setSelected(result.value);
      setTitle(result.value.title);
      setBody('');
      setStatus(result.value.status);
    });

  const save = () =>
    selected &&
    void perform(async () => {
      const result = await window.paperMind.researchMemory.update({
        workspaceId: workspace.id,
        type: selected.type,
        id: selected.id,
        title,
        bodyMarkdown: body,
        status: status as typeof selected.status,
        rowVersion: selected.rowVersion,
      });
      if (!result.ok) throw new Error(result.error.message);
      setSelected(result.value);
      setStatus(result.value.status);
      await loadList();
      setMessage('Saved locally.');
    });

  const deleteItem = () =>
    selected &&
    window.confirm(
      `Delete “${selected.title}”? External sources and exported files are not deleted.`,
    ) &&
    void perform(async () => {
      const result = await window.paperMind.researchMemory.delete({
        workspaceId: workspace.id,
        type: selected.type,
        id: selected.id,
        confirmation: 'DELETE_RESEARCH_CONTENT',
      });
      if (!result.ok) throw new Error(result.error.message);
      setSelected(null);
      setTitle('');
      setBody('');
      const items = await loadList();
      if (items[0]) await selectItem(items[0], false);
    });

  const searchSources = () =>
    void perform(async () => {
      if (!sourceQuery.trim()) return;
      const result = await window.paperMind.researchMemory.searchSources({
        workspaceId: workspace.id,
        query: sourceQuery.trim(),
      });
      if (!result.ok) throw new Error(result.error.message);
      setSourceResults(result.value);
    });

  const addSource = (chunkId: string) =>
    selected &&
    void perform(async () => {
      const result = await window.paperMind.researchMemory.addReference({
        workspaceId: workspace.id,
        type: selected.type,
        id: selected.id,
        chunkId,
      });
      if (!result.ok) throw new Error(result.error.message);
      setSelected(result.value);
      await loadList();
      setMessage('Source attached.');
    });

  const removeSource = (referenceId: string) =>
    selected &&
    void perform(async () => {
      const result = await window.paperMind.researchMemory.removeReference({
        workspaceId: workspace.id,
        type: selected.type,
        id: selected.id,
        referenceId,
      });
      if (!result.ok) throw new Error(result.error.message);
      setSelected(result.value);
      await loadList();
    });

  const openSource = (referenceId: string) =>
    selected &&
    void perform(async () => {
      const result = await window.paperMind.researchMemory.openReference({
        workspaceId: workspace.id,
        type: selected.type,
        id: selected.id,
        referenceId,
      });
      if (!result.ok) throw new Error(result.error.message);
      if (!result.value.opened)
        throw new Error(result.value.reason ?? 'The source is unavailable.');
      if (result.value.target === 'question') onNavigate('questions');
      if (result.value.target === 'link') onNavigate('links');
    });

  const propose = () =>
    selected?.type === 'note' &&
    proposalReason &&
    void perform(async () => {
      const result = await window.paperMind.researchMemory.createProposal({
        workspaceId: workspace.id,
        sourceNoteId: selected.id,
        reason: proposalReason,
      });
      if (!result.ok) throw new Error(result.error.message);
      setProposalReason(null);
      setReviewing(result.value);
      await loadList();
    });

  const prepareExport = () =>
    selected &&
    void perform(async () => {
      const result = await window.paperMind.researchMemory.prepareExport({
        workspaceId: workspace.id,
        type: selected.type,
        id: selected.id,
      });
      if (!result.ok) throw new Error(result.error.message);
      if (result.value) setExportPreview(result.value);
    });

  return (
    <div className="research-memory-page flex h-full min-h-0 flex-col bg-[#0b1017]">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <BookMarked aria-hidden="true" className="size-4 text-sky-400" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Notes &amp; Research Memory</h2>
            <p className="text-[11px] text-zinc-500">Workspace-owned · local first</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="icon-button 2xl:hidden"
            aria-label="Open item list"
            type="button"
            onClick={() => setShowList(true)}
          >
            <List className="size-4" />
          </button>
          <button
            className="icon-button 2xl:hidden"
            aria-label="Open sources"
            type="button"
            onClick={() => setShowSources(true)}
          >
            <PanelRight className="size-4" />
          </button>
          <button
            className="text-button inline-flex h-8 items-center gap-1.5 px-2 text-xs"
            type="button"
            onClick={() => createItem('note')}
          >
            <Plus className="size-3.5" /> Note
          </button>
          <button
            className="text-button inline-flex h-8 items-center gap-1.5 px-2 text-xs"
            type="button"
            onClick={() => createItem('memory')}
          >
            <MemoryStick className="size-3.5" /> Memory
          </button>
        </div>
      </header>
      {error ? (
        <div
          role="alert"
          className="border-b border-red-900 bg-red-950/50 px-4 py-2 text-xs text-red-200"
        >
          {error}
        </div>
      ) : null}
      {message ? (
        <div
          role="status"
          className="border-b border-emerald-900 bg-emerald-950/30 px-4 py-2 text-xs text-emerald-200"
        >
          {message}
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="research-memory-grid grid h-full min-h-0 grid-cols-[260px_minmax(0,1fr)_310px]">
          <ItemList
            className={showList ? 'research-memory-drawer-open' : ''}
            summaries={summaries}
            proposals={pendingProposals}
            query={query}
            typeFilter={typeFilter}
            selected={selected}
            onClose={() => setShowList(false)}
            onQuery={setQuery}
            onTypeFilter={setTypeFilter}
            onSelect={(item) => {
              setShowList(false);
              void selectItem(item);
            }}
            onReview={(proposal) => {
              setReviewing(proposal);
              setShowList(false);
            }}
          />
          <Editor
            item={selected}
            title={title}
            body={body}
            status={status}
            busy={busy}
            dirty={dirty}
            onTitle={setTitle}
            onBody={setBody}
            onStatus={setStatus}
            onSave={save}
            onDelete={deleteItem}
            onExport={prepareExport}
            onPropose={() => setProposalReason('Preserve the durable finding and its limitations.')}
          />
          <SourcesPane
            className={showSources ? 'research-memory-drawer-open' : ''}
            item={selected}
            query={sourceQuery}
            results={sourceResults}
            busy={busy}
            onClose={() => setShowSources(false)}
            onQuery={setSourceQuery}
            onSearch={searchSources}
            onAdd={addSource}
            onOpen={openSource}
            onRemove={removeSource}
          />
        </div>
      </div>
      {proposalReason !== null && selected?.type === 'note' ? (
        <ProposalRequestDialog
          reason={proposalReason}
          busy={busy}
          onReason={setProposalReason}
          onCancel={() => setProposalReason(null)}
          onConfirm={propose}
        />
      ) : null}
      {reviewing ? (
        <ProposalReviewDialog
          proposal={reviewing}
          busy={busy}
          onClose={() => setReviewing(null)}
          onConfirm={(proposal, nextTitle, nextBody) =>
            void perform(async () => {
              const result = await window.paperMind.researchMemory.confirmProposal({
                workspaceId: workspace.id,
                proposalId: proposal.id,
                title: nextTitle,
                bodyMarkdown: nextBody,
                rowVersion: proposal.rowVersion,
              });
              if (!result.ok) throw new Error(result.error.message);
              setReviewing(null);
              await loadList();
              setSelected(result.value);
              setTitle(result.value.title);
              setBody(result.value.bodyMarkdown);
              setStatus(result.value.status);
              setMessage('Proposal confirmed as long-term Memory.');
            })
          }
          onReject={(proposal) =>
            void perform(async () => {
              const result = await window.paperMind.researchMemory.rejectProposal({
                workspaceId: workspace.id,
                proposalId: proposal.id,
                rowVersion: proposal.rowVersion,
              });
              if (!result.ok) throw new Error(result.error.message);
              setReviewing(null);
              await loadList();
              setMessage('Proposal rejected. No Memory was created.');
            })
          }
        />
      ) : null}
      {exportPreview ? (
        <ExportPreviewDialog
          preview={exportPreview}
          busy={busy}
          onClose={() => setExportPreview(null)}
          onConfirm={() =>
            void perform(async () => {
              const result = await window.paperMind.researchMemory.confirmExport({
                previewId: exportPreview.id,
                confirmation: 'EXPORT_NEW_FILE',
              });
              if (!result.ok) throw new Error(result.error.message);
              setExportPreview(null);
              setMessage(`Exported ${result.value.relativePath}`);
            })
          }
        />
      ) : null}
      {busy ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex items-center gap-2 border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs">
          <LoaderCircle className="size-3.5 animate-spin" /> Working…
        </div>
      ) : null}
    </div>
  );
}

function ItemList({
  className,
  summaries,
  proposals,
  query,
  typeFilter,
  selected,
  onClose,
  onQuery,
  onTypeFilter,
  onSelect,
  onReview,
}: {
  readonly className: string;
  readonly summaries: readonly ResearchContentSummary[];
  readonly proposals: readonly ResearchMemoryProposal[];
  readonly query: string;
  readonly typeFilter: 'all' | ResearchContentType;
  readonly selected: ResearchContentItem | null;
  readonly onClose: () => void;
  readonly onQuery: (value: string) => void;
  readonly onTypeFilter: (value: 'all' | ResearchContentType) => void;
  readonly onSelect: (item: ResearchContentSummary) => void;
  readonly onReview: (proposal: ResearchMemoryProposal) => void;
}) {
  return (
    <aside
      aria-label="Notes and Memory list"
      className={`research-memory-list min-h-0 border-r border-zinc-800 bg-[#0d131c] ${className}`}
    >
      <div className="flex h-10 items-center gap-2 border-b border-zinc-800 px-3">
        <Search className="size-3.5 text-zinc-500" />
        <input
          aria-label="Search Notes and Memory"
          className="min-w-0 flex-1 bg-transparent text-xs outline-none"
          placeholder="Search…"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
        <button
          className="icon-button 2xl:hidden"
          aria-label="Close item list"
          type="button"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex h-9 items-center gap-1 border-b border-zinc-800 px-2">
        {(['all', 'note', 'memory'] as const).map((type) => (
          <button
            key={type}
            className={`h-6 px-2 text-[11px] capitalize ${typeFilter === type ? 'bg-sky-950 text-sky-300' : 'text-zinc-500'}`}
            type="button"
            onClick={() => onTypeFilter(type)}
          >
            {type}
          </button>
        ))}
      </div>
      <div className="h-[calc(100%-76px)] overflow-y-auto py-1">
        {proposals.map((proposal) => (
          <button
            key={proposal.id}
            className="flex w-full items-start gap-2 border-b border-amber-950/60 px-3 py-2 text-left hover:bg-zinc-900"
            type="button"
            onClick={() => onReview(proposal)}
          >
            <Bot className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-xs text-zinc-200">{proposal.title}</strong>
              <span className="text-[10px] text-amber-400">AI proposal · review required</span>
            </span>
            <ChevronRight className="size-3.5 text-zinc-600" />
          </button>
        ))}
        {summaries.map((summary) => (
          <button
            key={`${summary.type}:${summary.id}`}
            className={`w-full border-b border-zinc-800/80 px-3 py-2 text-left hover:bg-zinc-900 ${selected?.id === summary.id && selected.type === summary.type ? 'bg-sky-950/40' : ''}`}
            type="button"
            onClick={() => onSelect(summary)}
          >
            <div className="flex items-center gap-2">
              <span
                className={`text-[9px] font-semibold uppercase ${summary.type === 'memory' ? 'text-emerald-400' : 'text-sky-400'}`}
              >
                {summary.type}
              </span>
              <span className="truncate text-xs font-medium text-zinc-200">{summary.title}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500">
              <span>
                {summary.status} · {summary.referenceCount} sources
              </span>
              <time>{new Date(summary.updatedAt).toLocaleDateString()}</time>
            </div>
          </button>
        ))}
        {!summaries.length && !proposals.length ? (
          <p className="px-4 py-8 text-center text-xs text-zinc-500">No Notes or Memory entries.</p>
        ) : null}
      </div>
    </aside>
  );
}

function Editor({
  item,
  title,
  body,
  status,
  busy,
  dirty,
  onTitle,
  onBody,
  onStatus,
  onSave,
  onDelete,
  onExport,
  onPropose,
}: {
  readonly item: ResearchContentItem | null;
  readonly title: string;
  readonly body: string;
  readonly status: string;
  readonly busy: boolean;
  readonly dirty: boolean;
  readonly onTitle: (value: string) => void;
  readonly onBody: (value: string) => void;
  readonly onStatus: (value: string) => void;
  readonly onSave: () => void;
  readonly onDelete: () => void;
  readonly onExport: () => void;
  readonly onPropose: () => void;
}) {
  if (!item)
    return (
      <main className="flex min-h-0 items-center justify-center">
        <div className="text-center text-zinc-500">
          <FileText className="mx-auto mb-3 size-8" />
          <p className="text-sm">Create or select a Note or Memory.</p>
        </div>
      </main>
    );
  const statuses =
    item.type === 'note' ? ['draft', 'active', 'archived'] : ['draft', 'confirmed', 'retired'];
  return (
    <main className="flex min-h-0 min-w-0 flex-col bg-[#0b1017]">
      <div className="flex min-h-12 shrink-0 items-center gap-2 border-b border-zinc-800 px-4">
        <span
          className={`text-[10px] font-semibold uppercase ${item.type === 'memory' ? 'text-emerald-400' : 'text-sky-400'}`}
        >
          {item.type}
        </span>
        <select
          aria-label="Status"
          className="h-7 border border-zinc-700 bg-zinc-950 px-2 text-xs"
          value={status}
          onChange={(event) => onStatus(event.target.value)}
        >
          {statuses.map((value) => (
            <option value={value} key={value}>
              {value}
            </option>
          ))}
        </select>
        <span className="ml-auto text-[10px] text-zinc-600">
          {dirty ? 'Unsaved changes' : `Updated ${new Date(item.updatedAt).toLocaleString()}`}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <input
          aria-label="Title"
          className="mb-3 w-full border-0 bg-transparent text-xl font-semibold text-zinc-100 outline-none"
          value={title}
          onChange={(event) => onTitle(event.target.value)}
        />
        <textarea
          aria-label="Markdown body"
          className="min-h-0 flex-1 resize-none border border-zinc-800 bg-[#0d131c] p-4 font-mono text-sm leading-6 text-zinc-200 outline-none focus:border-sky-800"
          placeholder="Write research notes in Markdown…"
          value={body}
          onChange={(event) => onBody(event.target.value)}
        />
      </div>
      <footer className="flex min-h-12 shrink-0 items-center gap-2 border-t border-zinc-800 px-4">
        <button
          className="primary-button inline-flex h-8 items-center gap-1.5 px-3 text-xs"
          disabled={busy || !dirty || !title.trim()}
          type="button"
          onClick={onSave}
        >
          <Save className="size-3.5" /> Save
        </button>
        {item.type === 'note' ? (
          <button
            className="text-button inline-flex h-8 items-center gap-1.5 px-2 text-xs"
            disabled={busy || dirty}
            type="button"
            onClick={onPropose}
          >
            <Bot className="size-3.5" /> Propose Memory
          </button>
        ) : null}
        <button
          className="text-button inline-flex h-8 items-center gap-1.5 px-2 text-xs"
          disabled={busy || dirty}
          type="button"
          onClick={onExport}
        >
          <FileDown className="size-3.5" /> Export
        </button>
        <button
          className="icon-button ml-auto text-red-400"
          aria-label={`Delete ${item.type}`}
          disabled={busy}
          type="button"
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
        </button>
      </footer>
    </main>
  );
}

function SourcesPane({
  className,
  item,
  query,
  results,
  busy,
  onClose,
  onQuery,
  onSearch,
  onAdd,
  onOpen,
  onRemove,
}: {
  readonly className: string;
  readonly item: ResearchContentItem | null;
  readonly query: string;
  readonly results: readonly SourceResult[];
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onQuery: (value: string) => void;
  readonly onSearch: () => void;
  readonly onAdd: (id: string) => void;
  readonly onOpen: (id: string) => void;
  readonly onRemove: (id: string) => void;
}) {
  return (
    <aside
      aria-label="Sources and properties"
      className={`research-memory-sources min-h-0 border-l border-zinc-800 bg-[#0d131c] ${className}`}
    >
      <header className="flex h-10 items-center justify-between border-b border-zinc-800 px-3">
        <strong className="text-xs">Sources &amp; properties</strong>
        <button
          className="icon-button 2xl:hidden"
          aria-label="Close sources"
          type="button"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </header>
      <div className="h-[calc(100%-40px)] overflow-y-auto p-3">
        {item ? (
          <>
            <dl className="mb-3 grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 border-b border-zinc-800 pb-3 text-[11px]">
              <dt className="text-zinc-600">Type</dt>
              <dd className="text-zinc-300">{item.type}</dd>
              <dt className="text-zinc-600">Status</dt>
              <dd className="text-zinc-300">{item.status}</dd>
              {item.type === 'memory' ? (
                <>
                  <dt className="text-zinc-600">Origin</dt>
                  <dd className="text-zinc-300">{item.provenance}</dd>
                </>
              ) : null}
            </dl>
            <h3 className="mb-1.5 text-[10px] font-semibold uppercase text-zinc-500">
              Attached sources
            </h3>
            {item.references.map((reference) => (
              <div key={reference.id} className="mb-2 border border-zinc-800 p-2">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 text-[9px] font-semibold uppercase text-sky-400">
                    {reference.sourceType}
                  </span>
                  <strong className="min-w-0 flex-1 text-xs text-zinc-200">
                    {reference.title}
                  </strong>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{reference.citation}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    className="text-button inline-flex items-center gap-1 text-[10px]"
                    type="button"
                    onClick={() => onOpen(reference.id)}
                  >
                    <ExternalLink className="size-3" /> Open
                  </button>
                  <button
                    className="text-button text-[10px] text-red-400"
                    type="button"
                    onClick={() => onRemove(reference.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {!item.references.length ? (
              <p className="mb-3 text-[11px] text-zinc-600">No sources attached.</p>
            ) : null}
            <div className="mt-4 border-t border-zinc-800 pt-3">
              <label
                className="text-[10px] font-semibold uppercase text-zinc-500"
                htmlFor="memory-source-search"
              >
                Add from Knowledge
              </label>
              <div className="mt-1.5 flex gap-1">
                <input
                  id="memory-source-search"
                  className="min-w-0 flex-1 border border-zinc-700 bg-zinc-950 px-2 text-xs"
                  placeholder="Search indexed sources"
                  value={query}
                  onChange={(event) => onQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onSearch();
                  }}
                />
                <button
                  className="icon-button"
                  aria-label="Search sources"
                  disabled={busy || !query.trim()}
                  type="button"
                  onClick={onSearch}
                >
                  <Search className="size-3.5" />
                </button>
              </div>
              {results.map((result) => (
                <button
                  key={result.chunkId}
                  className="mt-2 w-full border border-zinc-800 p-2 text-left hover:border-sky-800"
                  type="button"
                  onClick={() => onAdd(result.chunkId)}
                >
                  <span className="text-[9px] font-semibold uppercase text-sky-400">
                    {result.sourceType}
                  </span>
                  <strong className="block truncate text-xs text-zinc-200">{result.title}</strong>
                  <span className="mt-1 line-clamp-2 text-[10px] text-zinc-500">
                    {result.citation}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-zinc-600">Select an item to inspect sources.</p>
        )}
      </div>
    </aside>
  );
}

function DialogFrame({
  title,
  children,
  onClose,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
  readonly onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="presentation"
    >
      <section
        aria-label={title}
        aria-modal="true"
        className="flex max-h-[calc(100vh-32px)] w-full max-w-5xl flex-col overflow-hidden border border-zinc-700 bg-[#0d131c] shadow-2xl"
        role="dialog"
      >
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 px-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button className="icon-button" aria-label="Close" type="button" onClick={onClose}>
            <X className="size-4" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function ProposalRequestDialog({
  reason,
  busy,
  onReason,
  onCancel,
  onConfirm,
}: {
  readonly reason: string;
  readonly busy: boolean;
  readonly onReason: (value: string) => void;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <DialogFrame title="Propose long-term Memory" onClose={onCancel}>
      <div className="p-4">
        <p className="mb-3 text-xs text-zinc-400">
          The provider drafts a proposal from this Note and attached bounded sources. Nothing
          becomes confirmed Memory until you review it.
        </p>
        <label className="text-xs font-medium" htmlFor="proposal-reason">
          Reason for retaining this memory
        </label>
        <textarea
          id="proposal-reason"
          className="mt-1 h-28 w-full resize-none border border-zinc-700 bg-zinc-950 p-3 text-sm"
          value={reason}
          onChange={(event) => onReason(event.target.value)}
        />
      </div>
      <footer className="flex justify-end gap-2 border-t border-zinc-800 p-3">
        <button className="text-button px-3 text-xs" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="primary-button px-3 py-2 text-xs"
          disabled={busy || !reason.trim()}
          type="button"
          onClick={onConfirm}
        >
          Generate proposal
        </button>
      </footer>
    </DialogFrame>
  );
}

function ProposalReviewDialog({
  proposal,
  busy,
  onClose,
  onConfirm,
  onReject,
}: {
  readonly proposal: ResearchMemoryProposal;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onConfirm: (proposal: ResearchMemoryProposal, title: string, body: string) => void;
  readonly onReject: (proposal: ResearchMemoryProposal) => void;
}) {
  const [nextTitle, setNextTitle] = useState(proposal.title);
  const [nextBody, setNextBody] = useState(proposal.bodyMarkdown);
  return (
    <DialogFrame title="Review AI Memory proposal" onClose={onClose}>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-3 grid gap-3 text-xs md:grid-cols-3">
          <div>
            <span className="text-zinc-500">Provider</span>
            <strong className="ml-2">
              {proposal.providerId} · {proposal.model}
            </strong>
          </div>
          <div>
            <span className="text-zinc-500">Reason</span>
            <strong className="ml-2">{proposal.reason}</strong>
          </div>
          <div>
            <span className="text-zinc-500">Sources</span>
            <strong className="ml-2">{proposal.references.length}</strong>
          </div>
        </div>
        <div className="grid min-h-0 gap-3 md:grid-cols-2">
          <section className="border border-zinc-800">
            <h3 className="border-b border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-400">
              Proposed snapshot
            </h3>
            <pre className="max-h-[52vh] overflow-auto whitespace-pre-wrap p-3 text-xs leading-5 text-zinc-500">
              {proposal.bodyMarkdown}
            </pre>
          </section>
          <section className="flex min-h-80 flex-col border border-emerald-900">
            <h3 className="border-b border-zinc-800 px-3 py-2 text-xs font-semibold text-emerald-400">
              Editable confirmation
            </h3>
            <input
              aria-label="Confirmed Memory title"
              className="m-3 border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-semibold"
              value={nextTitle}
              onChange={(event) => setNextTitle(event.target.value)}
            />
            <textarea
              aria-label="Confirmed Memory body"
              className="mx-3 mb-3 min-h-64 flex-1 resize-none border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs leading-5"
              value={nextBody}
              onChange={(event) => setNextBody(event.target.value)}
            />
          </section>
        </div>
      </div>
      <footer className="flex items-center justify-between border-t border-zinc-800 p-3">
        <button
          className="text-button px-2 text-xs text-red-400"
          disabled={busy}
          type="button"
          onClick={() => onReject(proposal)}
        >
          Reject proposal
        </button>
        <div className="flex gap-2">
          <button className="text-button px-3 text-xs" type="button" onClick={onClose}>
            Later
          </button>
          <button
            className="primary-button px-3 py-2 text-xs"
            disabled={busy || !nextTitle.trim() || !nextBody.trim()}
            type="button"
            onClick={() => onConfirm(proposal, nextTitle, nextBody)}
          >
            Confirm Memory
          </button>
        </div>
      </footer>
    </DialogFrame>
  );
}

function ExportPreviewDialog({
  preview,
  busy,
  onClose,
  onConfirm,
}: {
  readonly preview: ResearchMemoryExportPreview;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <DialogFrame title="Review one-way Markdown export" onClose={onClose}>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-3 flex items-center justify-between text-xs">
          <span>
            Vault: <strong>{preview.vaultName}</strong> / {preview.relativePath}
          </span>
          {preview.conflict ? (
            <span className="text-amber-400">
              Existing filename found · a new copy will be created
            </span>
          ) : (
            <span className="text-emerald-400">New file</span>
          )}
        </div>
        <div className={`grid gap-3 ${preview.conflict ? 'md:grid-cols-2' : ''}`}>
          {preview.conflict ? (
            <section className="border border-amber-900">
              <h3 className="border-b border-zinc-800 px-3 py-2 text-xs font-semibold">
                Existing file preview (unchanged)
              </h3>
              <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap p-3 text-xs text-zinc-500">
                {preview.existingPreview}
              </pre>
            </section>
          ) : null}
          <section className="border border-emerald-900">
            <h3 className="border-b border-zinc-800 px-3 py-2 text-xs font-semibold">New export</h3>
            <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap p-3 text-xs text-zinc-300">
              {preview.markdown}
            </pre>
          </section>
        </div>
      </div>
      <footer className="flex justify-end gap-2 border-t border-zinc-800 p-3">
        <button className="text-button px-3 text-xs" type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary-button px-3 py-2 text-xs"
          disabled={busy}
          type="button"
          onClick={onConfirm}
        >
          Export new file
        </button>
      </footer>
    </DialogFrame>
  );
}
