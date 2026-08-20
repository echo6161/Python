import { useCallback, useEffect, useState } from 'react';

import type {
  ResearchAgentProposal,
  ResearchAgentRun,
  ResearchAgentRunSummary,
} from '../../../../shared/contracts/research-agent';
import { rendererLogger } from '../../../logger';

export function useResearchAgentController(workspaceId: string) {
  const [runs, setRuns] = useState<readonly ResearchAgentRunSummary[]>([]);
  const [run, setRun] = useState<ResearchAgentRun | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.paperMind.researchAgent.listRuns(workspaceId);
      if (!result.ok) return setError(result.error.message);
      setRuns(result.value);
      const selected = result.value[0]?.id;
      if (!selected) return setRun(null);
      const details = await window.paperMind.researchAgent.getRun(workspaceId, selected);
      if (!details.ok) setError(details.error.message);
      else setRun(details.value);
    } catch (caught) {
      rendererLogger.error('Unable to load Research Agent runs', caught);
      setError('Research Agent runs could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRun(null);
      setRuns([]);
      setRequestId(null);
      void reload();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  useEffect(
    () =>
      window.paperMind.researchAgent.onRunEvent((event) => {
        if (event.type === 'delta') return;
        if (event.run.workspaceId !== workspaceId) return;
        setRun(event.run);
        setRuns((current) => [
          summary(event.run),
          ...current.filter(({ id }) => id !== event.run.id),
        ]);
        if (event.run.status !== 'running') setRequestId(null);
      }),
    [workspaceId],
  );

  const selectRun = useCallback(
    async (runId: string) => {
      setError(null);
      const result = await window.paperMind.researchAgent.getRun(workspaceId, runId);
      if (!result.ok) setError(result.error.message);
      else setRun(result.value);
    },
    [workspaceId],
  );

  const start = useCallback(
    async (goal: string) => {
      setError(null);
      const result = await window.paperMind.researchAgent.startRun({ workspaceId, goal });
      if (!result.ok) {
        setError(result.error.message);
        return false;
      }
      setRun(result.value.run);
      setRuns((current) => [summary(result.value.run), ...current]);
      setRequestId(result.value.requestId);
      return true;
    },
    [workspaceId],
  );

  const cancel = useCallback(async () => {
    if (!requestId) return;
    const result = await window.paperMind.researchAgent.cancelRun(requestId);
    if (!result.ok) setError(result.error.message);
  }, [requestId]);

  const openCitation = useCallback(
    async (alias: string) => {
      if (!run) return;
      const result = await window.paperMind.researchAgent.openCitation({
        workspaceId,
        runId: run.id,
        alias,
      });
      if (!result.ok) setError(result.error.message);
      else if (!result.value.opened)
        setError(result.value.reason ?? 'The Agent citation could not be opened.');
    },
    [run, workspaceId],
  );

  const reviewProposal = useCallback(
    async (proposal: ResearchAgentProposal, action: 'accept' | 'reject') => {
      if (!run) return false;
      const operation = action === 'accept' ? 'acceptProposal' : 'rejectProposal';
      const result = await window.paperMind.researchAgent[operation]({
        workspaceId,
        runId: run.id,
        proposalId: proposal.id,
        rowVersion: proposal.rowVersion,
      });
      if (!result.ok) {
        setError(result.error.message);
        return false;
      }
      setRun({
        ...run,
        proposals: run.proposals.map((current) =>
          current.id === result.value.id ? result.value : current,
        ),
      });
      return true;
    },
    [run, workspaceId],
  );

  return {
    runs,
    run,
    requestId,
    error,
    loading,
    reload,
    selectRun,
    start,
    cancel,
    openCitation,
    reviewProposal,
  };
}

function summary(run: ResearchAgentRun): ResearchAgentRunSummary {
  return {
    id: run.id,
    workspaceId: run.workspaceId,
    goal: run.goal,
    status: run.status,
    terminationReason: run.terminationReason,
    toolCalls: run.usage.toolCalls,
    citationCount: run.citations.length,
    proposalCount: run.proposals.length,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
  };
}
