import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Braces,
  CircleHelp,
  Link2,
  LoaderCircle,
  MessageSquareText,
  PanelRightOpen,
  RefreshCw,
  RotateCcw,
  Send,
  Square,
  X,
} from 'lucide-react';

import type { KnowledgeSourceType } from '../../../../shared/contracts/knowledge';
import type { ResearchQuestion } from '../../../../shared/contracts/question';
import type {
  ResearchChatContextPreview,
  ResearchChatContextSource,
  ResearchChatMessage,
} from '../../../../shared/contracts/research-chat';
import type { Workspace } from '../../../../shared/contracts/workspace';
import { useResearchChatController } from './use-research-chat-controller';

const sourceOptions: readonly { readonly id: KnowledgeSourceType; readonly label: string }[] = [
  { id: 'paper', label: 'Papers' },
  { id: 'code', label: 'Code' },
  { id: 'question', label: 'Questions' },
  { id: 'link', label: 'Links' },
];

export function WorkspaceResearchChatPage({ workspace }: { readonly workspace: Workspace }) {
  const [query, setQuery] = useState('');
  const [sourceTypes, setSourceTypes] = useState<readonly KnowledgeSourceType[]>([
    'paper',
    'code',
    'question',
    'link',
  ]);
  const [questions, setQuestions] = useState<readonly ResearchQuestion[]>([]);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const controller = useResearchChatController(workspace.id, questionId);
  const selected = new Set(controller.selectedAliases);

  useEffect(() => {
    let cancelled = false;
    void window.paperMind.question.list(workspace.id).then((result) => {
      if (!cancelled && result.ok)
        setQuestions(result.value.filter(({ archivedAt }) => !archivedAt));
    });
    return () => {
      cancelled = true;
    };
  }, [workspace.id]);

  const activeMessage = controller.conversation?.messages.find(
    ({ status }) => status === 'streaming',
  );
  const providerAvailable =
    controller.capabilities?.providers.find(({ id }) => id === controller.capabilities?.providerId)
      ?.configured ?? false;
  const currentSources =
    controller.preview?.sources ??
    (lastSources(controller.conversation?.messages ?? []).length
      ? lastSources(controller.conversation?.messages ?? [])
      : controller.activeSources);

  return (
    <div className="research-chat-page mx-auto flex h-full w-full max-w-[1720px] flex-col overflow-hidden">
      <header className="research-chat-toolbar">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <MessageSquareText aria-hidden="true" className="size-4 text-sky-400" /> Research Chat
          </h2>
          <p className="truncate text-[11px] text-zinc-500">
            {workspace.name} /{' '}
            {questionId ? questions.find(({ id }) => id === questionId)?.title : 'Workspace scope'}
          </p>
        </div>
        <label className="research-chat-question-select">
          <span className="sr-only">Bind Research Question</span>
          <select
            value={questionId ?? ''}
            onChange={(event) => setQuestionId(event.target.value || null)}
          >
            <option value="">Workspace scope</option>
            {questions.map((question) => (
              <option key={question.id} value={question.id}>
                {question.title}
              </option>
            ))}
          </select>
        </label>
        <button
          className="research-chat-secondary-button"
          type="button"
          onClick={() => setRailOpen(true)}
        >
          <PanelRightOpen aria-hidden="true" className="size-4" /> Sources {currentSources.length}
        </button>
      </header>

      <div className="research-chat-work-area min-h-0 flex-1">
        <main className="research-chat-thread" aria-label="Research Chat conversation">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 xl:px-6">
            {!controller.conversation?.messages.length ? (
              <ChatEmpty providerAvailable={providerAvailable} />
            ) : null}
            <div className="mx-auto max-w-4xl space-y-3">
              {controller.conversation?.messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  onCitation={(alias) => void controller.openCitation(message.id, alias)}
                  onRetry={() => void controller.retry(message)}
                />
              ))}
            </div>
          </div>

          {controller.error ? (
            <div
              className="mx-4 mb-2 flex items-center gap-2 border border-red-900/70 bg-red-950/40 px-3 py-2 text-xs text-red-200"
              role="alert"
            >
              <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">{controller.error}</span>
              <button
                aria-label="Dismiss error"
                className="icon-button"
                type="button"
                onClick={() => void controller.reload()}
              >
                <RefreshCw aria-hidden="true" className="size-3.5" />
              </button>
            </div>
          ) : null}

          <section aria-label="Research Chat composer" className="research-chat-composer">
            <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-800 px-3 py-2">
              <span className="mr-1 text-[11px] font-semibold text-zinc-500">Scope</span>
              {sourceOptions.map(({ id, label }) => {
                const checked = sourceTypes.includes(id);
                return (
                  <label className={`knowledge-filter ${checked ? 'is-active' : ''}`} key={id}>
                    <input
                      checked={checked}
                      type="checkbox"
                      onChange={() =>
                        setSourceTypes((current) =>
                          checked ? current.filter((value) => value !== id) : [...current, id],
                        )
                      }
                    />
                    {label}
                  </label>
                );
              })}
              <span className="ml-auto text-[11px] text-zinc-500">
                {controller.preview
                  ? `${String(selected.size)}/${String(controller.preview.sources.length)} selected`
                  : 'Context is reviewed before sending'}
              </span>
            </div>
            <div className="flex items-end gap-2 p-3">
              <textarea
                aria-label="Ask Research Chat"
                className="min-h-16 min-w-0 flex-1 resize-none rounded border px-3 py-2 text-sm"
                disabled={Boolean(activeMessage)}
                placeholder="Ask a focused question about this Workspace..."
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
              />
              {activeMessage ? (
                <button
                  className="research-chat-danger-button"
                  type="button"
                  onClick={() => void controller.cancel()}
                >
                  <Square aria-hidden="true" className="size-3.5 fill-current" /> Cancel
                </button>
              ) : controller.preview ? (
                <button
                  className="research-chat-primary-button"
                  disabled={!providerAvailable}
                  type="button"
                  onClick={() => {
                    setRailOpen(false);
                    void controller.send();
                  }}
                >
                  <Send aria-hidden="true" className="size-4" /> Send
                </button>
              ) : (
                <button
                  className="research-chat-primary-button"
                  disabled={!query.trim() || controller.preparing}
                  type="button"
                  onClick={() =>
                    void controller.prepare(query.trim(), sourceTypes).then((ok) => {
                      if (ok) setRailOpen(true);
                    })
                  }
                >
                  {controller.preparing ? (
                    <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                  ) : (
                    <PanelRightOpen aria-hidden="true" className="size-4" />
                  )}{' '}
                  Review sources
                </button>
              )}
            </div>
          </section>
        </main>

        <SourceRail
          open={railOpen}
          preview={controller.preview}
          sources={currentSources}
          selected={selected}
          onClose={() => setRailOpen(false)}
          onToggle={(alias) =>
            controller.setSelectedAliases(
              selected.has(alias)
                ? controller.selectedAliases.filter((value) => value !== alias)
                : [...controller.selectedAliases, alias],
            )
          }
        />
      </div>
    </div>
  );
}

function ChatEmpty({ providerAvailable }: { readonly providerAvailable: boolean }) {
  return (
    <div className="mx-auto mt-14 max-w-lg text-center">
      <MessageSquareText aria-hidden="true" className="mx-auto size-8 text-zinc-700" />
      <h3 className="mt-3 text-sm font-semibold text-zinc-200">
        Ask from bounded Workspace evidence
      </h3>
      <p className="mt-1 text-xs leading-5 text-zinc-500">
        Build and review a source package before anything is sent. Answers cannot write Questions,
        Links, Plans, or other domain data.
      </p>
      {!providerAvailable ? (
        <p className="mt-3 text-xs font-medium text-amber-300">
          Provider unavailable: connect the current AI provider in Settings. Knowledge search
          remains local.
        </p>
      ) : null}
    </div>
  );
}

function ChatMessage({
  message,
  onCitation,
  onRetry,
}: {
  readonly message: ResearchChatMessage;
  readonly onCitation: (alias: string) => void;
  readonly onRetry: () => void;
}) {
  const citations = new Map(message.citations.map((citation) => [citation.alias, citation]));
  return (
    <article
      className={`research-chat-message is-${message.role}`}
      aria-label={`${message.role} message`}
    >
      <header className="mb-1.5 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase text-zinc-500">
        <span>{message.role === 'assistant' ? 'PaperMind AI' : 'You'}</span>
        <span className="normal-case">{message.status}</span>
      </header>
      <div className="whitespace-pre-wrap text-sm leading-6 text-zinc-200">
        {renderContent(message.content, citations, message.status === 'complete', onCitation)}
        {message.status === 'streaming' ? (
          <span
            className="ml-1 inline-block h-4 w-1 animate-pulse bg-sky-400"
            aria-label="Streaming"
          />
        ) : null}
      </div>
      {message.unsupportedCitations.length ? (
        <p className="mt-2 flex items-center gap-1 text-xs text-amber-300">
          <AlertTriangle aria-hidden="true" className="size-3.5" /> Unsupported citation:{' '}
          {message.unsupportedCitations.join(', ')}
        </p>
      ) : null}
      {message.error ? (
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-red-900/50 pt-2 text-xs text-red-300">
          <span>{message.error.message}</span>
          {message.error.retryable ? (
            <button
              className="text-button inline-flex items-center gap-1"
              type="button"
              onClick={onRetry}
            >
              <RotateCcw aria-hidden="true" className="size-3.5" /> Retry
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function renderContent(
  content: string,
  citations: Map<string, ResearchChatMessage['citations'][number]>,
  enabled: boolean,
  onCitation: (alias: string) => void,
) {
  return content.split(/(\[S[1-9][0-9]{0,2}\])/gu).map((part, index) => {
    const alias = /^\[([A-Z][A-Z0-9]+)\]$/u.exec(part)?.[1];
    const citation = alias ? citations.get(alias) : undefined;
    if (!alias) return part;
    if (!citation || !enabled)
      return (
        <span className="research-chat-citation is-unsupported" key={`${part}-${String(index)}`}>
          {part}
        </span>
      );
    return (
      <button
        aria-label={`Open citation ${alias}: ${citation.source.citation}`}
        className="research-chat-citation"
        key={`${part}-${String(index)}`}
        title={citation.source.citation}
        type="button"
        onClick={() => onCitation(alias)}
      >
        {part}
      </button>
    );
  });
}

function SourceRail({
  open,
  preview,
  sources,
  selected,
  onClose,
  onToggle,
}: {
  readonly open: boolean;
  readonly preview: ResearchChatContextPreview | null;
  readonly sources: readonly ResearchChatContextSource[];
  readonly selected: ReadonlySet<string>;
  readonly onClose: () => void;
  readonly onToggle: (alias: string) => void;
}) {
  return (
    <aside
      aria-label="Research Chat sources"
      className={`research-chat-source-rail ${open ? 'is-open' : ''}`}
    >
      <header className="flex h-12 items-center justify-between border-b border-zinc-800 px-3">
        <div>
          <h3 className="text-xs font-semibold text-zinc-100">Source context</h3>
          <p className="text-[10px] text-zinc-500">
            {preview
              ? `${preview.searchMode} / ${preview.budget.usedCharacters.toLocaleString()} of ${preview.budget.maximumCharacters.toLocaleString()} chars`
              : 'Sources from the latest answer'}
          </p>
        </div>
        <button
          aria-label="Close sources"
          className="icon-button research-chat-rail-close"
          type="button"
          onClick={onClose}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sources.length ? (
          sources.map((source) => (
            <label className="research-chat-source" key={source.alias}>
              {preview ? (
                <input
                  checked={selected.has(source.alias)}
                  type="checkbox"
                  onChange={() => onToggle(source.alias)}
                />
              ) : null}
              <SourceIcon type={source.sourceType} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <strong className="truncate text-xs text-zinc-200">{source.title}</strong>
                  <code className="text-[10px] text-sky-400">{source.alias}</code>
                </span>
                <span className="mt-1 line-clamp-2 text-[11px] leading-4 text-zinc-500">
                  {source.snippet}
                </span>
                <span className="mt-1 block truncate text-[10px] text-zinc-600">
                  {source.citation}
                </span>
              </span>
            </label>
          ))
        ) : (
          <p className="p-4 text-xs text-zinc-500">
            No sources selected. The answer must state that context is insufficient.
          </p>
        )}
      </div>
      {preview ? (
        <footer className="border-t border-zinc-800 px-3 py-2 text-[10px] text-zinc-500">
          Retrieval {preview.retrievalVersion}
          <br />
          {preview.budget.candidateSources} candidates / {preview.budget.deduplicatedSources}{' '}
          deduplicated / {preview.budget.truncatedSources} truncated
        </footer>
      ) : null}
    </aside>
  );
}

function SourceIcon({ type }: { readonly type: KnowledgeSourceType }) {
  const Icon =
    type === 'paper'
      ? BookOpen
      : type === 'code'
        ? Braces
        : type === 'question'
          ? CircleHelp
          : Link2;
  return <Icon aria-label={type} className="mt-0.5 size-3.5 shrink-0 text-zinc-500" />;
}

function lastSources(
  messages: readonly ResearchChatMessage[],
): readonly ResearchChatContextSource[] {
  return (
    [...messages]
      .reverse()
      .find(({ citations }) => citations.length)
      ?.citations.map(({ source }) => source) ?? []
  );
}
