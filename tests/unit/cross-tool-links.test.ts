import { describe, expect, it, vi } from 'vitest';
import { CrossToolLinkService, githubUrl } from '../../src/main/cross-tool/cross-tool-link-service';
import type { ResearchGraphService } from '../../src/main/research-graph/research-graph-service';
import type { WorkspaceDataGateway } from '../../src/main/workspace/workspace-data-gateway';
import type { RepositoryDataGateway } from '../../src/main/repository/repository-data-gateway';
import type { RepositoryService } from '../../src/main/repository/repository-service';
import type { ResearchMemoryDataGateway } from '../../src/main/research-memory/research-memory-data-gateway';
const w = '11111111-1111-4111-8111-111111111111',
  repo = '22222222-2222-4222-8222-222222222222';
describe('CrossToolLinkService', () => {
  it('normalizes only validated github.com remotes', () => {
    expect(githubUrl(['git@github.com:owner/repo.git'])).toBe('https://github.com/owner/repo');
    expect(githubUrl(['https://github.com/owner/repo.git'])).toBe('https://github.com/owner/repo');
    expect(
      githubUrl([
        'https://evil.example/owner/repo',
        'javascript:alert(1)',
        'https://user:pass@github.com/owner/repo',
      ]),
    ).toBeNull();
  });
  it('derives actions from canonical Graph nodes and returns fallback without opening forged remotes', async () => {
    const opened: string[] = [],
      vscode = vi.fn().mockResolvedValue({ opened: true }),
      service = fixture(opened, vscode, ['https://evil.example/repo']);
    await expect(
      service.open({ workspaceId: w, nodeId: 'repository:forged', action: 'github' }),
    ).rejects.toThrow('not in this Workspace');
    const result = await service.open({
      workspaceId: w,
      nodeId: `repository:${repo}`,
      action: 'github',
    });
    expect(result.opened).toBe(false);
    expect(result.fallback).toContain('Code view');
    expect(opened).toEqual([]);
    await service.open({ workspaceId: w, nodeId: `repository:${repo}`, action: 'primary' });
    expect(vscode).toHaveBeenCalledWith({ repositoryId: repo });
  });
  it('opens a safe GitHub URL and reports missing Obsidian export', async () => {
    const opened: string[] = [],
      service = fixture(opened, vi.fn(), ['https://github.com/owner/repo.git']);
    expect(
      (await service.open({ workspaceId: w, nodeId: `repository:${repo}`, action: 'github' }))
        .opened,
    ).toBe(true);
    expect(opened).toEqual(['https://github.com/owner/repo']);
    const memory = await service.open({
      workspaceId: w,
      nodeId: 'memory:33333333-3333-4333-8333-333333333333',
      action: 'primary',
    });
    expect(memory.opened).toBe(false);
    expect(memory.reason).toContain('no recorded Obsidian export');
  });
  it('opens only canonical Zotero and previously exported Obsidian references', async () => {
    const itemRef = {
        serverId: 'ServerIdentity01',
        library: { type: 'user' as const, id: '1' },
        itemKey: 'ABCD2345',
      },
      paperId = `paper:${itemRef.serverId}:user:1:${itemRef.itemKey}`,
      memoryId = '33333333-3333-4333-8333-333333333333',
      opened: string[] = [],
      zoteroOpen = vi.fn().mockResolvedValue(undefined);
    const graph = {
      getProjection: () =>
        Promise.resolve({
          workspaceId: w,
          version: 'research-graph-v1',
          nodes: [
            {
              id: paperId,
              kind: 'paper',
              label: 'paper',
              subtitle: '',
              status: 'available',
              relatedId: paperId,
              detail: '',
            },
            {
              id: `memory:${memoryId}`,
              kind: 'memory',
              label: 'memory',
              subtitle: '',
              status: 'available',
              relatedId: memoryId,
              detail: '',
            },
          ],
          edges: [],
        }),
    } as unknown as ResearchGraphService;
    const service = new CrossToolLinkService(
      graph,
      {
        listWorkspaceZoteroPapers: () =>
          Promise.resolve([
            { workspaceId: w, itemRef, addedAt: '2026-08-20T00:00:00.000Z', sortOrder: 0 },
          ]),
      } as unknown as WorkspaceDataGateway,
      { listWorkspaceRepositories: () => Promise.resolve([]) } as unknown as RepositoryDataGateway,
      { openInVscode: vi.fn() },
      {
        getLatestResearchExport: () =>
          Promise.resolve({
            id: '44444444-4444-4444-8444-444444444444',
            workspaceId: w,
            ownerType: 'memory',
            ownerId: memoryId,
            vaultName: 'Research Vault',
            relativePath: 'PaperMind/Finding.md',
            contentHash: 'a'.repeat(64),
            exportedAt: '2026-08-20T00:00:00.000Z',
          }),
      } as unknown as ResearchMemoryDataGateway,
      { openItem: zoteroOpen },
      {
        openExternal: (url: string) => {
          opened.push(url);
          return Promise.resolve();
        },
      },
    );
    expect(
      (await service.open({ workspaceId: w, nodeId: paperId, action: 'primary' })).target,
    ).toBe('zotero');
    expect(zoteroOpen).toHaveBeenCalledWith(itemRef);
    expect(
      (await service.open({ workspaceId: w, nodeId: `memory:${memoryId}`, action: 'primary' }))
        .target,
    ).toBe('obsidian');
    expect(opened[0]).toMatch(/^obsidian:\/\/open\?/u);
    expect(opened[0]).toContain('vault=Research+Vault');
  });
});
function fixture(
  opened: string[],
  openInVscode: ReturnType<typeof vi.fn>,
  remotes: readonly string[],
) {
  const graph = {
    getProjection: () =>
      Promise.resolve({
        workspaceId: w,
        version: 'research-graph-v1',
        nodes: [
          {
            id: `repository:${repo}`,
            kind: 'repository',
            label: 'repo',
            subtitle: '',
            status: 'available',
            relatedId: repo,
            detail: '',
          },
          {
            id: 'memory:33333333-3333-4333-8333-333333333333',
            kind: 'memory',
            label: 'memory',
            subtitle: '',
            status: 'available',
            relatedId: '33333333-3333-4333-8333-333333333333',
            detail: '',
          },
        ],
        edges: [],
      }),
  } as unknown as ResearchGraphService;
  return new CrossToolLinkService(
    graph,
    { listWorkspaceZoteroPapers: () => Promise.resolve([]) } as unknown as WorkspaceDataGateway,
    {
      listWorkspaceRepositories: () =>
        Promise.resolve([
          {
            id: repo,
            workspaceId: w,
            displayName: 'repo',
            canonicalRoot: 'C:\\repo',
            kind: 'git',
            gitRoot: 'C:\\repo',
            currentBranch: 'main',
            headCommit: 'a'.repeat(40),
            remotes: remotes.map((url, i) => ({ name: `r${String(i)}`, url })),
            availability: 'available',
            lastErrorCode: null,
            lastObservedAt: '2026-08-20T00:00:00.000Z',
            createdAt: '2026-08-20T00:00:00.000Z',
            updatedAt: '2026-08-20T00:00:00.000Z',
            rowVersion: 1,
            addedAt: '2026-08-20T00:00:00.000Z',
            sortOrder: 0,
          },
        ]),
    } as unknown as RepositoryDataGateway,
    { openInVscode } as unknown as RepositoryService,
    {
      getLatestResearchExport: () => Promise.resolve(null),
    } as unknown as ResearchMemoryDataGateway,
    { openItem: () => Promise.resolve() },
    {
      openExternal: (url: string) => {
        opened.push(url);
        return Promise.resolve();
      },
    },
  );
}
