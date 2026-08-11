import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PaperCodeLinkSection } from '../../src/renderer/components/workspace/paper-code-link/PaperCodeLinkSection';
import type { PaperCodeLink } from '../../src/shared/contracts/paper-code-link';
import type { Workspace } from '../../src/shared/contracts/workspace';

const workspace: Workspace = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Link review',
  description: '',
  researchGoal: '',
  status: 'active',
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
  rowVersion: 1,
};
const itemRef = {
  serverId: 'ServerIdentity01',
  library: { type: 'user' as const, id: '0' },
  itemKey: 'PAPERAA2',
};
const link: PaperCodeLink = {
  id: '550e8400-e29b-41d4-a716-446655440004',
  workspaceId: workspace.id,
  itemRef,
  itemVersion: 4,
  paperSnapshotIdentity: 'zotero:paper:v4',
  pageNumber: 3,
  locationLabel: 'Equation 7',
  textAnchor: null,
  repositoryId: '550e8400-e29b-41d4-a716-446655440002',
  repositoryName: 'PPO source',
  codeSnapshotIdentity: 'snapshot:trusted',
  currentCodeSnapshotIdentity: 'snapshot:changed',
  language: 'python',
  relativePath: 'src/ppo.py',
  symbolKind: 'function',
  symbolName: 'clipped_loss',
  startLine: 10,
  endLine: 14,
  contentHash: 'a'.repeat(64),
  relationType: 'implements',
  label: 'PPO clipping',
  description: 'Claim to implementation.',
  provenance: 'manual',
  paperAvailability: 'available',
  paperAvailabilityReason: null,
  codeAvailability: 'stale',
  codeAvailabilityReason: 'The repository content changed after this link was recorded.',
  item: {
    ref: itemRef,
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
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
  rowVersion: 1,
};

describe('Paper-Code Link UI', () => {
  const listForWorkspace = vi.fn();
  const openPaper = vi.fn();
  const openCode = vi.fn();
  const update = vi.fn();
  const deleteLink = vi.fn();
  const create = vi.fn();

  beforeEach(() => {
    listForWorkspace.mockReset().mockResolvedValue({ ok: true, value: [link] });
    openPaper.mockReset().mockResolvedValue({
      ok: true,
      value: { id: link.id, opened: true, target: 'zotero_pdf', reason: null },
    });
    openCode.mockReset().mockResolvedValue({
      ok: true,
      value: { id: link.id, opened: false, target: 'code', reason: link.codeAvailabilityReason },
    });
    update.mockReset().mockResolvedValue({
      ok: true,
      value: { ...link, relationType: 'extends', label: 'Extended relation', rowVersion: 2 },
    });
    deleteLink.mockReset().mockResolvedValue({ ok: true, value: { id: link.id } });
    create.mockReset().mockResolvedValue({ ok: true, value: link });
    installApi();
  });

  it('shows both sources, immutable stale state, editing, navigation, and confirmed deletion', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PaperCodeLinkSection workspace={workspace} />);
    const list = await screen.findByRole('list', { name: 'Paper-Code Links' });
    expect(within(list).getByText('PPO paper')).toBeDefined();
    expect(within(list).getByText('src/ppo.py:10-14')).toBeDefined();
    expect(within(list).getByText(/stale: The repository content changed/u)).toBeDefined();

    fireEvent.click(within(list).getByRole('button', { name: 'Open paper source' }));
    await waitFor(() =>
      expect(openPaper).toHaveBeenCalledWith({ workspaceId: workspace.id, id: link.id }),
    );
    fireEvent.click(within(list).getByRole('button', { name: 'Open code source' }));
    expect((await screen.findByRole('alert')).textContent).toContain('repository content changed');

    fireEvent.click(within(list).getByRole('button', { name: 'Edit link' }));
    fireEvent.change(within(list).getByLabelText('Relation'), { target: { value: 'extends' } });
    fireEvent.change(within(list).getByLabelText('Label'), {
      target: { value: 'Extended relation' },
    });
    fireEvent.click(within(list).getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          relationType: 'extends',
          label: 'Extended relation',
          rowVersion: 1,
        }),
      ),
    );

    fireEvent.click(within(list).getByRole('button', { name: 'Delete link' }));
    await waitFor(() =>
      expect(deleteLink).toHaveBeenCalledWith({
        workspaceId: workspace.id,
        id: link.id,
        confirmation: 'DELETE_LINK',
      }),
    );
    expect(
      await screen.findByText('Link deleted. External sources were not changed.'),
    ).toBeDefined();
  });

  it('runs paper to indexed-code search, preview, and explicit save', async () => {
    listForWorkspace.mockResolvedValue({ ok: true, value: [] });
    render(<PaperCodeLinkSection workspace={workspace} />);
    await screen.findByText('No confirmed Paper-Code Links.');
    fireEvent.click(screen.getByRole('button', { name: 'Link to Code' }));
    const dialog = await screen.findByRole('dialog', { name: 'Link paper location to code' });
    fireEvent.change(within(dialog).getByLabelText('Paper page'), { target: { value: '3' } });
    fireEvent.change(within(dialog).getByLabelText('Location label'), {
      target: { value: 'Equation 7' },
    });
    fireEvent.change(within(dialog).getByLabelText('Search code for link'), {
      target: { value: 'clipped_loss' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Search code' }));
    const result = await within(dialog).findByText('function clipped_loss');
    fireEvent.click(result);
    expect(
      within(dialog).getByText(/PPO paper \(p\.3 \/ Equation 7\).*src\/ppo\.py:10-14/u),
    ).toBeDefined();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save link' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          itemRef,
          repositoryId: link.repositoryId,
          codeSnapshotIdentity: 'snapshot:trusted',
          startLine: 10,
          endLine: 14,
          relationType: 'implements',
        }),
      ),
    );
  });

  function installApi() {
    Object.defineProperty(window, 'paperMind', {
      configurable: true,
      value: {
        paperCodeLink: {
          listForWorkspace,
          openPaper,
          openCode,
          update,
          delete: deleteLink,
          create,
        },
        workspace: {
          listPapers: vi.fn().mockResolvedValue({
            ok: true,
            value: [
              {
                workspaceId: workspace.id,
                itemRef,
                addedAt: link.createdAt,
                sortOrder: 0,
                availability: 'available',
                item: link.item,
              },
            ],
          }),
        },
        repository: {
          listForWorkspace: vi.fn().mockResolvedValue({
            ok: true,
            value: [
              { id: link.repositoryId, workspaceId: workspace.id, displayName: 'PPO source' },
            ],
          }),
        },
        codeIntelligence: {
          searchSymbols: vi.fn().mockResolvedValue({
            ok: true,
            value: {
              results: [
                {
                  repositoryId: link.repositoryId,
                  relativePath: link.relativePath,
                  language: link.language,
                  snapshotIdentity: link.codeSnapshotIdentity,
                  currentSnapshotIdentity: link.codeSnapshotIdentity,
                  stale: false,
                  contentHash: link.contentHash,
                  startLine: link.startLine,
                  endLine: link.endLine,
                  snippet: 'def clipped_loss():',
                  symbolKind: link.symbolKind,
                  symbolName: link.symbolName,
                  qualifiedName: 'clipped_loss',
                },
              ],
              offset: 0,
              limit: 20,
              total: 1,
            },
          }),
          searchFiles: vi.fn(),
          searchText: vi.fn(),
        },
      },
    });
  }
});
