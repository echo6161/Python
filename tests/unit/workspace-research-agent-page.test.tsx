import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceResearchAgentPage } from '../../src/renderer/components/workspace/research-agent/WorkspaceResearchAgentPage';
import type { ResearchAgentRun } from '../../src/shared/contracts/research-agent';
import type { Workspace } from '../../src/shared/contracts/workspace';

const workspace: Workspace = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Agent Workspace',
  description: '',
  researchGoal: 'Compare paper and code.',
  status: 'active',
  createdAt: '2026-08-19T00:00:00.000Z',
  updatedAt: '2026-08-19T00:00:00.000Z',
  rowVersion: 1,
};
const run: ResearchAgentRun = {
  id: '22222222-2222-4222-8222-222222222222',
  workspaceId: workspace.id,
  goal: workspace.researchGoal,
  status: 'succeeded',
  terminationReason: 'completed',
  answerMarkdown: 'Bounded answer [S1] [S99].',
  uncertainty: 'Only indexed evidence was inspected.',
  providerId: 'openai',
  model: 'mock-agent',
  budget: {
    maximumSteps: 10,
    maximumToolCalls: 10,
    maximumContextCharacters: 16000,
    timeoutMs: 60000,
  },
  usage: { steps: 3, toolCalls: 3, contextCharacters: 1200 },
  trace: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      ordinal: 0,
      toolName: 'search_knowledge',
      status: 'succeeded',
      inputSummary: 'bounded query',
      outputSummary: '2 bounded mixed results',
      errorCode: null,
      errorMessage: null,
      startedAt: workspace.createdAt,
      completedAt: workspace.updatedAt,
    },
  ],
  citations: [
    {
      alias: 'S1',
      chunkId: '44444444-4444-4444-8444-444444444444',
      sourceType: 'paper',
      title: 'PPO clipping objective',
      snippet: 'Bounded excerpt.',
      citation: 'PPO paper, p. 3',
      stale: false,
      unavailableReason: null,
      provenance: {
        sourceType: 'paper',
        sourceIdentity: 'paper',
        snapshotIdentity: 'paper:v1',
        indexedAt: workspace.createdAt,
        itemRef: {
          serverId: 'fixture-server',
          library: { type: 'user', id: '1' },
          itemKey: 'ABCD2345',
        },
        attachmentKey: 'BCDE2345',
        pageNumber: 3,
      },
    },
  ],
  proposals: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      runId: '22222222-2222-4222-8222-222222222222',
      workspaceId: workspace.id,
      kind: 'memory',
      title: 'Candidate synthesis',
      bodyMarkdown: 'Review this before Memory confirmation.',
      reason: 'Potentially durable conclusion.',
      status: 'pending',
      downstreamProposalId: null,
      createdAt: workspace.createdAt,
      reviewedAt: null,
      rowVersion: 1,
    },
  ],
  error: null,
  createdAt: workspace.createdAt,
  startedAt: workspace.createdAt,
  completedAt: workspace.updatedAt,
};

describe('WorkspaceResearchAgentPage', () => {
  const acceptProposal = vi.fn();
  const startRun = vi.fn();
  beforeEach(() => {
    startRun.mockReset();
    acceptProposal.mockReset().mockResolvedValue({
      ok: true,
      value: { ...run.proposals[0], status: 'accepted', rowVersion: 2 },
    });
    Object.defineProperty(window, 'paperMind', {
      configurable: true,
      value: {
        researchAgent: {
          listRuns: vi.fn().mockResolvedValue({
            ok: true,
            value: [
              {
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
              },
            ],
          }),
          getRun: vi.fn().mockResolvedValue({ ok: true, value: run }),
          startRun,
          cancelRun: vi.fn(),
          openCitation: vi.fn().mockResolvedValue({
            ok: true,
            value: { opened: true, target: 'paper', relatedId: null, reason: null },
          }),
          acceptProposal,
          rejectProposal: vi.fn(),
          onRunEvent: vi.fn().mockReturnValue(() => undefined),
        },
      },
    });
  });

  it('shows dense answer, limits, trace, sources and an explicitly unconfirmed proposal', async () => {
    render(<WorkspaceResearchAgentPage workspace={workspace} />);
    expect(await screen.findByText('Bounded answer [S1] [S99].')).toBeTruthy();
    expect(screen.getAllByText('3 / 10')).toHaveLength(2);
    expect(screen.getByText('2 bounded mixed results')).toBeTruthy();
    expect(screen.getByText('PPO clipping objective')).toBeTruthy();
    expect(screen.getByText('pending · not canonical Memory')).toBeTruthy();
    expect(screen.getByText(/Unsupported citation: S99/u)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Candidate synthesis/u }));
    expect(await screen.findByText(/not confirmed Memory/u)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send to Memory review' }));
    await waitFor(() => expect(acceptProposal).toHaveBeenCalledTimes(1));
  });

  it('shows a clear provider error without creating a fake run', async () => {
    startRun.mockResolvedValue({
      ok: false,
      error: { code: 'PERMISSION_DENIED', message: 'Connect an AI provider in Settings first.' },
    });
    Object.defineProperty(window.paperMind.researchAgent, 'listRuns', {
      configurable: true,
      value: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    });
    render(<WorkspaceResearchAgentPage workspace={workspace} />);
    await screen.findByText('Start a bounded, read-only investigation');
    fireEvent.click(screen.getByRole('button', { name: 'Run Agent' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Connect an AI provider in Settings first.',
    );
    expect(screen.queryByText('Completed', { exact: true })).toBeNull();
  });
});
