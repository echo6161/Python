import { useCallback, useEffect, useState } from 'react';

import type { AiCapabilities } from '../../../../shared/contracts/ai';
import type { KnowledgeSourceType } from '../../../../shared/contracts/knowledge';
import type {
  ResearchChatContextSource,
  ResearchChatContextPreview,
  ResearchChatConversation,
  ResearchChatMessage,
} from '../../../../shared/contracts/research-chat';
import { rendererLogger } from '../../../logger';

export function useResearchChatController(workspaceId: string, questionId: string | null) {
  const [capabilities, setCapabilities] = useState<AiCapabilities | null>(null);
  const [conversation, setConversation] = useState<ResearchChatConversation | null>(null);
  const [preview, setPreview] = useState<ResearchChatContextPreview | null>(null);
  const [selectedAliases, setSelectedAliases] = useState<readonly string[]>([]);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [activeSources, setActiveSources] = useState<readonly ResearchChatContextSource[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [chat, ai] = await Promise.all([
        window.paperMind.researchChat.getLatestConversation(workspaceId, questionId),
        window.paperMind.ai.getCapabilities(),
      ]);
      if (!chat.ok) setError(chat.error.message);
      else setConversation(chat.value);
      if (!ai.ok) setError(ai.error.message);
      else setCapabilities(ai.value);
    } catch (caught) {
      rendererLogger.error('Unable to load Research Chat', caught);
      setError('Research Chat could not be loaded.');
    }
  }, [questionId, workspaceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPreview(null);
      setSelectedAliases([]);
      setConversation(null);
      setActiveSources([]);
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(
    () =>
      window.paperMind.researchChat.onStreamEvent((event) => {
        setConversation((current) => {
          if (current?.id !== event.conversationId) return current;
          if (event.type === 'delta') {
            return {
              ...current,
              messages: current.messages.map((message) =>
                message.id === event.assistantMessageId
                  ? { ...message, content: message.content + event.delta }
                  : message,
              ),
            };
          }
          return {
            ...current,
            messages: current.messages.map((message) =>
              message.id === event.message.id ? event.message : message,
            ),
          };
        });
        if (event.type !== 'delta') {
          setRequestId(null);
          if (event.type === 'error') setError(event.error.message);
        }
      }),
    [],
  );

  const prepare = useCallback(
    async (query: string, sourceTypes: readonly KnowledgeSourceType[]) => {
      setPreparing(true);
      setError(null);
      try {
        const result = await window.paperMind.researchChat.prepareContext({
          workspaceId,
          questionId,
          query,
          sourceTypes,
        });
        if (!result.ok) {
          setError(result.error.message);
          return false;
        }
        setPreview(result.value);
        setSelectedAliases(result.value.sources.map(({ alias }) => alias));
        return true;
      } finally {
        setPreparing(false);
      }
    },
    [questionId, workspaceId],
  );

  const send = useCallback(async () => {
    if (!preview) return false;
    setError(null);
    const result = await window.paperMind.researchChat.startTurn({
      contextId: preview.id,
      selectedAliases,
      conversationId: conversation?.id ?? null,
    });
    if (!result.ok) {
      setError(result.error.message);
      return false;
    }
    setActiveSources(preview.sources.filter(({ alias }) => selectedAliases.includes(alias)));
    setConversation(result.value.conversation);
    setRequestId(result.value.requestId);
    setPreview(null);
    return true;
  }, [conversation?.id, preview, selectedAliases]);

  const cancel = useCallback(async () => {
    if (!requestId) return;
    const result = await window.paperMind.researchChat.cancelTurn(requestId);
    if (!result.ok) setError(result.error.message);
  }, [requestId]);

  const retry = useCallback(
    async (message: ResearchChatMessage) => {
      if (!conversation) return;
      setError(null);
      const result = await window.paperMind.researchChat.retryTurn({
        workspaceId,
        conversationId: conversation.id,
        assistantMessageId: message.id,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setConversation(result.value.conversation);
      setRequestId(result.value.requestId);
    },
    [conversation, workspaceId],
  );

  const openCitation = useCallback(
    async (messageId: string, alias: string) => {
      if (!conversation) return;
      const result = await window.paperMind.researchChat.openCitation({
        workspaceId,
        conversationId: conversation.id,
        messageId,
        alias,
      });
      if (!result.ok) setError(result.error.message);
      else if (!result.value.opened)
        setError(result.value.reason ?? 'The citation could not be opened.');
    },
    [conversation, workspaceId],
  );

  return {
    capabilities,
    conversation,
    preview,
    activeSources,
    selectedAliases,
    requestId,
    preparing,
    error,
    setSelectedAliases,
    prepare,
    send,
    cancel,
    retry,
    openCitation,
    reload: load,
  };
}
