import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceQuestionSection } from '../../src/renderer/components/workspace/question/WorkspaceQuestionSection';
import type {
  ResearchQuestion,
  ResearchQuestionDetails,
} from '../../src/shared/contracts/question';
import type { Workspace } from '../../src/shared/contracts/workspace';

const workspace: Workspace = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Evidence review',
  description: '',
  researchGoal: '',
  status: 'active',
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
  rowVersion: 1,
};
const question: ResearchQuestion = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  workspaceId: workspace.id,
  title: 'Does clipping constrain divergence?',
  description: 'Compare claim and code.',
  status: 'investigating',
  priority: 'high',
  archivedAt: null,
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T01:00:00.000Z',
  rowVersion: 2,
};
const details: ResearchQuestionDetails = {
  question,
  evidence: [
    {
      id: '550e8400-e29b-41d4-a716-446655440003',
      questionId: question.id,
      workspaceId: workspace.id,
      kind: 'zotero_paper',
      note: 'Claim',
      sourceSnapshotIdentity: 'zotero:source',
      sortOrder: 0,
      availability: 'available',
      availabilityReason: null,
      createdAt: question.createdAt,
      itemRef: {
        serverId: 'ServerIdentity01',
        library: { type: 'user', id: '0' },
        itemKey: 'PAPERAA2',
      },
      itemVersion: 4,
      pageNumber: 3,
      textAnchor: null,
      item: {
        ref: {
          serverId: 'ServerIdentity01',
          library: { type: 'user', id: '0' },
          itemKey: 'PAPERAA2',
        },
        itemType: 'journalArticle',
        title: 'PPO paper',
        creators: [],
        date: '2017',
        year: 2017,
        publication: null,
        pdf: { hasPdf: true, state: 'available', storageMode: 'stored' },
        version: 4,
        doi: null,
        abstract: null,
        url: null,
        tags: [],
        collections: [],
      },
      pdf: { hasPdf: true, state: 'available', storageMode: 'stored' },
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440004',
      questionId: question.id,
      workspaceId: workspace.id,
      kind: 'code',
      note: 'Implementation',
      sourceSnapshotIdentity: 'snapshot:old',
      sortOrder: 1,
      availability: 'stale',
      availabilityReason: 'The repository content changed after this Evidence was recorded.',
      createdAt: question.createdAt,
      repositoryId: '550e8400-e29b-41d4-a716-446655440005',
      repositoryName: 'PPO source',
      language: 'python',
      relativePath: 'src/ppo.py',
      symbolKind: 'function',
      symbolName: 'clipped_loss',
      startLine: 10,
      endLine: 14,
      contentHash: 'a'.repeat(64),
      currentSnapshotIdentity: 'snapshot:new',
    },
  ],
};
const PAPER_EVIDENCE_ID = '550e8400-e29b-41d4-a716-446655440003';

describe('Workspace Research Questions UI', () => {
  const removeEvidence = vi.fn();
  const openEvidence = vi.fn();
  beforeEach(() => {
    removeEvidence
      .mockReset()
      .mockResolvedValue({ ok: true, value: { ...details, evidence: details.evidence.slice(1) } });
    openEvidence.mockReset().mockResolvedValue({
      ok: true,
      value: {
        evidenceId: PAPER_EVIDENCE_ID,
        opened: true,
        target: 'zotero_pdf',
        reason: null,
      },
    });
    Object.defineProperty(window, 'paperMind', {
      configurable: true,
      value: {
        question: {
          list: vi.fn().mockResolvedValue({ ok: true, value: [question] }),
          get: vi.fn().mockResolvedValue({ ok: true, value: details }),
          create: vi.fn(),
          update: vi.fn(),
          setStatus: vi.fn(),
          archive: vi.fn(),
          delete: vi.fn(),
          addZoteroEvidence: vi.fn(),
          addCodeEvidence: vi.fn(),
          removeEvidence,
          reorderEvidence: vi.fn(),
          openEvidence,
        },
      },
    });
  });

  it('distinguishes Question state and paper/code Evidence with provenance status', async () => {
    render(<WorkspaceQuestionSection workspace={workspace} />);
    expect(await screen.findByDisplayValue('Does clipping constrain divergence?')).toBeDefined();
    expect(await screen.findByText('Zotero Evidence')).toBeDefined();
    expect(screen.getByText('Code Evidence')).toBeDefined();
    expect(screen.getByText('PPO paper')).toBeDefined();
    expect(screen.getByText('clipped_loss')).toBeDefined();
    expect(screen.getByText('stale')).toBeDefined();
    expect(screen.getByText(/src\/ppo.py:10-14/u)).toBeDefined();
  });

  it('routes navigation and removal through domain-specific Question APIs', async () => {
    render(<WorkspaceQuestionSection workspace={workspace} />);
    await screen.findByText('PPO paper');
    const evidence = screen.getByRole('list', { name: 'Question Evidence' });
    const openButton = within(evidence)
      .getAllByRole('button', { name: 'Open Evidence source' })
      .at(0);
    expect(openButton).toBeDefined();
    if (!openButton) throw new Error('Expected an Evidence navigation button.');
    fireEvent.click(openButton);
    await waitFor(() =>
      expect(openEvidence).toHaveBeenCalledWith({
        workspaceId: workspace.id,
        questionId: question.id,
        evidenceId: PAPER_EVIDENCE_ID,
      }),
    );
    const removeButton = within(evidence).getAllByRole('button', { name: 'Remove Evidence' }).at(0);
    expect(removeButton).toBeDefined();
    if (!removeButton) throw new Error('Expected an Evidence removal button.');
    fireEvent.click(removeButton);
    await waitFor(() =>
      expect(removeEvidence).toHaveBeenCalledWith({
        workspaceId: workspace.id,
        questionId: question.id,
        evidenceId: PAPER_EVIDENCE_ID,
      }),
    );
  });
});
