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
  const getCodeIndexStatus = vi.fn();
  const runCodeIndex = vi.fn();
  const searchSymbols = vi.fn();
  const listLinksForCode = vi.fn();
  const openLinkedPaper = vi.fn();

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
    getCodeIndexStatus.mockReset().mockResolvedValue({
      ok: true,
      value: {
        repositoryId: repository.id,
        status: 'ready',
        snapshotIdentity: 'content:fixture',
        currentSnapshotIdentity: 'content:fixture',
        dirty: true,
        parserVersion: 'test-parser',
        fileCount: 2,
        symbolCount: 4,
        chunkCount: 3,
        processedFiles: 2,
        totalFiles: 2,
        lastErrorCode: null,
        lastErrorMessage: null,
        startedAt: '2026-08-11T00:00:00.000Z',
        completedAt: '2026-08-11T00:00:01.000Z',
        updatedAt: '2026-08-11T00:00:01.000Z',
      },
    });
    runCodeIndex.mockReset();
    searchSymbols.mockReset().mockResolvedValue({
      ok: true,
      value: {
        results: [
          {
            repositoryId: repository.id,
            relativePath: 'index.ts',
            language: 'typescript',
            snapshotIdentity: 'content:fixture',
            currentSnapshotIdentity: 'content:fixture',
            stale: false,
            contentHash: 'a'.repeat(64),
            startLine: 1,
            endLine: 1,
            snippet: 'export const answer = 42;',
            symbolKind: 'export',
            symbolName: 'answer',
            qualifiedName: 'answer',
          },
        ],
        offset: 0,
        limit: 20,
        total: 1,
      },
    });
    listLinksForCode.mockReset().mockResolvedValue({
      ok: true,
      value: [
        {
          id: '550e8400-e29b-41d4-a716-446655440009',
          workspaceId: workspace.id,
          itemRef: {
            serverId: 'ServerIdentity01',
            library: { type: 'user', id: '0' },
            itemKey: 'PAPERAA2',
          },
          item: { title: 'Related PPO paper' },
          pageNumber: 3,
          paperAvailability: 'available',
        },
      ],
    });
    openLinkedPaper.mockReset().mockResolvedValue({
      ok: true,
      value: {
        id: '550e8400-e29b-41d4-a716-446655440009',
        opened: true,
        target: 'zotero_pdf',
        reason: null,
      },
    });
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

  it('searches symbols and navigates through the authorized source viewer', async () => {
    render(<WorkspaceRepositorySection workspace={workspace} />);
    expect(await screen.findByText('Ready | 2 files | 4 symbols')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Search indexed code'), { target: { value: 'answer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('export answer')).toBeDefined();
    fireEvent.click(screen.getByText('export answer'));
    expect(await screen.findByRole('heading', { name: 'index.ts' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Open line 1 in VS Code' }).className).toContain(
      'ring-emerald-500',
    );
    expect(screen.getByText('Related PPO paper | p.3')).toBeDefined();
    fireEvent.click(screen.getByText('Related PPO paper | p.3'));
    await waitFor(() =>
      expect(openLinkedPaper).toHaveBeenCalledWith({
        workspaceId: workspace.id,
        id: '550e8400-e29b-41d4-a716-446655440009',
      }),
    );
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
      value: {
        repository: api,
        codeIntelligence: {
          getStatus: getCodeIndexStatus,
          runIndex: runCodeIndex,
          cancelIndex: vi.fn().mockResolvedValue({
            ok: true,
            value: { requestId: crypto.randomUUID(), cancelled: false },
          }),
          searchFiles: vi.fn().mockResolvedValue({
            ok: true,
            value: { results: [], offset: 0, limit: 20, total: 0 },
          }),
          searchSymbols,
          searchText: vi.fn().mockResolvedValue({
            ok: true,
            value: { results: [], offset: 0, limit: 20, total: 0 },
          }),
          onProgress: vi.fn().mockReturnValue(() => undefined),
        },
        paperCodeLink: {
          listForCode: listLinksForCode,
          openPaper: openLinkedPaper,
        },
      },
    });
  }
});
