import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceKnowledgePage } from '../../src/renderer/components/workspace/knowledge/WorkspaceKnowledgePage';
import type {
  KnowledgeIndexStatus,
  KnowledgeSearchPage,
} from '../../src/shared/contracts/knowledge';
import type { Workspace } from '../../src/shared/contracts/workspace';

const workspace: Workspace = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Knowledge',
  description: '',
  researchGoal: 'Understand clipping',
  status: 'active',
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
  rowVersion: 1,
};
const status: KnowledgeIndexStatus = {
  workspaceId: workspace.id,
  status: 'ready',
  indexVersion: 'v1',
  embeddingProvider: null,
  sourceCount: 4,
  chunkCount: 12,
  processedSources: 4,
  totalSources: 4,
  activeRequestId: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  startedAt: workspace.createdAt,
  completedAt: workspace.updatedAt,
  updatedAt: workspace.updatedAt,
};
const page: KnowledgeSearchPage = {
  mode: 'keyword',
  offset: 0,
  limit: 20,
  total: 2,
  results: [
    {
      chunkId: '550e8400-e29b-41d4-a716-446655440010',
      sourceType: 'paper',
      title: 'PPO clipping paper',
      snippet: 'The clipping objective bounds the policy ratio.',
      citation: 'PPO paper, p. 3',
      score: 0.88,
      keywordScore: 0.88,
      semanticScore: null,
      stale: false,
      unavailableReason: null,
      provenance: {
        sourceType: 'paper',
        sourceIdentity: 'paper:a',
        snapshotIdentity: 'paper:v1',
        indexedAt: workspace.updatedAt,
        itemRef: {
          serverId: 'ServerIdentity01',
          library: { type: 'user', id: '0' },
          itemKey: 'PAPERAA2',
        },
        attachmentKey: 'PDFATT22',
        pageNumber: 3,
      },
    },
    {
      chunkId: '550e8400-e29b-41d4-a716-446655440011',
      sourceType: 'code',
      title: 'src/policy.ts',
      snippet: 'function clippedObjective()',
      citation: 'repo/src/policy.ts:10-18',
      score: 0.7,
      keywordScore: 0.7,
      semanticScore: null,
      stale: false,
      unavailableReason: null,
      provenance: {
        sourceType: 'code',
        sourceIdentity: 'code:a',
        snapshotIdentity: 'commit:a',
        indexedAt: workspace.updatedAt,
        repositoryId: '550e8400-e29b-41d4-a716-446655440012',
        repositoryName: 'repo',
        language: 'typescript',
        relativePath: 'src/policy.ts',
        startLine: 10,
        endLine: 18,
      },
    },
  ],
};

describe('WorkspaceKnowledgePage', () => {
  const search = vi.fn();
  const openResult = vi.fn();

  beforeEach(() => {
    search.mockReset().mockResolvedValue({ ok: true, value: page });
    openResult.mockReset().mockResolvedValue({
      ok: true,
      value: { opened: true, target: 'paper', relatedId: 'PAPERAA2', reason: null },
    });
    Object.defineProperty(window, 'paperMind', {
      configurable: true,
      value: {
        knowledge: {
          getStatus: vi.fn().mockResolvedValue({ ok: true, value: status }),
          runIndex: vi.fn(),
          cancelIndex: vi.fn(),
          removeIndex: vi.fn(),
          search,
          openResult,
          onProgress: vi.fn().mockReturnValue(() => undefined),
        },
      },
    });
  });

  it('keeps query, scopes, index status, mixed results, and provenance in one work context', async () => {
    render(<WorkspaceKnowledgePage workspace={workspace} />);
    await screen.findByText('4 sources / 12 chunks / keyword only');
    fireEvent.change(screen.getByLabelText('Search Workspace Knowledge'), {
      target: { value: 'clipping' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('PPO clipping paper');
    screen.getByText('src/policy.ts');
    fireEvent.click(screen.getByText('PPO clipping paper'));
    const detail = screen.getByRole('complementary', { name: 'Source provenance' });
    expect(detail.textContent).toContain('PPO paper, p. 3');
    expect(detail.textContent).toContain('page Number');
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'clipping',
        sourceTypes: ['paper', 'code', 'question', 'link'],
      }),
    );
  });

  it('opens a selected source only through the Knowledge domain API', async () => {
    render(<WorkspaceKnowledgePage workspace={workspace} />);
    fireEvent.change(screen.getByLabelText('Search Workspace Knowledge'), {
      target: { value: 'clipping' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(await screen.findByText('PPO clipping paper'));
    fireEvent.click(screen.getByRole('button', { name: 'Open source' }));
    await waitFor(() =>
      expect(openResult).toHaveBeenCalledWith({
        workspaceId: workspace.id,
        chunkId: page.results[0]?.chunkId,
      }),
    );
  });
});
