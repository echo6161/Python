import { useCallback, useEffect, useState } from 'react';

import type {
  KnowledgeIndexProgress,
  KnowledgeIndexStatus,
  KnowledgeSearchPage,
  KnowledgeSourceType,
} from '../../../../shared/contracts/knowledge';

export function useKnowledgeController(workspaceId: string) {
  const [status, setStatus] = useState<KnowledgeIndexStatus | null>(null);
  const [progress, setProgress] = useState<KnowledgeIndexProgress | null>(null);
  const [results, setResults] = useState<KnowledgeSearchPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const response = await window.paperMind.knowledge.getStatus(workspaceId);
    if (response.ok) setStatus(response.value);
    else setFeedback(response.error.message);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshStatus(), 0);
    const unsubscribe = window.paperMind.knowledge.onProgress((next) => {
      if (next.workspaceId === workspaceId) setProgress(next);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [refreshStatus, workspaceId]);

  useEffect(() => {
    if (status?.status !== 'indexing') return;
    const timer = window.setInterval(() => void refreshStatus(), 700);
    return () => window.clearInterval(timer);
  }, [refreshStatus, status?.status]);

  const runIndex = useCallback(
    async (mode: 'incremental' | 'rebuild') => {
      setFeedback(null);
      const response = await window.paperMind.knowledge.runIndex({
        workspaceId,
        requestId: crypto.randomUUID(),
        mode,
      });
      if (response.ok) setStatus(response.value);
      else setFeedback(response.error.message);
    },
    [workspaceId],
  );

  const cancel = useCallback(async () => {
    if (!status?.activeRequestId) return;
    const response = await window.paperMind.knowledge.cancelIndex(status.activeRequestId);
    if (!response.ok) setFeedback(response.error.message);
  }, [status]);

  const remove = useCallback(async () => {
    const response = await window.paperMind.knowledge.removeIndex({
      workspaceId,
      confirmation: 'REMOVE_KNOWLEDGE_INDEX',
    });
    if (response.ok) {
      setResults(null);
      await refreshStatus();
    } else setFeedback(response.error.message);
  }, [refreshStatus, workspaceId]);

  const search = useCallback(
    async (query: string, sourceTypes: readonly KnowledgeSourceType[], offset = 0) => {
      setSearching(true);
      setFeedback(null);
      const response = await window.paperMind.knowledge.search({
        workspaceId,
        query,
        sourceTypes,
        offset,
        limit: 20,
      });
      if (response.ok) setResults(response.value);
      else setFeedback(response.error.message);
      setSearching(false);
    },
    [workspaceId],
  );

  return {
    cancel,
    feedback,
    loading,
    progress,
    refreshStatus,
    remove,
    results,
    runIndex,
    search,
    searching,
    status,
  };
}
