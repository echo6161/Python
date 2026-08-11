// @vitest-environment node

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CODE_PARSER_VERSION, parseCodeFile } from '../../src/main/code-intelligence/code-parser';
import { LibraryDatabase } from '../../src/main/database/library-database';
import { PaperCodeLinkService } from '../../src/main/paper-code-link/paper-code-link-service';
import type { CodeIndexStatus } from '../../src/shared/contracts/code-intelligence';
import type { ZoteroItemDetails, ZoteroItemRef } from '../../src/shared/contracts/zotero';

const roots: string[] = [];
const ITEM_REF: ZoteroItemRef = {
  serverId: 'ServerIdentity01',
  library: { type: 'user', id: '0' },
  itemKey: 'PAPERAA2',
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('Paper-Code Link integration', () => {
  it('persists, updates, filters, navigates, and deletes only the PaperMind link', async () => {
    const fixture = await createFixture();
    const created = await fixture.service.create(linkInput(fixture));
    expect(created).toMatchObject({
      relationType: 'implements',
      provenance: 'manual',
      paperAvailability: 'available',
      codeAvailability: 'available',
      pageNumber: 3,
      relativePath: 'src/ppo.py',
    });
    expect(
      await fixture.service.listForPaper({ workspaceId: fixture.first.id, itemRef: ITEM_REF }),
    ).toHaveLength(1);
    expect(
      await fixture.service.listForCode({
        workspaceId: fixture.first.id,
        repositoryId: fixture.repositoryId,
        relativePath: 'src/ppo.py',
      }),
    ).toHaveLength(1);

    const updated = await fixture.service.update({
      id: created.id,
      workspaceId: fixture.first.id,
      relationType: 'corresponds_to',
      label: 'Equation 7',
      description: 'User-confirmed correspondence.',
      rowVersion: created.rowVersion,
    });
    expect(updated).toMatchObject({ relationType: 'corresponds_to', label: 'Equation 7' });
    expect((await fixture.service.openPaper(fixture.first.id, created.id)).opened).toBe(true);
    expect((await fixture.service.openCode(fixture.first.id, created.id)).opened).toBe(true);
    expect(fixture.navigation.openPdf).toHaveBeenCalledWith(
      expect.objectContaining({ itemKey: 'PDFAAAA2' }),
      3,
    );
    expect(fixture.navigation.openInVscode).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: 'src/ppo.py', line: 1 }),
    );

    await fixture.database.close();
    const reopened = new LibraryDatabase(fixture.databasePath);
    const reopenedService = serviceFor(reopened, fixture.status, fixture.zotero);
    expect(await reopenedService.get(fixture.first.id, created.id)).toMatchObject({
      label: 'Equation 7',
      codeSnapshotIdentity: fixture.snapshot,
      itemVersion: 4,
    });
    await reopenedService.delete(fixture.first.id, created.id);
    expect(await reopenedService.listForWorkspace(fixture.first.id)).toHaveLength(0);
    expect(await reopened.listWorkspaceZoteroPapers(fixture.first.id)).toHaveLength(1);
    expect(await reopened.listWorkspaceRepositories(fixture.first.id)).toHaveLength(1);
    await reopened.close();
  });

  it('preserves immutable locations and reports independent paper/code stale states', async () => {
    const fixture = await createFixture();
    const created = await fixture.service.create(linkInput(fixture));
    fixture.zotero.version = 5;
    fixture.status.currentSnapshotIdentity = 'snapshot:changed';
    const stale = await fixture.service.get(fixture.first.id, created.id);
    expect(stale).toMatchObject({
      itemVersion: 4,
      paperAvailability: 'stale',
      codeSnapshotIdentity: fixture.snapshot,
      currentCodeSnapshotIdentity: 'snapshot:changed',
      codeAvailability: 'stale',
      startLine: 1,
      endLine: 2,
    });
    expect(await fixture.service.openCode(fixture.first.id, created.id)).toMatchObject({
      opened: false,
      target: 'code',
    });

    fixture.zotero.available = false;
    await fixture.database.removeWorkspaceRepository(fixture.first.id, fixture.repositoryId);
    expect(await fixture.database.deleteRepository(fixture.repositoryId)).toBe(true);
    const unavailable = await fixture.service.get(fixture.first.id, created.id);
    expect(unavailable.paperAvailability).toBe('unavailable');
    expect(unavailable.codeAvailability).toBe('unavailable');
    expect(await fixture.service.listForWorkspace(fixture.first.id)).toHaveLength(1);
    await fixture.database.close();
  });

  it('rejects cross-Workspace references, stale snapshots, and untrusted line ranges', async () => {
    const fixture = await createFixture();
    await expect(
      fixture.service.create({ ...linkInput(fixture), workspaceId: fixture.second.id }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    fixture.status.currentSnapshotIdentity = 'snapshot:new';
    await expect(fixture.service.create(linkInput(fixture))).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    fixture.status.currentSnapshotIdentity = fixture.snapshot;
    await expect(
      fixture.service.create({ ...linkInput(fixture), startLine: 1, endLine: 999 }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await fixture.database.close();
  });
});

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'papermind-links-'));
  roots.push(root);
  const databasePath = path.join(root, 'library.sqlite3');
  const repositoryRoot = path.join(root, 'repository');
  await mkdir(repositoryRoot);
  const database = new LibraryDatabase(databasePath);
  const first = await database.createWorkspace({
    name: 'First',
    description: '',
    researchGoal: '',
  });
  const second = await database.createWorkspace({
    name: 'Second',
    description: '',
    researchGoal: '',
  });
  await database.addWorkspaceZoteroPaper(first.id, ITEM_REF);
  const now = new Date().toISOString();
  const repository = await database.createOrUpdateRepository({
    canonicalRoot: repositoryRoot,
    canonicalKey: repositoryRoot.toLocaleLowerCase(),
    displayName: 'PPO source',
    kind: 'source_folder',
    gitRoot: null,
    currentBranch: null,
    headCommit: null,
    remotes: [],
    availability: 'available',
    lastErrorCode: null,
    observedAt: now,
  });
  await database.addWorkspaceRepository(first.id, repository.id);
  const content = 'def clipped_loss():\n    return 1\n';
  const contentHash = createHash('sha256').update(content).digest('hex');
  const snapshot = 'snapshot:trusted';
  const requestId = crypto.randomUUID();
  await database.beginCodeIndex(repository.id, requestId, CODE_PARSER_VERSION, 1, now);
  await database.completeCodeIndex({
    repositoryId: repository.id,
    requestId,
    mode: 'rebuild',
    snapshotIdentity: snapshot,
    dirty: true,
    parserVersion: CODE_PARSER_VERSION,
    changedFiles: [
      parseCodeFile({
        relativePath: 'src/ppo.py',
        language: 'python',
        content,
        contentHash,
        byteSize: Buffer.byteLength(content),
      }),
    ],
    removedPaths: [],
    completedAt: now,
  });
  const status = readyStatus(repository.id, snapshot);
  const zotero = new FakeZotero();
  const navigation = {
    openInVscode: vi.fn(() => Promise.resolve({ opened: true })),
    openItem: vi.fn(() => Promise.resolve()),
    openPdf: vi.fn(() => Promise.resolve()),
  };
  return {
    database,
    databasePath,
    first,
    second,
    repositoryId: repository.id,
    contentHash,
    snapshot,
    status,
    zotero,
    navigation,
    service: serviceFor(database, status, zotero, navigation),
  };
}

function linkInput(fixture: Awaited<ReturnType<typeof createFixture>>) {
  return {
    workspaceId: fixture.first.id,
    itemRef: ITEM_REF,
    pageNumber: 3,
    locationLabel: 'Equation 7',
    textAnchor: { exact: 'clipped surrogate objective', prefix: '', suffix: '' },
    repositoryId: fixture.repositoryId,
    codeSnapshotIdentity: fixture.snapshot,
    language: 'python' as const,
    relativePath: 'src/ppo.py',
    symbolKind: 'function' as const,
    symbolName: 'clipped_loss',
    startLine: 1,
    endLine: 2,
    contentHash: fixture.contentHash,
    relationType: 'implements' as const,
    label: 'PPO clipping',
    description: 'Manual trace from claim to implementation.',
  };
}

function serviceFor(
  database: LibraryDatabase,
  status: MutableStatus,
  zotero: FakeZotero,
  navigation = {
    openInVscode: vi.fn(() => Promise.resolve({ opened: true })),
    openItem: vi.fn(() => Promise.resolve()),
    openPdf: vi.fn(() => Promise.resolve()),
  },
) {
  return new PaperCodeLinkService(
    database,
    zotero,
    database,
    { getStatus: vi.fn(() => Promise.resolve({ ...status })) },
    { openInVscode: navigation.openInVscode },
    { openItem: navigation.openItem, openPdf: navigation.openPdf },
  );
}

interface MutableStatus extends CodeIndexStatus {
  currentSnapshotIdentity: string | null;
}

function readyStatus(repositoryId: string, snapshot: string): MutableStatus {
  return {
    repositoryId,
    status: 'ready',
    snapshotIdentity: snapshot,
    currentSnapshotIdentity: snapshot,
    dirty: true,
    parserVersion: CODE_PARSER_VERSION,
    fileCount: 1,
    symbolCount: 2,
    chunkCount: 1,
    processedFiles: 1,
    totalFiles: 1,
    lastErrorCode: null,
    lastErrorMessage: null,
    startedAt: null,
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

class FakeZotero {
  public version = 4;
  public available = true;
  public getItem(ref: ZoteroItemRef): Promise<ZoteroItemDetails> {
    if (!this.available) return Promise.reject(new Error('Zotero unavailable'));
    return Promise.resolve({
      ref,
      itemType: 'journalArticle',
      title: 'PPO paper',
      creators: [],
      date: '2017',
      year: 2017,
      publication: null,
      pdf: { hasPdf: true, state: 'available', storageMode: 'stored' },
      version: this.version,
      doi: null,
      abstract: null,
      url: null,
      tags: [],
      collections: [],
    });
  }
  public findPrimaryPdf(ref: ZoteroItemRef) {
    return Promise.resolve({
      ref: { ...ref, itemKey: 'PDFAAAA2' },
      parentItemRef: ref,
      title: 'PDF',
      filename: 'paper.pdf',
      contentType: 'application/pdf',
      linkMode: 'imported_file' as const,
      isPdf: true,
      pdf: { hasPdf: true as const, state: 'available' as const, storageMode: 'stored' as const },
      version: this.version,
    });
  }
}
