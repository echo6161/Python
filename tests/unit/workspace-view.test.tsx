import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceView } from '../../src/renderer/components/workspace/WorkspaceView';
import type { PaperMindApi } from '../../src/shared/contracts/app';
import type {
  SetLastActiveWorkspaceInput,
  SetWorkspaceStatusInput,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceZoteroPaper,
} from '../../src/shared/contracts/workspace';

const first: Workspace = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Evidence review',
  description: '',
  researchGoal: 'Compare reproducibility methods',
  status: 'active',
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
  rowVersion: 1,
};
const second: Workspace = {
  ...first,
  id: '550e8400-e29b-41d4-a716-446655440002',
  name: 'Replication study',
  researchGoal: 'Validate a benchmark',
};
const firstPaper: WorkspaceZoteroPaper = {
  workspaceId: first.id,
  itemRef: {
    serverId: 'ServerIdentity01',
    library: { type: 'user', id: '0' },
    itemKey: 'PAPERAA2',
  },
  addedAt: '2026-08-11T00:00:00.000Z',
  sortOrder: 0,
  availability: 'available',
  item: {
    ref: {
      serverId: 'ServerIdentity01',
      library: { type: 'user', id: '0' },
      itemKey: 'PAPERAA2',
    },
    itemType: 'journalArticle',
    title: 'Workspace-specific paper',
    creators: [{ creatorType: 'author', name: 'Ada Lovelace' }],
    date: '2025',
    year: 2025,
    publication: 'Test Journal',
    pdf: { hasPdf: true, state: 'available', storageMode: 'stored' },
    version: 1,
    doi: null,
    abstract: null,
    url: null,
    tags: [],
    collections: [],
  },
};

describe('WorkspaceView', () => {
  const update = vi.fn();
  const setStatus = vi.fn();
  const deleteWorkspace = vi.fn();
  const setLastActive = vi.fn();
  const listPapers = vi.fn();
  const removePaper = vi.fn();

  beforeEach(() => {
    update
      .mockReset()
      .mockImplementation((input: UpdateWorkspaceInput) =>
        Promise.resolve({ ok: true, value: { ...first, ...input, rowVersion: 2 } }),
      );
    setStatus
      .mockReset()
      .mockImplementation((input: SetWorkspaceStatusInput) =>
        Promise.resolve({ ok: true, value: { ...first, status: input.status, rowVersion: 2 } }),
      );
    deleteWorkspace.mockReset().mockResolvedValue({ ok: true, value: { id: first.id } });
    setLastActive.mockReset().mockImplementation(({ workspaceId }: SetLastActiveWorkspaceInput) =>
      Promise.resolve({
        ok: true,
        value: [first, second].find(({ id }) => id === workspaceId) ?? null,
      }),
    );
    listPapers
      .mockReset()
      .mockImplementation((workspaceId: string) =>
        Promise.resolve({ ok: true, value: workspaceId === first.id ? [firstPaper] : [] }),
      );
    removePaper.mockReset().mockResolvedValue({ ok: true, value: { removed: true } });
    installApi({
      update,
      setStatus,
      delete: deleteWorkspace,
      setLastActive,
      listPapers,
      removePaper,
    });
  });

  it('restores the last active Workspace, edits its goal, and shows honest future states', async () => {
    render(<WorkspaceView />);
    expect(await screen.findByRole('heading', { name: 'Evidence review' })).toBeDefined();
    expect(await screen.findByText('Workspace-specific paper')).toBeDefined();
    expect(screen.getByText('Stored PDF')).toBeDefined();
    for (const section of ['Questions', 'Repositories', 'Reading Plan', 'Experiments']) {
      expect(screen.getByLabelText(`${section}: Coming later`)).toBeDefined();
    }

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Research Goal'), {
      target: { value: 'Updated research goal' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ researchGoal: 'Updated research goal' }),
      ),
    );
    expect(await screen.findByText('Updated research goal')).toBeDefined();
  });

  it('resets Workspace paper UI when switching and does not retain the previous paper', async () => {
    render(<WorkspaceView />);
    expect(await screen.findByText('Workspace-specific paper')).toBeDefined();
    const workspaceNav = screen.getByRole('navigation', { name: 'Workspaces' });
    fireEvent.click(within(workspaceNav).getByRole('button', { name: /Replication study/ }));

    expect(await screen.findByRole('heading', { name: 'Replication study' })).toBeDefined();
    expect(await screen.findByText('No Zotero papers in this Workspace.')).toBeDefined();
    expect(screen.queryByText('Workspace-specific paper')).toBeNull();
    expect(setLastActive).toHaveBeenCalledWith({ workspaceId: second.id });
  });

  it('ignores a stale selection response after the user switches again', async () => {
    type SelectionResult = Awaited<ReturnType<PaperMindApi['workspace']['setLastActive']>>;
    let resolveSecond: (result: SelectionResult) => void = () => undefined;
    const pendingSecond = new Promise<SelectionResult>((resolve) => {
      resolveSecond = resolve;
    });
    setLastActive.mockImplementation(({ workspaceId }: SetLastActiveWorkspaceInput) =>
      workspaceId === second.id ? pendingSecond : Promise.resolve({ ok: true, value: first }),
    );
    render(<WorkspaceView />);
    await screen.findByRole('heading', { name: 'Evidence review' });
    const workspaceNav = screen.getByRole('navigation', { name: 'Workspaces' });
    fireEvent.click(within(workspaceNav).getByRole('button', { name: /Replication study/ }));
    expect(await screen.findByRole('heading', { name: 'Replication study' })).toBeDefined();
    fireEvent.click(within(workspaceNav).getByRole('button', { name: /Evidence review/ }));
    expect(await screen.findByRole('heading', { name: 'Evidence review' })).toBeDefined();

    resolveSecond({ ok: true, value: second });
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Replication study' })).toBeNull(),
    );
  });

  it('requires explicit archive and delete confirmation with ownership-safe copy', async () => {
    render(<WorkspaceView />);
    await screen.findByRole('heading', { name: 'Evidence review' });
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    const archiveDialog = screen.getByRole('alertdialog', { name: 'Archive Workspace?' });
    expect(archiveDialog.textContent).toContain('Zotero links will be preserved');
    fireEvent.click(within(archiveDialog).getByRole('button', { name: 'Archive Workspace' }));
    await waitFor(() =>
      expect(setStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'archived' })),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const deleteDialog = screen.getByRole('alertdialog', { name: 'Delete Workspace?' });
    expect(deleteDialog.textContent).toContain(
      'Zotero items, PDFs, annotations, and legacy library data will not be deleted',
    );
    fireEvent.click(within(deleteDialog).getByRole('button', { name: 'Delete Workspace' }));
    await waitFor(() =>
      expect(deleteWorkspace).toHaveBeenCalledWith({
        id: first.id,
        confirmation: 'DELETE_WORKSPACE',
      }),
    );
  });

  it('renders external failure states and removes only the Workspace link', async () => {
    listPapers.mockResolvedValue({
      ok: true,
      value: [
        { ...firstPaper, availability: 'missing', item: null },
        {
          ...firstPaper,
          itemRef: { ...firstPaper.itemRef, serverId: 'ServerIdentity02', itemKey: 'PAPERAB2' },
          availability: 'stale_identity',
          item: null,
          sortOrder: 1,
        },
      ],
    });
    render(<WorkspaceView />);
    expect(await screen.findAllByText('Missing in Zotero')).toHaveLength(2);
    expect(screen.getAllByText('Different Zotero profile')).toHaveLength(2);
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Zotero item PAPERAA2 from Workspace' }),
    );
    await waitFor(() =>
      expect(removePaper).toHaveBeenCalledWith({
        workspaceId: first.id,
        itemRef: firstPaper.itemRef,
      }),
    );
    expect(
      await screen.findByText('Paper removed from this Workspace. Zotero was not changed.'),
    ).toBeDefined();
  });
});

function installApi(overrides: Partial<PaperMindApi['workspace']>) {
  const workspace: PaperMindApi['workspace'] = {
    create: vi.fn(),
    get: vi.fn(),
    list: vi.fn().mockResolvedValue({ ok: true, value: [first, second] }),
    update: vi.fn(),
    setStatus: vi.fn(),
    delete: vi.fn(),
    getLastActive: vi.fn().mockResolvedValue({ ok: true, value: first }),
    setLastActive: vi.fn(),
    addPaper: vi.fn(),
    removePaper: vi.fn(),
    listPapers: vi.fn(),
    ...overrides,
  };
  Object.defineProperty(window, 'paperMind', {
    configurable: true,
    value: { workspace },
  });
}
