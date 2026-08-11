import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceRepositorySection } from '../../src/renderer/components/workspace/repository/WorkspaceRepositorySection';
import type { PaperMindApi } from '../../src/shared/contracts/app';
import type { WorkspaceRepositoryRef } from '../../src/shared/contracts/repository';
import type { Workspace } from '../../src/shared/contracts/workspace';

const workspace: Workspace = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Code review',
  description: '',
  researchGoal: '',
  status: 'active',
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
  rowVersion: 1,
};
const repository: WorkspaceRepositoryRef = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  workspaceId: workspace.id,
  displayName: 'papermind-fixture',
  canonicalRoot: 'D:\\fixtures\\papermind-fixture',
  kind: 'git',
  gitRoot: 'D:\\fixtures\\papermind-fixture',
  currentBranch: 'main',
  headCommit: 'a'.repeat(40),
  remotes: [{ name: 'origin', url: 'https://example.com/repo.git' }],
  availability: 'available',
  lastErrorCode: null,
  lastObservedAt: '2026-08-11T00:00:00.000Z',
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
  rowVersion: 1,
  addedAt: '2026-08-11T00:00:00.000Z',
  sortOrder: 0,
};

describe('WorkspaceRepositorySection', () => {
  const listForWorkspace = vi.fn();
  const chooseAndLink = vi.fn();
  const removeFromWorkspace = vi.fn();
  const deleteReference = vi.fn();
  const refresh = vi.fn();
  const listTree = vi.fn();
  const readSource = vi.fn();
  const openInVscode = vi.fn();

  beforeEach(() => {
    listForWorkspace.mockReset().mockResolvedValue({ ok: true, value: [repository] });
    chooseAndLink.mockReset();
    removeFromWorkspace.mockReset().mockResolvedValue({ ok: true, value: { removed: true } });
    deleteReference
      .mockReset()
      .mockResolvedValue({ ok: true, value: { repositoryId: repository.id } });
    refresh.mockReset().mockResolvedValue({ ok: true, value: repository });
    listTree.mockReset().mockResolvedValue({
      ok: true,
      value: {
        repositoryId: repository.id,
        directory: '',
        entries: [
          {
            name: 'index.ts',
            relativePath: 'index.ts',
            kind: 'file',
            byteSize: 25,
            modifiedAt: '2026-08-11T00:00:00.000Z',
          },
          {
            name: 'outside-link',
            relativePath: 'outside-link',
            kind: 'symlink',
            byteSize: null,
            modifiedAt: null,
          },
        ],
        start: 0,
        limit: 50,
        total: 2,
        hasNext: false,
      },
    });
    readSource.mockReset().mockResolvedValue({
      ok: true,
      value: {
        repositoryId: repository.id,
        relativePath: 'index.ts',
        language: 'typescript',
        encoding: 'utf-8',
        byteSize: 25,
        lineCount: 1,
        content: 'export const answer = 42;',
      },
    });
    openInVscode.mockReset().mockResolvedValue({ ok: true, value: { opened: true } });
    installApi();
  });

  it('browses a bounded tree, highlights source, and opens an authorized line in VS Code', async () => {
    const { container } = render(<WorkspaceRepositorySection workspace={workspace} />);
    expect(await screen.findByText('papermind-fixture')).toBeDefined();
    expect(screen.getByText('main | aaaaaaaaaa')).toBeDefined();
    expect(await screen.findByRole('button', { name: 'index.ts' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'outside-link' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'index.ts' }));
    expect(await screen.findByRole('heading', { name: 'index.ts' })).toBeDefined();
    expect(container.querySelector('.text-fuchsia-700')?.textContent).toBe('export');
    fireEvent.click(screen.getByRole('button', { name: 'Open line 1 in VS Code' }));
    await waitFor(() =>
      expect(openInVscode).toHaveBeenCalledWith({
        repositoryId: repository.id,
        relativePath: 'index.ts',
        line: 1,
      }),
    );
  });

  it('links a user-selected repository and reports that files were not copied', async () => {
    listForWorkspace
      .mockResolvedValueOnce({ ok: true, value: [] })
      .mockResolvedValue({ ok: true, value: [repository] });
    chooseAndLink.mockResolvedValue({ ok: true, value: repository });
    render(<WorkspaceRepositorySection workspace={workspace} />);
    expect(await screen.findByText('No repositories in this Workspace.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Add repository' }));
    expect(
      await screen.findByText('Repository linked. Local files were not copied or modified.'),
    ).toBeDefined();
    expect(chooseAndLink).toHaveBeenCalledWith(workspace.id);
  });

  it('shows missing state and removes only the Workspace association after confirmation', async () => {
    const missing = { ...repository, availability: 'missing' as const };
    listForWorkspace.mockResolvedValueOnce({ ok: true, value: [missing] }).mockResolvedValue({
      ok: true,
      value: [],
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<WorkspaceRepositorySection workspace={workspace} />);
    expect(await screen.findByText('Missing or moved')).toBeDefined();
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove papermind-fixture from Workspace' }),
    );
    await waitFor(() =>
      expect(removeFromWorkspace).toHaveBeenCalledWith({
        workspaceId: workspace.id,
        repositoryId: repository.id,
      }),
    );
    expect(
      await screen.findByText(
        'Repository removed from this Workspace. Local files were not changed.',
      ),
    ).toBeDefined();
  });

  function installApi() {
    const api: PaperMindApi['repository'] = {
      chooseAndLink,
      listForWorkspace,
      removeFromWorkspace,
      deleteReference,
      refresh,
      listTree,
      readSource,
      openInVscode,
      cancelRequest: vi.fn().mockResolvedValue({
        ok: true,
        value: { requestId: crypto.randomUUID(), cancelled: false },
      }),
    };
    Object.defineProperty(window, 'paperMind', {
      configurable: true,
      value: { repository: api },
    });
  }
});
