// @vitest-environment node

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LibraryDatabase } from '../../src/main/database/library-database';
import { GitRepositoryClient } from '../../src/main/repository/git-repository-client';
import { RepositoryFileService } from '../../src/main/repository/repository-file-service';
import {
  RepositoryService,
  type RepositoryDirectoryPicker,
} from '../../src/main/repository/repository-service';
import {
  RepositoryVscodeLauncher,
  type VscodeExternalOpener,
} from '../../src/main/repository/repository-vscode-launcher';

const run = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('Repository Bridge integration', () => {
  it('links Git and source folders, shares them across Workspaces, and survives restart', async () => {
    const databaseFixture = await createDatabase();
    const gitRoot = await createGitFixture();
    const sourceRoot = await createSourceFixture();
    const gitStatusBefore = await git(gitRoot, ['status', '--porcelain=v1']);
    const picker = new QueuePicker([gitRoot, sourceRoot]);
    const opened: string[] = [];
    let service = serviceFor(databaseFixture.database, picker, opened);
    const first = await databaseFixture.database.createWorkspace({
      name: 'One',
      description: '',
      researchGoal: '',
    });
    const second = await databaseFixture.database.createWorkspace({
      name: 'Two',
      description: '',
      researchGoal: '',
    });

    const gitReference = await service.chooseAndLink(first.id);
    expect(gitReference).toMatchObject({ kind: 'git', availability: 'available' });
    expect(gitReference?.headCommit).toMatch(/^[0-9a-f]{40}$/u);
    expect(gitReference?.remotes).toEqual([
      { name: 'origin', url: 'https://example.com/org/repo.git' },
    ]);
    const sourceReference = await service.chooseAndLink(first.id);
    expect(sourceReference).toMatchObject({ kind: 'source_folder', currentBranch: null });

    if (!gitReference) throw new Error('Git reference was not created.');
    await databaseFixture.database.addWorkspaceRepository(second.id, gitReference.id);
    await databaseFixture.database.close();

    const reopened = new LibraryDatabase(databaseFixture.databasePath);
    service = serviceFor(reopened, new QueuePicker([]), opened);
    expect(await service.listForWorkspace(first.id)).toHaveLength(2);
    expect(await service.listForWorkspace(second.id)).toHaveLength(1);
    expect(
      await service.removeFromWorkspace({ workspaceId: first.id, repositoryId: gitReference.id }),
    ).toEqual({ removed: true });
    expect(await service.listForWorkspace(first.id)).toHaveLength(1);
    expect(await service.listForWorkspace(second.id)).toHaveLength(1);

    if (!sourceReference) throw new Error('Source reference was not created.');
    await service.deleteReference({
      repositoryId: sourceReference.id,
      confirmation: 'DELETE_REPOSITORY_REF',
    });
    expect(await readFile(path.join(sourceRoot, 'main.py'), 'utf8')).toContain('hello');
    expect(await git(gitRoot, ['status', '--porcelain=v1'])).toBe(gitStatusBefore);
    await reopened.close();
  });

  it('refreshes changed HEAD and preserves a missing repository reference', async () => {
    const databaseFixture = await createDatabase();
    const root = await createGitFixture();
    const picker = new QueuePicker([root]);
    const service = serviceFor(databaseFixture.database, picker, []);
    const workspace = await databaseFixture.database.createWorkspace({
      name: 'Refresh',
      description: '',
      researchGoal: '',
    });
    const linked = await service.chooseAndLink(workspace.id);
    if (!linked) throw new Error('Repository was not linked.');
    const firstHead = linked.headCommit;

    await writeFile(path.join(root, 'second.ts'), 'export const second = 2;\n', 'utf8');
    await git(root, ['add', '--', 'second.ts']);
    await git(root, ['commit', '-m', 'second']);
    const refreshed = await service.refresh(linked.id);
    expect(refreshed.headCommit).not.toBe(firstHead);
    expect(refreshed.availability).toBe('available');

    const moved = `${root}-moved`;
    await rename(root, moved);
    roots.splice(roots.indexOf(root), 1, moved);
    expect(await service.refresh(linked.id)).toMatchObject({
      availability: 'missing',
      lastErrorCode: 'FILE_NOT_FOUND',
    });
    expect(await service.listForWorkspace(workspace.id)).toHaveLength(1);
    await databaseFixture.database.close();
  });

  it('enforces ignore, pagination, encoding, binary, size, and path boundaries', async () => {
    const databaseFixture = await createDatabase();
    const root = await createGitFixture();
    await writeFile(path.join(root, '.gitignore'), 'ignored.ts\nignored-dir/\n', 'utf8');
    await writeFile(path.join(root, 'ignored.ts'), 'ignored', 'utf8');
    await mkdir(path.join(root, 'ignored-dir'));
    await writeFile(path.join(root, 'ignored-dir', 'hidden.ts'), 'hidden', 'utf8');
    await mkdir(path.join(root, 'node_modules'));
    await writeFile(path.join(root, 'node_modules', 'hidden.js'), 'hidden', 'utf8');
    await writeFile(path.join(root, 'binary.dat'), Buffer.from([0, 1, 2, 3]));
    await writeFile(path.join(root, '.env'), 'SECRET=must-not-cross-ipc\n', 'utf8');
    await writeFile(path.join(root, 'private.pem'), 'private material\n', 'utf8');
    await writeFile(path.join(root, 'invalid.txt'), Buffer.from([0xc3, 0x28]));
    await writeFile(path.join(root, 'large.ts'), Buffer.alloc(1024 * 1024 + 1, 97));
    await writeFile(
      path.join(root, 'utf16.txt'),
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('hello', 'utf16le')]),
    );
    for (let index = 0; index < 60; index += 1) {
      await writeFile(
        path.join(root, `page-${String(index).padStart(2, '0')}.ts`),
        `export const value = ${String(index)};\n`,
        'utf8',
      );
    }
    const outside = await temporaryRoot('papermind-repository-outside-');
    await writeFile(path.join(outside, 'secret.ts'), 'outside', 'utf8');
    await symlink(outside, path.join(root, 'outside-link'), 'junction');
    await symlink(root, path.join(root, 'loop-link'), 'junction');

    const picker = new QueuePicker([root]);
    const opened: string[] = [];
    const service = serviceFor(databaseFixture.database, picker, opened);
    const workspace = await databaseFixture.database.createWorkspace({
      name: 'Files',
      description: '',
      researchGoal: '',
    });
    const linked = await service.chooseAndLink(workspace.id);
    if (!linked) throw new Error('Repository was not linked.');
    const first = await service.listTree({
      repositoryId: linked.id,
      requestId: crypto.randomUUID(),
      relativePath: '',
      start: 0,
      limit: 20,
    });
    expect(first.hasNext).toBe(true);
    expect(first.entries.map(({ name }) => name)).not.toContain('ignored.ts');
    expect(first.entries.map(({ name }) => name)).not.toContain('node_modules');
    const allNames = await collectRootNames(service, linked.id);
    expect(allNames).toContain('outside-link');
    expect(allNames).not.toContain('ignored-dir');
    expect(allNames).not.toContain('.env');
    expect(allNames).not.toContain('private.pem');

    const source = await service.readSource({
      repositoryId: linked.id,
      requestId: crypto.randomUUID(),
      relativePath: 'src/index.ts',
    });
    expect(source).toMatchObject({ encoding: 'utf-8', language: 'typescript' });
    expect(
      (
        await service.readSource({
          repositoryId: linked.id,
          requestId: crypto.randomUUID(),
          relativePath: 'utf16.txt',
        })
      ).encoding,
    ).toBe('utf-16le');
    await expect(
      service.readSource({
        repositoryId: linked.id,
        requestId: crypto.randomUUID(),
        relativePath: 'binary.dat',
      }),
    ).rejects.toMatchObject({ code: 'REPOSITORY_BINARY_FILE' });
    await expect(
      service.readSource({
        repositoryId: linked.id,
        requestId: crypto.randomUUID(),
        relativePath: 'large.ts',
      }),
    ).rejects.toMatchObject({ code: 'REPOSITORY_FILE_TOO_LARGE' });
    await expect(
      service.readSource({
        repositoryId: linked.id,
        requestId: crypto.randomUUID(),
        relativePath: 'invalid.txt',
      }),
    ).rejects.toMatchObject({ code: 'REPOSITORY_UNSUPPORTED_ENCODING' });
    await expect(
      service.readSource({
        repositoryId: linked.id,
        requestId: crypto.randomUUID(),
        relativePath: '.env',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      service.readSource({
        repositoryId: linked.id,
        requestId: crypto.randomUUID(),
        relativePath: 'node_modules/hidden.js',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      service.readSource({
        repositoryId: linked.id,
        requestId: crypto.randomUUID(),
        relativePath: '../secret.ts',
      }),
    ).rejects.toMatchObject({ code: 'REPOSITORY_PATH_OUTSIDE_ROOT' });
    await expect(
      service.readSource({
        repositoryId: linked.id,
        requestId: crypto.randomUUID(),
        relativePath: 'outside-link/secret.ts',
      }),
    ).rejects.toMatchObject({ code: 'REPOSITORY_PATH_OUTSIDE_ROOT' });
    await expect(
      service.listTree({
        repositoryId: linked.id,
        requestId: crypto.randomUUID(),
        relativePath: 'loop-link',
      }),
    ).rejects.toMatchObject({ code: 'REPOSITORY_PATH_OUTSIDE_ROOT' });

    await service.openInVscode({
      repositoryId: linked.id,
      relativePath: 'src/index.ts',
      line: 2,
      column: 1,
    });
    expect(opened[0]).toMatch(/^vscode:\/\/file/u);
    expect(opened[0]).toContain(':2:1');
    await expect(
      service.openInVscode({ repositoryId: linked.id, relativePath: '../secret.ts', line: 1 }),
    ).rejects.toMatchObject({ code: 'REPOSITORY_PATH_OUTSIDE_ROOT' });
    const cancellation = new AbortController();
    cancellation.abort();
    await expect(
      service.listTree(
        {
          repositoryId: linked.id,
          requestId: crypto.randomUUID(),
          relativePath: '',
        },
        cancellation.signal,
      ),
    ).rejects.toMatchObject({ code: 'REPOSITORY_CANCELLED' });
    await databaseFixture.database.close();
  });
});

async function collectRootNames(
  service: RepositoryService,
  repositoryId: string,
): Promise<string[]> {
  const names: string[] = [];
  let start = 0;
  for (;;) {
    const page = await service.listTree({
      repositoryId,
      requestId: crypto.randomUUID(),
      relativePath: '',
      start,
      limit: 20,
    });
    names.push(...page.entries.map(({ name }) => name));
    if (!page.hasNext) return names;
    start += page.limit;
  }
}

async function createDatabase(): Promise<{ database: LibraryDatabase; databasePath: string }> {
  const root = await temporaryRoot('papermind-repository-db-');
  const databasePath = path.join(root, 'library.sqlite3');
  return { database: new LibraryDatabase(databasePath), databasePath };
}

async function createGitFixture(): Promise<string> {
  const root = await temporaryRoot('papermind-git-fixture-');
  await git(root, ['init']);
  await git(root, ['config', 'user.email', 'fixture@example.invalid']);
  await git(root, ['config', 'user.name', 'PaperMind Fixture']);
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'src', 'index.ts'), 'export const answer = 42;\n', 'utf8');
  await git(root, ['add', '--', 'src/index.ts']);
  await git(root, ['commit', '-m', 'fixture']);
  await git(root, ['remote', 'add', 'origin', 'https://user:secret@example.com/org/repo.git']);
  return root;
}

async function createSourceFixture(): Promise<string> {
  const root = await temporaryRoot('papermind-source-fixture-');
  await writeFile(path.join(root, 'main.py'), 'print("hello")\n', 'utf8');
  return root;
}

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function git(root: string, args: readonly string[]): Promise<string> {
  const result = await run('git', ['-C', root, ...args], { windowsHide: true });
  return result.stdout.trim();
}

function serviceFor(
  database: LibraryDatabase,
  picker: RepositoryDirectoryPicker,
  opened: string[],
) {
  const gitClient = new GitRepositoryClient();
  const opener: VscodeExternalOpener = {
    openExternal: (url) => {
      opened.push(url);
      return Promise.resolve();
    },
  };
  return new RepositoryService(
    database,
    gitClient,
    new RepositoryFileService(gitClient),
    picker,
    new RepositoryVscodeLauncher(opener),
  );
}

class QueuePicker implements RepositoryDirectoryPicker {
  public constructor(private readonly values: string[]) {}
  public chooseDirectory(): Promise<string | null> {
    return Promise.resolve(this.values.shift() ?? null);
  }
}
