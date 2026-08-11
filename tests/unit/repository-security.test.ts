// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  GitRepositoryClient,
  sanitizeRemoteUrl,
  type GitCommandResult,
  type GitCommandRunner,
} from '../../src/main/repository/git-repository-client';
import { mapFileSystemError } from '../../src/main/repository/repository-errors';
import {
  deleteRepositoryRefSchema,
  openRepositoryInVscodeSchema,
  repositorySourceRequestSchema,
  repositoryTreeRequestSchema,
  workspaceRepositoryInputSchema,
} from '../../src/main/ipc/repository-schemas';

const REPOSITORY_ID = '550e8400-e29b-41d4-a716-446655440001';
const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440002';
const REQUEST_ID = '550e8400-e29b-41d4-a716-446655440003';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('Repository Bridge security', () => {
  it('accepts only bounded domain-specific IPC inputs', () => {
    expect(
      repositoryTreeRequestSchema.parse({
        repositoryId: REPOSITORY_ID,
        requestId: REQUEST_ID,
        relativePath: 'src',
        start: 0,
        limit: 100,
      }),
    ).toBeDefined();
    expect(
      repositorySourceRequestSchema.parse({
        repositoryId: REPOSITORY_ID,
        requestId: REQUEST_ID,
        relativePath: 'src/index.ts',
      }),
    ).toBeDefined();
    expect(
      workspaceRepositoryInputSchema.parse({
        workspaceId: WORKSPACE_ID,
        repositoryId: REPOSITORY_ID,
      }),
    ).toBeDefined();
    expect(() =>
      deleteRepositoryRefSchema.parse({ repositoryId: REPOSITORY_ID, confirmation: 'DELETE' }),
    ).toThrow();
    expect(() =>
      openRepositoryInVscodeSchema.parse({ repositoryId: REPOSITORY_ID, line: 4 }),
    ).toThrow();
  });

  it('rejects renderer-controlled root, URL, executable, Git args, and oversized requests', () => {
    const attack = {
      repositoryId: REPOSITORY_ID,
      requestId: REQUEST_ID,
      relativePath: '../outside',
      root: 'C:\\private',
      url: 'file:///C:/private',
      executable: 'cmd.exe',
      gitArgs: ['reset', '--hard'],
      limit: 1000,
    };
    expect(() => repositoryTreeRequestSchema.parse(attack)).toThrow();
    expect(() =>
      repositorySourceRequestSchema.parse({ ...attack, relativePath: 'C:/private.txt' }),
    ).toThrow();
    expect(() =>
      workspaceRepositoryInputSchema.parse({
        workspaceId: WORKSPACE_ID,
        repositoryId: REPOSITORY_ID,
        root: 'C:\\private',
      }),
    ).toThrow();
  });

  it('uses only the fixed read-only Git command set and strips remote credentials', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'papermind-git-runner-test-'));
    roots.push(root);
    const runner = new FakeGitRunner(root);
    const inspection = await new GitRepositoryClient(runner).inspectSelectedRoot(root);
    expect(inspection).toMatchObject({
      kind: 'git',
      currentBranch: 'main',
      headCommit: 'a'.repeat(40),
      remotes: [{ name: 'origin', url: 'https://example.com/org/repo.git' }],
    });
    const commands = runner.calls.map((args) => commandName(args));
    expect(commands).toEqual(['rev-parse', 'symbolic-ref', 'rev-parse', 'remote', 'remote']);
    expect(commands).not.toContain('checkout');
    expect(commands).not.toContain('commit');
    expect(commands).not.toContain('reset');
    expect(sanitizeRemoteUrl('git@github.com:owner/repo.git')).toBe('github.com:owner/repo.git');
    expect(sanitizeRemoteUrl('C:\\private\\repo.git')).toBe('<local remote>');
    expect(sanitizeRemoteUrl('file:///C:/private/repo.git')).toBe('<local remote>');
    expect(sanitizeRemoteUrl('https://example.com/repo.git?token=secret#private')).toBe(
      'https://example.com/repo.git',
    );
  });

  it('maps permission failures to a stable safe error', () => {
    expect(
      mapFileSystemError(Object.assign(new Error('private path'), { code: 'EACCES' }), 'x'),
    ).toMatchObject({
      code: 'PERMISSION_DENIED',
      message: 'PaperMind cannot access this source path.',
    });
  });
});

class FakeGitRunner implements GitCommandRunner {
  public readonly calls: string[][] = [];
  public constructor(private readonly root: string) {}

  public run(args: readonly string[]): Promise<GitCommandResult> {
    this.calls.push([...args]);
    if (args.includes('--show-toplevel')) return result(this.root);
    if (args.includes('symbolic-ref')) return result('main');
    if (args.includes('--verify')) return result('a'.repeat(40));
    if (args.includes('get-url')) return result('https://user:secret@example.com/org/repo.git');
    return result('origin');
  }
}

function result(stdout: string): Promise<GitCommandResult> {
  return Promise.resolve({ exitCode: 0, stdout, stderr: '' });
}

function commandName(args: readonly string[]): string {
  const rootIndex = args.indexOf('-C');
  return args[rootIndex + 2] ?? '';
}
