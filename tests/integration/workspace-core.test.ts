// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { LibraryDatabase } from '../../src/main/database/library-database';
import { LibraryError } from '../../src/main/library/errors';
import {
  WorkspaceService,
  type WorkspaceZoteroResolver,
} from '../../src/main/workspace/workspace-service';
import { ZoteroBridgeError } from '../../src/main/zotero/zotero-errors';
import type {
  ZoteroConnectionStatus,
  ZoteroItemDetails,
  ZoteroItemRef,
} from '../../src/shared/contracts/zotero';

const SERVER_ID = 'ServerIdentity01';
const OTHER_SERVER_ID = 'ServerIdentity02';
const ITEM_REF: ZoteroItemRef = {
  serverId: SERVER_ID,
  library: { type: 'user', id: '0' },
  itemKey: 'PAPERAA2',
};

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function createDatabase(): Promise<{ database: LibraryDatabase; databasePath: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'papermind-workspace-test-'));
  roots.push(root);
  const databasePath = path.join(root, 'library.sqlite3');
  return { database: new LibraryDatabase(databasePath), databasePath };
}

describe('Research Workspace core integration', () => {
  it('persists CRUD, last-active state, status transitions, and shared Zotero associations', async () => {
    const { database, databasePath } = await createDatabase();
    const resolver = new FakeZoteroResolver();
    const service = new WorkspaceService(database, resolver);
    const first = await service.create({
      name: '  Evidence   review  ',
      description: 'Review description',
      researchGoal: 'Compare methods',
    });
    const second = await service.create({
      name: 'Replication',
      description: '',
      researchGoal: 'Reproduce results',
    });
    expect(first.name).toBe('Evidence review');
    expect((await service.getLastActive())?.id).toBe(first.id);
    const updatedFirst = await service.update({
      id: first.id,
      rowVersion: first.rowVersion,
      name: 'Evidence synthesis',
      description: 'Updated description',
      researchGoal: 'Compare methods and evidence',
    });
    expect(await service.get(first.id)).toMatchObject({
      name: 'Evidence synthesis',
      rowVersion: updatedFirst.rowVersion,
    });

    await service.addPaper({ workspaceId: first.id, itemRef: ITEM_REF });
    await service.addPaper({ workspaceId: second.id, itemRef: ITEM_REF });
    await expect(
      service.addPaper({ workspaceId: first.id, itemRef: ITEM_REF }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await service.setLastActive({ workspaceId: second.id });
    await database.close();

    const reopened = new LibraryDatabase(databasePath);
    const reopenedService = new WorkspaceService(reopened, resolver);
    expect((await reopenedService.getLastActive())?.id).toBe(second.id);
    expect(await reopenedService.listPapers(first.id)).toHaveLength(1);
    expect(await reopenedService.listPapers(second.id)).toHaveLength(1);

    expect(
      (await reopenedService.removePaper({ workspaceId: first.id, itemRef: ITEM_REF })).removed,
    ).toBe(true);
    expect(await reopenedService.listPapers(first.id)).toHaveLength(0);
    expect(await reopenedService.listPapers(second.id)).toHaveLength(1);

    const paused = await reopenedService.setStatus({
      id: second.id,
      rowVersion: second.rowVersion,
      status: 'paused',
    });
    expect((await reopenedService.getLastActive())?.id).toBe(second.id);
    const archived = await reopenedService.setStatus({
      id: second.id,
      rowVersion: paused.rowVersion,
      status: 'archived',
    });
    expect(archived.status).toBe('archived');
    expect(await reopenedService.getLastActive()).toBeNull();
    expect(await reopenedService.listPapers(second.id)).toHaveLength(1);
    await expect(
      reopenedService.addPaper({
        workspaceId: second.id,
        itemRef: { ...ITEM_REF, itemKey: 'PAPERAB2' },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    await reopenedService.delete({ id: second.id, confirmation: 'DELETE_WORKSPACE' });
    await expect(reopenedService.get(second.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await reopenedService.list()).map(({ id }) => id)).toEqual([first.id]);
    await reopened.close();

    const raw = new BetterSqlite3(databasePath, { readonly: true });
    expect(
      (
        raw.prepare('SELECT count(*) AS count FROM zotero_item_references').get() as {
          count: number;
        }
      ).count,
    ).toBe(1);
    expect(
      (
        raw.prepare('SELECT count(*) AS count FROM workspace_zotero_items').get() as {
          count: number;
        }
      ).count,
    ).toBe(0);
    raw.close();
  });

  it('keeps associations while reporting unavailable, missing, and stale Zotero items', async () => {
    const { database } = await createDatabase();
    const resolver = new FakeZoteroResolver();
    const service = new WorkspaceService(database, resolver);
    const workspace = await service.create({
      name: 'External state',
      description: '',
      researchGoal: '',
    });
    await service.addPaper({ workspaceId: workspace.id, itemRef: ITEM_REF });
    const otherIdentityRef = { ...ITEM_REF, serverId: OTHER_SERVER_ID };
    expect(
      await service.addPaper({ workspaceId: workspace.id, itemRef: otherIdentityRef }),
    ).toMatchObject({
      itemRef: otherIdentityRef,
      availability: 'stale_identity',
    });
    expect(await database.listWorkspaceZoteroPapers(workspace.id)).toHaveLength(2);

    resolver.mode = 'missing';
    expect((await service.listPapers(workspace.id))[0]).toMatchObject({
      availability: 'missing',
      item: null,
    });
    resolver.mode = 'unavailable';
    expect((await service.listPapers(workspace.id))[0]).toMatchObject({
      availability: 'unavailable',
      item: null,
    });
    resolver.mode = 'available';
    resolver.serverId = OTHER_SERVER_ID;
    expect((await service.listPapers(workspace.id))[0]).toMatchObject({
      availability: 'stale_identity',
      item: null,
    });
    expect(await database.listWorkspaceZoteroPapers(workspace.id)).toHaveLength(2);
    await database.close();
  });

  it('distinguishes archive from confirmed delete and rejects nonexistent ids', async () => {
    const { database } = await createDatabase();
    const service = new WorkspaceService(database, new FakeZoteroResolver());
    const workspace = await service.create({
      name: 'Lifecycle',
      description: '',
      researchGoal: '',
    });
    const archived = await service.setStatus({
      id: workspace.id,
      rowVersion: workspace.rowVersion,
      status: 'archived',
    });
    expect((await service.get(workspace.id)).status).toBe('archived');
    await expect(
      service.delete({ id: archived.id, confirmation: 'wrong' as 'DELETE_WORKSPACE' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await service.delete({ id: archived.id, confirmation: 'DELETE_WORKSPACE' });
    await expect(service.setLastActive({ workspaceId: archived.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(service.listPapers(archived.id)).rejects.toBeInstanceOf(LibraryError);
    await database.close();
  });
});

class FakeZoteroResolver implements WorkspaceZoteroResolver {
  public mode: 'available' | 'missing' | 'unavailable' = 'available';
  public serverId = SERVER_ID;

  public detectZotero(): Promise<ZoteroConnectionStatus> {
    if (this.mode === 'unavailable') {
      return Promise.resolve({
        available: false,
        apiVersion: null,
        serverIdentity: null,
        error: { code: 'not_running', message: 'Zotero is not running.' },
      });
    }
    return Promise.resolve({
      available: true,
      apiVersion: 3,
      serverIdentity: { serverId: this.serverId, schemaVersion: 37, kind: 'server' },
      error: null,
    });
  }

  public getItem(ref: ZoteroItemRef): Promise<ZoteroItemDetails> {
    if (this.mode === 'missing') {
      return Promise.reject(new ZoteroBridgeError('NOT_FOUND', 'Item missing.'));
    }
    return Promise.resolve(itemDetails(ref));
  }
}

function itemDetails(ref: ZoteroItemRef): ZoteroItemDetails {
  return {
    ref,
    itemType: 'journalArticle',
    title: 'Stable external item',
    creators: [{ creatorType: 'author', name: 'Ada Lovelace' }],
    date: '2026',
    year: 2026,
    publication: 'Test Journal',
    pdf: { hasPdf: true, state: 'available', storageMode: 'stored' },
    version: 1,
    doi: null,
    abstract: null,
    url: null,
    tags: [],
    collections: [],
  };
}
