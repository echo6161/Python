// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { CodeIndexScanner } from '../../src/main/code-intelligence/code-index-scanner';
import type { GitRepositoryClient } from '../../src/main/repository/git-repository-client';
import type { RepositoryFileService } from '../../src/main/repository/repository-file-service';
import type { RepositoryRef, RepositoryTreeEntry } from '../../src/shared/contracts/repository';

const repository: RepositoryRef = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  displayName: 'large-fixture',
  canonicalRoot: 'D:\\fixture',
  kind: 'source_folder',
  gitRoot: null,
  currentBranch: null,
  headCommit: null,
  remotes: [],
  availability: 'available',
  lastErrorCode: null,
  lastObservedAt: '2026-08-11T00:00:00.000Z',
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
  rowVersion: 1,
};

describe('CodeIndexScanner limits', () => {
  it('stops discovery before reading a repository beyond the file ceiling', async () => {
    let readCalls = 0;
    const files: Pick<RepositoryFileService, 'listTree' | 'readSource'> = {
      listTree: (_id, _root, _kind, request) => {
        const start = request.start ?? 0;
        const remaining = 2_001 - start;
        const count = Math.min(request.limit ?? 50, remaining);
        const entries: RepositoryTreeEntry[] = Array.from({ length: count }, (_, offset) => {
          const index = start + offset;
          return {
            name: `file-${String(index)}.ts`,
            relativePath: `file-${String(index)}.ts`,
            kind: 'file',
            byteSize: 20,
            modifiedAt: null,
          };
        });
        return Promise.resolve({
          repositoryId: repository.id,
          directory: '',
          entries,
          start,
          limit: request.limit ?? 50,
          total: 2_001,
          hasNext: start + count < 2_001,
        });
      },
      readSource: () => {
        readCalls += 1;
        return Promise.reject(new Error('The file ceiling should stop before reads.'));
      },
    };
    const git: Pick<GitRepositoryClient, 'hasWorkingTreeChanges' | 'inspectExistingRoot'> = {
      inspectExistingRoot: () => Promise.reject(new Error('Inspection should not be reached.')),
      hasWorkingTreeChanges: () => Promise.resolve(false),
    };

    await expect(new CodeIndexScanner(files, git).scan(repository)).rejects.toMatchObject({
      code: 'CODE_INDEX_LIMIT_EXCEEDED',
    });
    expect(readCalls).toBe(0);
  });

  it('distinguishes clean Git commits from dirty content snapshots', async () => {
    let dirty = false;
    const files: Pick<RepositoryFileService, 'listTree' | 'readSource'> = {
      listTree: () =>
        Promise.resolve({
          repositoryId: repository.id,
          directory: '',
          entries: [
            {
              name: 'main.ts',
              relativePath: 'main.ts',
              kind: 'file',
              byteSize: 22,
              modifiedAt: null,
            },
          ],
          start: 0,
          limit: 100,
          total: 1,
          hasNext: false,
        }),
      readSource: () =>
        Promise.resolve({
          repositoryId: repository.id,
          relativePath: 'main.ts',
          language: 'typescript',
          encoding: 'utf-8',
          byteSize: 22,
          lineCount: 1,
          content: 'export const value = 1;',
        }),
    };
    const git: Pick<GitRepositoryClient, 'hasWorkingTreeChanges' | 'inspectExistingRoot'> = {
      inspectExistingRoot: () =>
        Promise.resolve({
          canonicalRoot: repository.canonicalRoot,
          kind: 'git',
          gitRoot: repository.canonicalRoot,
          currentBranch: 'main',
          headCommit: 'b'.repeat(40),
          remotes: [],
        }),
      hasWorkingTreeChanges: () => Promise.resolve(dirty),
    };
    const scanner = new CodeIndexScanner(files, git);

    expect((await scanner.scan(repository)).snapshotIdentity).toBe(`git:${'b'.repeat(40)}`);
    dirty = true;
    expect((await scanner.scan(repository)).snapshotIdentity).toMatch(
      new RegExp(`^dirty:${'b'.repeat(40)}:[0-9a-f]{64}$`, 'u'),
    );
  });
});
