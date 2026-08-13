import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Bot, Settings, Square, Send } from 'lucide-react';

import type {
  AiCapabilities,
  AiConversation,
  AiSelectionScope,
  AiStreamEvent,
  AiTaskKind,
} from '../../shared/contracts/ai';
import { AiRequestDialog } from './AiRequestDialog';

export interface AiTaskDraft {
  readonly kind: AiTaskKind;
  readonly prompt: string | null;
  readonly selection: AiSelectionScope | null;
}

interface ActiveRequest {
  readonly assistantMessageId: string;
  readonly paperId: string;
  readonly requestId: string;
}

interface LoadedConversation {
  readonly paperId: string;
  readonly value: AiConversation | null;
}

interface AiAssistantSidebarProps {
  readonly paperId: string | null;
  readonly pendingTask?: AiTaskDraft | null;
  readonly onOpenSettings: () => void;
  readonly onPendingTaskHandled?: () => void;
}

function resultMessage(error: { readonly message: string }): string {
  return error.message || 'The AI request could not be completed.';
}

export function AiAssistantSidebar({
  paperId,
  pendingTask = null,
  onOpenSettings,
  onPendingTaskHandled,
}: AiAssistantSidebarProps) {
  const [capabilities, setCapabilities] = useState<AiCapabilities | null>(null);
  const [loadedConversation, setLoadedConversation] = useState<LoadedConversation | null>(null);
  const [localDraft, setLocalDraft] = useState<AiTaskDraft | null>(null);
  const [handledPendingTask, setHandledPendingTask] = useState<AiTaskDraft | null>(null);
  const [attachedSelection, setAttachedSelection] = useState<AiSelectionScope | null>(null);
  const [prompt, setPrompt] = useState('');
  const [activeRequest, setActiveRequest] = useState<ActiveRequest | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isManualBridgeBusy, setIsManualBridgeBusy] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const activeRequestRef = useRef<ActiveRequest | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;
    void window.paperMind.ai
      .getCapabilities()
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setError(resultMessage(result.error));
          return;
        }
        setCapabilities(result.value);
      })
      .catch(() => {
        if (active) setError('AI settings could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!paperId) return;
    void window.paperMind.ai
      .getConversation(paperId)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setError(resultMessage(result.error));
          return;
        }
        setLoadedConversation({ paperId, value: result.value });
      })
      .catch(() => {
        if (active) setError('The local AI conversation could not be loaded.');
      });
    return () => {
      active = false;
      const request = activeRequestRef.current;
      if (request?.paperId === paperId) {
        activeRequestRef.current = null;
        void window.paperMind.ai.cancelTask(request.requestId);
      }
    };
  }, [paperId]);

  const unhandledPendingTask = pendingTask === handledPendingTask ? null : pendingTask;
  const attachmentTask =
    unhandledPendingTask?.kind === 'follow_up' && unhandledPendingTask.prompt === null
      ? unhandledPendingTask
      : null;
  const externalDraft = attachmentTask ? null : unhandledPendingTask;
  const draft = externalDraft ?? localDraft;
  const conversation = loadedConversation?.paperId === paperId ? loadedConversation.value : null;
  const currentActiveRequest = activeRequest?.paperId === paperId ? activeRequest : null;
  const currentAttachedSelection =
    attachmentTask?.selection ??
    (attachedSelection?.paperId === paperId ? attachedSelection : null);
  const isLoading = paperId !== null && loadedConversation?.paperId !== paperId;

  useEffect(() => {
    if (attachmentTask) promptRef.current?.focus();
  }, [attachmentTask]);

  useEffect(() => {
    const updateFromStream = (event: AiStreamEvent) => {
      const active = activeRequestRef.current;
      if (event.requestId !== active?.requestId) return;

      if (event.type === 'delta') {
        setLoadedConversation((current) => {
          if (current?.value?.id !== event.conversationId) return current;
          return {
            ...current,
            value: {
              ...current.value,
              messages: current.value.messages.map((message) =>
                message.id === event.assistantMessageId
                  ? { ...message, content: `${message.content}${event.delta}` }
                  : message,
              ),
            },
          };
        });
        return;
      }

      setLoadedConversation((current) => {
        if (current?.value?.id !== event.conversationId) return current;
        const hasMessage = current.value.messages.some(({ id }) => id === event.message.id);
        return {
          ...current,
          value: {
            ...current.value,
            messages: hasMessage
              ? current.value.messages.map((message) =>
                  message.id === event.message.id ? event.message : message,
                )
              : [...current.value.messages, event.message],
            updatedAt: event.message.createdAt,
          },
        };
      });
      if (event.type === 'error') setError(event.error.message);
      activeRequestRef.current = null;
      setActiveRequest(null);
      setIsCancelling(false);
    };

    return window.paperMind.ai.onStreamEvent(updateFromStream);
  }, []);

  const closeDraft = () => {
    setLocalDraft(null);
    if (unhandledPendingTask) {
      setHandledPendingTask(unhandledPendingTask);
      onPendingTaskHandled?.();
    }
  };

  const startDraft = async (saveHistory: boolean) => {
    if (!draft || !paperId) return;
    const activeProvider = capabilities?.providers.find(({ id }) => id === capabilities.providerId);
    if (!activeProvider?.configured) {
      setError('Connect the current AI provider in Settings before using AI tools.');
      closeDraft();
      return;
    }

    setIsStarting(true);
    setIsCancelling(false);
    setError(null);
    setNotice(null);
    try {
      const result = await window.paperMind.ai.startTask({
        kind: draft.kind,
        paperId,
        selection: draft.selection,
        prompt: draft.prompt,
        conversationId:
          saveHistory && conversation && !conversation.persisted
            ? null
            : (conversation?.id ?? null),
        saveHistory,
      });
      if (!result.ok) {
        setError(resultMessage(result.error));
        closeDraft();
        return;
      }

      const request = {
        requestId: result.value.requestId,
        assistantMessageId: result.value.assistantMessageId,
        paperId,
      };
      activeRequestRef.current = request;
      setActiveRequest(request);
      setLoadedConversation({ paperId, value: result.value.conversation });
      setAttachedSelection(draft.selection);
      setPrompt('');
      closeDraft();
    } catch {
      setError('The AI service could not be reached. Check the network and provider settings.');
      closeDraft();
    } finally {
      setIsStarting(false);
    }
  };

  const openChatGptBridge = async () => {
    if (!draft) return;
    setIsManualBridgeBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await window.paperMind.ai.openChatGptBridge({
        kind: draft.kind,
        selection: draft.selection,
        prompt: draft.prompt,
      });
      if (!result.ok) {
        setError(resultMessage(result.error));
        return;
      }
      setNotice(
        result.value.opened
          ? 'Prompt copied. Paste it into ChatGPT and submit it when ready.'
          : 'Prompt copied, but ChatGPT could not be opened. Open chatgpt.com manually and paste it.',
      );
      closeDraft();
    } catch {
      setError('The ChatGPT handoff could not be prepared.');
    } finally {
      setIsManualBridgeBusy(false);
    }
  };

  const cancelActiveRequest = async () => {
    const active = activeRequestRef.current;
    if (!active) return;
    setIsCancelling(true);
    try {
      const result = await window.paperMind.ai.cancelTask(active.requestId);
      if (!result.ok) {
        setError(resultMessage(result.error));
        setIsCancelling(false);
      }
    } catch {
      setError('The request could not be cancelled.');
      setIsCancelling(false);
    }
  };

  const prepareFollowUp = (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const value = prompt.trim();
    if (!paperId || !value || currentActiveRequest) return;
    setLocalDraft({
      kind: conversation ? 'follow_up' : 'chat',
      selection: currentAttachedSelection,
      prompt: value,
    });
  };

  const messages = conversation?.messages ?? [];
  const activeProvider = capabilities?.providers.find(({ id }) => id === capabilities.providerId);
  const isConfigured = activeProvider?.configured ?? false;

  return (
    <section
      aria-labelledby="ai-assistant-heading"
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white"
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 px-4">
        <div className="min-w-0">
          <h2
            id="ai-assistant-heading"
            className="flex items-center gap-2 text-sm font-semibold text-zinc-900"
          >
            <Bot aria-hidden="true" className="size-4" />
            AI Assistant
          </h2>
          <p className="mt-0.5 truncate text-xs text-zinc-500">
            {capabilities
              ? `${activeProvider?.name ?? 'AI provider'} · ${isConfigured ? 'Ready' : 'Not configured'}`
              : 'Loading provider status...'}
          </p>
        </div>
        <button
          aria-label="Open AI settings"
          className="icon-button"
          title="AI settings"
          type="button"
          onClick={onOpenSettings}
        >
          <Settings aria-hidden="true" className="size-4" />
        </button>
      </header>

      {error ? (
        <div
          className="border-b border-red-200 bg-red-50 px-4 py-3 text-xs leading-5 text-red-800"
          role="alert"
        >
          {error}
          <button
            className="ml-2 font-semibold underline"
            type="button"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {notice ? (
        <div
          className="border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900"
          role="status"
        >
          {notice}
          <button
            className="ml-2 font-semibold underline"
            type="button"
            onClick={() => setNotice(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto" role="log" aria-label="AI conversation">
        {!paperId ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-500">
            Select a paper to use the assistant.
          </div>
        ) : isLoading ? (
          <div
            className="flex h-full items-center justify-center p-6 text-sm text-zinc-500"
            role="status"
          >
            Loading local conversation...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-500">
            Select PDF text for translation or explanation, or ask a general question below.
          </div>
        ) : (
          <ol className="divide-y divide-zinc-100">
            {messages.map((message) => (
              <li key={message.id} className="px-4 py-4">
                <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase text-zinc-500">
                  <span>{message.role === 'assistant' ? 'AI-generated' : 'You'}</span>
                  {message.status !== 'complete' ? <span>{message.status}</span> : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-zinc-700">
                  {message.content ||
                    (message.status === 'streaming' ? 'Waiting for response...' : '')}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>

      {currentActiveRequest ? (
        <div
          className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50 px-4"
          role="status"
        >
          <span className="text-xs text-zinc-600">
            {isCancelling ? 'Cancelling request...' : 'AI is responding...'}
          </span>
          <button
            className="command-button bg-red-700 hover:bg-red-800"
            disabled={isCancelling}
            type="button"
            onClick={() => void cancelActiveRequest()}
          >
            <Square aria-hidden="true" className="size-3.5" />
            Cancel
          </button>
        </div>
      ) : null}

      <form className="shrink-0 border-t border-zinc-200 p-3" onSubmit={prepareFollowUp}>
        {currentAttachedSelection ? (
          <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
            <span className="min-w-0 truncate">
              Page {currentAttachedSelection.pageNumber} selection attached
            </span>
            <button
              className="shrink-0 font-semibold text-zinc-700 underline"
              type="button"
              onClick={() => {
                setAttachedSelection(null);
                if (attachmentTask) {
                  setHandledPendingTask(attachmentTask);
                  onPendingTaskHandled?.();
                }
              }}
            >
              Remove
            </button>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            ref={promptRef}
            aria-label="Ask AI assistant"
            className="max-h-32 min-h-16 min-w-0 flex-1 resize-y rounded border border-zinc-200 px-2 py-2 text-xs leading-5 outline-none focus:border-emerald-600"
            disabled={!paperId || Boolean(currentActiveRequest)}
            maxLength={4_000}
            placeholder="Ask a question"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <button
            aria-label="Review AI request"
            className="icon-button border-zinc-200 bg-zinc-900 text-white hover:bg-zinc-800 hover:text-white"
            disabled={!paperId || Boolean(currentActiveRequest) || prompt.trim().length === 0}
            title="Review request"
            type="submit"
          >
            <Send aria-hidden="true" className="size-4" />
          </button>
        </div>
      </form>

      {draft ? (
        <AiRequestDialog
          apiConfigured={isConfigured}
          defaultSaveHistory={capabilities?.settings.saveHistoryByDefault ?? true}
          destinationHost={
            capabilities?.providerId === 'codex'
              ? 'ChatGPT via official Codex'
              : capabilities
                ? new URL(capabilities.settings.baseUrl).hostname
                : 'AI provider'
          }
          history={messages}
          historyPersisted={conversation?.persisted ?? true}
          isBusy={isStarting || isManualBridgeBusy}
          isManualBridgeBusy={isManualBridgeBusy}
          kind={draft.kind}
          prompt={draft.prompt}
          selection={draft.selection}
          onCancel={closeDraft}
          onConfirm={(saveHistory) => void startDraft(saveHistory)}
          onOpenChatGpt={() => void openChatGptBridge()}
        />
      ) : null}
    </section>
  );
}
