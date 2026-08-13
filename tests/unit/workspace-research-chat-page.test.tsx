import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceResearchChatPage } from '../../src/renderer/components/workspace/research-chat/WorkspaceResearchChatPage';
import type {
  ResearchChatContextPreview,
  ResearchChatConversation,
} from '../../src/shared/contracts/research-chat';
import type { Workspace } from '../../src/shared/contracts/workspace';

const workspace: Workspace = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Chat Workspace',
  description: '',
  researchGoal: 'Audit clipping',
  status: 'active',
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
  rowVersion: 1,
};
const source = {
  alias: 'S1',
  chunkId: '550e8400-e29b-41d4-a716-446655440010',
  sourceType: 'paper' as const,
  title: 'PPO clipping',
  snippet: 'Clipping bounds the probability ratio.',
  citation: 'PPO, p. 3',
  score: 0.9,
  stale: false,
  unavailableReason: null,
  provenance: {
    sourceType: 'paper' as const,
    sourceIdentity: 'paper:ppo',
    snapshotIdentity: 'paper:v1',
    indexedAt: workspace.updatedAt,
    itemRef: {
      serverId: 'ServerIdentity01',
      library: { type: 'user' as const, id: '0' },
      itemKey: 'PAPERAA2',
    },
    attachmentKey: 'PDFATT22',
    pageNumber: 3,
  },
};
const preview: ResearchChatContextPreview = {
  id: '550e8400-e29b-41d4-a716-446655440020',
  workspaceId: workspace.id,
  questionId: null,
  query: 'Explain clipping',
  sourceTypes: ['paper'],
  retrievalVersion: 'chat-v1:knowledge-v1',
  searchMode: 'keyword',
  sources: [source],
  budget: {
    maximumCharacters: 12000,
    usedCharacters: 50,
    maximumSources: 12,
    candidateSources: 1,
    includedSources: 1,
    deduplicatedSources: 0,
    truncatedSources: 0,
  },
  createdAt: workspace.createdAt,
  expiresAt: '2026-08-11T00:10:00.000Z',
};

describe('WorkspaceResearchChatPage', () => {
  const prepareContext = vi.fn();
  const startTurn = vi.fn();
  const openCitation = vi.fn();

  beforeEach(() => {
    prepareContext.mockReset().mockResolvedValue({ ok: true, value: preview });
    startTurn.mockReset().mockResolvedValue({
      ok: true,
      value: {
        requestId: '550e8400-e29b-41d4-a716-446655440030',
        conversation: conversation(),
        assistantMessageId: '550e8400-e29b-41d4-a716-446655440032',
      },
    });
    openCitation.mockReset().mockResolvedValue({
      ok: true,
      value: { opened: true, target: 'paper', relatedId: 'PAPERAA2', reason: null },
    });
    Object.defineProperty(window, 'paperMind', {
      configurable: true,
      value: {
        ai: {
          getCapabilities: vi.fn().mockResolvedValue({
            ok: true,
            value: {
              providerId: 'openai',
              settings: {
                providerId: 'openai',
                baseUrl: 'https://api.openai.com/v1',
                model: 'gpt-5.6',
                temperature: 0.2,
                maxOutputTokens: 2048,
                saveHistoryByDefault: true,
              },
              credential: { configured: true, persistence: 'secure', backend: 'test' },
              providers: [
                {
                  id: 'openai',
                  name: 'OpenAI API',
                  status: 'connected',
                  available: true,
                  configured: true,
                  version: null,
                  plan: null,
                  models: [],
                  capabilities: ['Streaming'],
                  limitations: [],
                  lastError: null,
                },
              ],
              gate: {
                verdict: 'supported',
                checkedAt: '2026-08-12',
                integration: 'official-codex-app-server',
              },
              selectionOnlyByDefault: true,
            },
          }),
        },
        question: { list: vi.fn().mockResolvedValue({ ok: true, value: [] }) },
        researchChat: {
          getLatestConversation: vi.fn().mockResolvedValue({ ok: true, value: null }),
          prepareContext,
          startTurn,
          retryTurn: vi.fn(),
          cancelTurn: vi.fn(),
          openCitation,
          onStreamEvent: vi.fn().mockReturnValue(() => undefined),
        },
      },
    });
  });

  it('reviews bounded sources before sending and never accepts source payloads from the UI', async () => {
    render(<WorkspaceResearchChatPage workspace={workspace} />);
    await screen.findByText('Ask from bounded Workspace evidence');
    fireEvent.change(screen.getByLabelText('Ask Research Chat'), {
      target: { value: 'Explain clipping' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review sources' }));
    await screen.findByText('PPO clipping');
    expect(prepareContext).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: workspace.id,
        query: 'Explain clipping',
        sourceTypes: ['paper', 'code', 'question', 'link'],
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(startTurn).toHaveBeenCalledWith({
        contextId: preview.id,
        selectedAliases: ['S1'],
        conversationId: null,
      }),
    );
  });

  it('renders only persisted citation bindings as navigation actions', async () => {
    const existing = conversation('complete');
    window.paperMind.researchChat.getLatestConversation = vi
      .fn()
      .mockResolvedValue({ ok: true, value: existing });
    render(<WorkspaceResearchChatPage workspace={workspace} />);
    const citation = await screen.findByRole('button', { name: 'Open citation S1: PPO, p. 3' });
    fireEvent.click(citation);
    await waitFor(() =>
      expect(openCitation).toHaveBeenCalledWith({
        workspaceId: workspace.id,
        conversationId: existing.id,
        messageId: existing.messages[1]?.id,
        alias: 'S1',
      }),
    );
    expect(screen.getByText('[S999]').className).toContain('is-unsupported');
  });
});

function conversation(status: 'complete' | 'streaming' = 'streaming'): ResearchChatConversation {
  return {
    id: '550e8400-e29b-41d4-a716-446655440031',
    workspaceId: workspace.id,
    questionId: null,
    title: 'Explain clipping',
    providerId: 'openai',
    model: 'gpt-5.6',
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    messages: [
      {
        id: '550e8400-e29b-41d4-a716-446655440033',
        role: 'user',
        content: 'Explain clipping',
        status: 'complete',
        citations: [],
        unsupportedCitations: [],
        error: null,
        createdAt: workspace.createdAt,
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440032',
        role: 'assistant',
        content: status === 'complete' ? 'Bounded answer [S1] and unsupported [S999].' : '',
        status,
        citations: status === 'complete' ? [{ alias: 'S1', source }] : [],
        unsupportedCitations: status === 'complete' ? ['S999'] : [],
        error: null,
        createdAt: workspace.updatedAt,
      },
    ],
  };
}
