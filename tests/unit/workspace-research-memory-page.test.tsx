import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceResearchMemoryPage } from '../../src/renderer/components/workspace/research-memory/WorkspaceResearchMemoryPage';
import type {
  ResearchContentItem,
  ResearchMemoryProposal,
} from '../../src/shared/contracts/research-memory';
import type { Workspace } from '../../src/shared/contracts/workspace';

const workspace: Workspace = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Memory Workspace',
  description: '',
  researchGoal: 'Retain evidence',
  status: 'active',
  createdAt: '2026-08-13T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
  rowVersion: 1,
};
const note: ResearchContentItem = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  workspaceId: workspace.id,
  type: 'note',
  title: 'Clipping note',
  bodyMarkdown: 'Clipping does not directly constrain KL.',
  status: 'active',
  createdAt: workspace.createdAt,
  updatedAt: workspace.updatedAt,
  rowVersion: 1,
  references: [
    {
      id: '550e8400-e29b-41d4-a716-446655440003',
      workspaceId: workspace.id,
      ownerType: 'note',
      ownerId: '550e8400-e29b-41d4-a716-446655440002',
      chunkId: '550e8400-e29b-41d4-a716-446655440004',
      sourceType: 'paper',
      title: 'PPO',
      citation: 'PPO, p. 3',
      snippet: 'Clipped surrogate.',
      provenance: {
        sourceType: 'paper',
        sourceIdentity: 'paper:ppo',
        snapshotIdentity: 'paper:v1',
        indexedAt: workspace.createdAt,
        itemRef: {
          serverId: 'ServerIdentity01',
          library: { type: 'user', id: '0' },
          itemKey: 'PAPERAA2',
        },
        attachmentKey: 'PDFATT22',
        pageNumber: 3,
      },
      createdAt: workspace.createdAt,
      displayOrder: 0,
    },
  ],
};
const proposal: ResearchMemoryProposal = {
  id: '550e8400-e29b-41d4-a716-446655440005',
  workspaceId: workspace.id,
  sourceNoteId: note.id,
  title: 'Memory: Clipping note',
  bodyMarkdown: 'Clipping is not a hard KL constraint [S1].',
  reason: 'Retain the distinction.',
  providerId: 'openai',
  model: 'fake',
  status: 'pending',
  confirmedMemoryId: null,
  createdAt: workspace.createdAt,
  reviewedAt: null,
  rowVersion: 1,
  references: note.references.map((reference) => ({
    ...reference,
    ownerType: 'proposal',
    ownerId: '550e8400-e29b-41d4-a716-446655440005',
  })),
};

describe('WorkspaceResearchMemoryPage', () => {
  const update = vi.fn();
  const openReference = vi.fn();
  const confirmProposal = vi.fn();

  beforeEach(() => {
    update
      .mockReset()
      .mockImplementation(
        (input: {
          readonly title: string;
          readonly bodyMarkdown: string;
          readonly status: string;
        }) => Promise.resolve({ ok: true, value: { ...note, ...input, rowVersion: 2 } }),
      );
    openReference.mockReset().mockResolvedValue({
      ok: true,
      value: { opened: true, target: 'paper', relatedId: 'PAPERAA2', reason: null },
    });
    confirmProposal.mockReset().mockResolvedValue({
      ok: true,
      value: {
        ...note,
        id: '550e8400-e29b-41d4-a716-446655440006',
        type: 'memory',
        status: 'confirmed',
        provenance: 'ai-proposed-confirmed',
        confirmedAt: workspace.updatedAt,
      },
    });
    Object.defineProperty(window, 'paperMind', {
      configurable: true,
      value: {
        researchMemory: {
          list: vi.fn().mockResolvedValue({
            ok: true,
            value: [
              {
                id: note.id,
                type: note.type,
                title: note.title,
                status: note.status,
                referenceCount: 1,
                updatedAt: note.updatedAt,
              },
            ],
          }),
          get: vi.fn().mockResolvedValue({ ok: true, value: note }),
          create: vi.fn(),
          update,
          delete: vi.fn(),
          searchSources: vi.fn().mockResolvedValue({ ok: true, value: [] }),
          addReference: vi.fn(),
          removeReference: vi.fn(),
          openReference,
          createProposal: vi.fn().mockResolvedValue({ ok: true, value: proposal }),
          listProposals: vi.fn().mockResolvedValue({ ok: true, value: [proposal] }),
          confirmProposal,
          rejectProposal: vi.fn(),
          prepareExport: vi.fn().mockResolvedValue({ ok: true, value: null }),
          confirmExport: vi.fn(),
        },
      },
    });
  });

  it('edits and saves a Note while exposing source navigation and clear type/status hierarchy', async () => {
    render(<WorkspaceResearchMemoryPage workspace={workspace} onNavigate={vi.fn()} />);
    await screen.findByDisplayValue('Clipping note');
    expect(screen.getByText('paper')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Markdown body'), {
      target: { value: 'Edited durable finding.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ bodyMarkdown: 'Edited durable finding.', type: 'note' }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() =>
      expect(openReference).toHaveBeenCalledWith(
        expect.objectContaining({ referenceId: note.references[0]?.id }),
      ),
    );
  });

  it('shows an editable proposal diff and persists only after explicit confirmation', async () => {
    render(<WorkspaceResearchMemoryPage workspace={workspace} onNavigate={vi.fn()} />);
    await screen.findByText('AI proposal · review required');
    fireEvent.click(screen.getByText('AI proposal · review required'));
    await screen.findByRole('dialog', { name: 'Review AI Memory proposal' });
    expect(screen.getByText('Proposed snapshot')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Confirmed Memory body'), {
      target: { value: 'User-edited confirmed finding [S1].' },
    });
    expect(confirmProposal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Memory' }));
    await waitFor(() =>
      expect(confirmProposal).toHaveBeenCalledWith(
        expect.objectContaining({ bodyMarkdown: 'User-edited confirmed finding [S1].' }),
      ),
    );
  });
});
