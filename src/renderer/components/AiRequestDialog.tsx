import { useEffect, useId, useRef, useState } from 'react';
import { ExternalLink, LockKeyhole, Send, X } from 'lucide-react';

import {
  selectAiReplayHistory,
  type AiMessage,
  type AiSelectionScope,
  type AiTaskKind,
} from '../../shared/contracts/ai';

const TASK_LABELS: Readonly<Record<AiTaskKind, string>> = {
  translate: 'Translate selected text',
  explain: 'Explain selected text',
  term: 'Explain selected term',
  chat: 'Ask AI assistant',
  follow_up: 'Ask about selected text',
};

interface AiRequestDialogProps {
  readonly apiConfigured: boolean;
  readonly defaultSaveHistory: boolean;
  readonly destinationHost: string;
  readonly history: readonly AiMessage[];
  readonly historyPersisted: boolean;
  readonly isBusy: boolean;
  readonly isManualBridgeBusy: boolean;
  readonly kind: AiTaskKind;
  readonly prompt: string | null;
  readonly selection: AiSelectionScope | null;
  readonly onCancel: () => void;
  readonly onConfirm: (saveHistory: boolean) => void;
  readonly onOpenChatGpt: () => void;
}

export function AiRequestDialog({
  apiConfigured,
  defaultSaveHistory,
  destinationHost,
  history,
  historyPersisted,
  isBusy,
  isManualBridgeBusy,
  kind,
  prompt,
  selection,
  onCancel,
  onConfirm,
  onOpenChatGpt,
}: AiRequestDialogProps) {
  const [saveHistory, setSaveHistory] = useState(defaultSaveHistory);
  const descriptionId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const replayHistory = selectAiReplayHistory(saveHistory && !historyPersisted ? [] : history);
  const historyCharacters = replayHistory.reduce(
    (total, message) => total + message.content.length,
    0,
  );

  useEffect(() => {
    cancelButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) onCancel();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isBusy, onCancel]);

  return (
    <div
      aria-describedby={descriptionId}
      aria-labelledby="ai-request-title"
      aria-modal="true"
      className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-5"
      role="dialog"
    >
      <div className="flex max-h-[calc(100%-2.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-md bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id="ai-request-title" className="text-base font-semibold text-zinc-950">
              Review outgoing AI request
            </h2>
            <p id={descriptionId} className="mt-1 text-xs text-zinc-500">
              {TASK_LABELS[kind]} · destination {destinationHost}
            </p>
          </div>
          <button
            ref={cancelButtonRef}
            aria-label="Cancel AI request"
            className="icon-button"
            disabled={isBusy}
            title="Cancel"
            type="button"
            onClick={onCancel}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto px-5 py-5 text-sm">
          {selection ? (
            <section aria-labelledby="selection-scope-heading">
              <div className="flex flex-col gap-1">
                <h3 id="selection-scope-heading" className="font-semibold text-zinc-900">
                  Selected PDF text
                </h3>
                <span className="text-xs tabular-nums text-zinc-500">
                  Page {selection.pageNumber} · offsets {selection.textStart}–{selection.textEnd} ·{' '}
                  {selection.selectedText.length} characters
                </span>
              </div>
              <blockquote
                className="mt-3 max-h-44 overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-emerald-600 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-700"
                data-testid="outgoing-selection"
              >
                {selection.selectedText}
              </blockquote>
            </section>
          ) : (
            <section aria-labelledby="selection-scope-heading">
              <h3 id="selection-scope-heading" className="font-semibold text-zinc-900">
                Paper text
              </h3>
              <p className="mt-1 text-xs text-zinc-600">No PDF text is attached.</p>
            </section>
          )}

          {prompt ? (
            <section aria-labelledby="question-scope-heading">
              <h3 id="question-scope-heading" className="font-semibold text-zinc-900">
                Your message · {prompt.length} characters
              </h3>
              <p className="mt-2 whitespace-pre-wrap bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-700">
                {prompt}
              </p>
            </section>
          ) : null}

          <section aria-labelledby="history-scope-heading">
            <h3 id="history-scope-heading" className="font-semibold text-zinc-900">
              Conversation context
            </h3>
            <p className="mt-1 text-xs tabular-nums text-zinc-600">
              {replayHistory.length} prior messages · {historyCharacters} characters
            </p>
            {replayHistory.length > 0 ? (
              <details className="mt-2 border-y border-zinc-200 py-2">
                <summary className="text-xs font-semibold text-zinc-700">
                  Review prior messages
                </summary>
                <ol className="mt-2 divide-y divide-zinc-100">
                  {replayHistory.map((message) => (
                    <li key={message.id} className="py-2">
                      <span className="text-[11px] font-semibold uppercase text-zinc-500">
                        {message.role === 'assistant' ? 'AI assistant' : 'You'}
                      </span>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-zinc-700">
                        {message.content}
                      </p>
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </section>

          <div className="flex gap-3 border-l-2 border-emerald-600 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-950">
            <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <p>
              Only the selected excerpt, question, and conversation content shown above is sent to
              the AI provider, together with fixed safety and task instructions. The PDF file, file
              path, annotations, notes, and other papers stay local.
            </p>
          </div>

          <div className="border-l-2 border-zinc-400 bg-zinc-50 px-4 py-3 text-xs leading-5 text-zinc-700">
            The manual ChatGPT option copies only the selected excerpt, question, and fixed task
            instructions. It does not include conversation history. Nothing is uploaded until you
            paste the prompt into ChatGPT and submit it yourself.
          </div>

          <label className="flex items-start gap-3 text-xs text-zinc-700">
            <input
              checked={saveHistory}
              className="mt-0.5 size-4 accent-emerald-700"
              type="checkbox"
              onChange={(event) => setSaveHistory(event.target.checked)}
            />
            <span>
              <span className="block font-semibold text-zinc-900">Save conversation locally</span>
              <span className="mt-0.5 block text-zinc-500">
                Applies only to direct API requests. Turning this off keeps that request out of the
                local conversation database.
              </span>
            </span>
          </label>
        </div>

        <footer className="grid shrink-0 gap-2 border-t border-zinc-200 px-5 py-4">
          <button
            aria-label="Copy prompt and open ChatGPT"
            className={`${apiConfigured ? 'text-button' : 'command-button'} w-full justify-center`}
            disabled={isBusy}
            type="button"
            onClick={onOpenChatGpt}
          >
            <ExternalLink aria-hidden="true" className="size-4" />
            {isManualBridgeBusy ? 'Opening...' : 'Copy & open ChatGPT'}
          </button>
          <button
            className="command-button w-full justify-center"
            disabled={isBusy || !apiConfigured}
            title={apiConfigured ? `Send to ${destinationHost}` : 'Add an API key in Settings'}
            type="button"
            onClick={() => onConfirm(saveHistory)}
          >
            <Send aria-hidden="true" className="size-4" />
            {isBusy
              ? 'Starting...'
              : apiConfigured
                ? `Send to ${destinationHost}`
                : 'API key required'}
          </button>
          <button
            className="text-button w-full justify-center"
            disabled={isBusy}
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
        </footer>
      </div>
    </div>
  );
}
