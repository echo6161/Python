// @vitest-environment node

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CODE_PARSER_VERSION, parseCodeFile } from '../../src/main/code-intelligence/code-parser';
import { LibraryDatabase } from '../../src/main/database/library-database';
import { QuestionService } from '../../src/main/question/question-service';
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

describe('Research Question and typed Evidence integration', () => {
  it('persists isolated Questions and many typed Evidence references across restart', async () => {
    const fixture = await createFixture();
    const service = fixture.service;
    const question = await service.create({
      workspaceId: fixture.first.id,
      title: 'Does clipping constrain divergence?',
      description: 'Compare the paper claim and implementation.',
      priority: 'high',
    });
    const updated = await service.update({
      id: question.id,
      workspaceId: fixture.first.id,
      title: 'Does PPO clipping constrain divergence?',
      description: question.description,
      priority: 'critical',
      rowVersion: question.rowVersion,
    });
    const investigating = await service.setStatus({
      id: question.id,
      workspaceId: fixture.first.id,
      status: 'investigating',
      rowVersion: updated.rowVersion,
    });
    const paperDetails = await service.addZoteroEvidence({
      workspaceId: fixture.first.id,
      questionId: question.id,
      itemRef: ITEM_REF,
      pageNumber: 3,
      textAnchor: { exact: 'clipped surrogate objective', prefix: '', suffix: '' },
      note: 'Claim location',
    });
    const codeDetails = await service.addCodeEvidence({
      workspaceId: fixture.first.id,
      questionId: question.id,
      repositoryId: fixture.repositoryId,
      sourceSnapshotIdentity: fixture.snapshot,
      language: 'python',
      relativePath: 'src/ppo.py',
      symbolKind: 'function',
      symbolName: 'clipped_loss',
      startLine: 1,
      endLine: 2,
      contentHash: fixture.contentHash,
      note: 'Implementation location',
    });
    expect(paperDetails.evidence).toHaveLength(1);
    expect(codeDetails.evidence.map(({ kind }) => kind)).toEqual(['zotero_paper', 'code']);

    await expect(service.get(fixture.second.id, question.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      fixture.database.addZoteroEvidence({
        workspaceId: fixture.second.id,
        questionId: question.id,
        itemRef: ITEM_REF,
        itemVersion: 4,
        pageNumber: null,
        textAnchor: null,
        note: '',
        sourceSnapshotIdentity: 'invalid-cross-workspace',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const reversed = [...codeDetails.evidence].reverse().map(({ id }) => id);
    expect(
      (
        await service.reorderEvidence({
          workspaceId: fixture.first.id,
          questionId: question.id,
          evidenceIds: reversed,
        })
      ).evidence.map(({ id }) => id),
    ).toEqual(reversed);
    for (const evidence of codeDetails.evidence) {
      expect(
        (
          await service.openEvidence({
            workspaceId: fixture.first.id,
            questionId: question.id,
            evidenceId: evidence.id,
          })
        ).opened,
      ).toBe(true);
    }
    expect(fixture.navigation.openPdf).toHaveBeenCalledWith(
      expect.objectContaining({ itemKey: 'PDFAAAA2' }),
      3,
    );
    expect(fixture.navigation.openInVscode).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: 'src/ppo.py', line: 1 }),
    );

    const paperEvidence = codeDetails.evidence.find(({ kind }) => kind === 'zotero_paper');
    const codeEvidence = codeDetails.evidence.find(({ kind }) => kind === 'code');
    expect(paperEvidence).toBeDefined();
    expect(codeEvidence).toBeDefined();
    if (!paperEvidence || !codeEvidence) throw new Error('Expected both Evidence kinds.');
    await service.removeEvidence({
      workspaceId: fixture.first.id,
      questionId: question.id,
      evidenceId: paperEvidence.id,
    });
    const withoutCode = await service.removeEvidence({
      workspaceId: fixture.first.id,
      questionId: question.id,
      evidenceId: codeEvidence.id,
    });
    expect(withoutCode.evidence).toHaveLength(0);
    await service.addZoteroEvidence({
      workspaceId: fixture.first.id,
      questionId: question.id,
      itemRef: ITEM_REF,
      note: '',
    });
    await service.addCodeEvidence({
      workspaceId: fixture.first.id,
      questionId: question.id,
      repositoryId: fixture.repositoryId,
      sourceSnapshotIdentity: fixture.snapshot,
      language: 'python',
      relativePath: 'src/ppo.py',
      symbolKind: 'function',
      symbolName: 'clipped_loss',
      startLine: 1,
      endLine: 2,
      contentHash: fixture.contentHash,
      note: '',
    });

    await fixture.database.close();
    const reopened = new LibraryDatabase(fixture.databasePath);
    const reopenedService = serviceFor(reopened, fixture.status, fixture.zotero);
    expect(await reopenedService.list(fixture.first.id)).toMatchObject([
      {
        title: 'Does PPO clipping constrain divergence?',
        status: 'investigating',
        priority: 'critical',
      },
    ]);
    expect((await reopenedService.get(fixture.first.id, question.id)).evidence).toHaveLength(2);

    const archived = await reopenedService.archive({
      id: question.id,
      workspaceId: fixture.first.id,
      archived: true,
      rowVersion: investigating.rowVersion,
    });
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.status).toBe('investigating');
    await expect(
      reopenedService.setStatus({
        id: question.id,
        workspaceId: fixture.first.id,
        status: 'closed',
        rowVersion: archived.rowVersion,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const restored = await reopenedService.archive({
      id: question.id,
      workspaceId: fixture.first.id,
      archived: false,
      rowVersion: archived.rowVersion,
    });
    const closed = await reopenedService.setStatus({
      id: question.id,
      workspaceId: fixture.first.id,
      status: 'closed',
      rowVersion: restored.rowVersion,
    });
    expect(closed.status).toBe('closed');
    await reopenedService.delete(fixture.first.id, question.id);
    expect(await reopened.listWorkspaceZoteroPapers(fixture.first.id)).toHaveLength(1);
    expect(await reopened.listWorkspaceRepositories(fixture.first.id)).toHaveLength(1);
    await reopened.close();
  });

  it('preserves historical Evidence and reports stale or unavailable external locations', async () => {
    const fixture = await createFixture();
    const question = await fixture.service.create({
      workspaceId: fixture.first.id,
      title: 'Trace external changes',
      description: '',
      priority: 'normal',
    });
    await fixture.service.addZoteroEvidence({
      workspaceId: fixture.first.id,
      questionId: question.id,
      itemRef: ITEM_REF,
      pageNumber: 3,
      note: '',
    });
    const details = await fixture.service.addCodeEvidence({
      workspaceId: fixture.first.id,
      questionId: question.id,
      repositoryId: fixture.repositoryId,
      sourceSnapshotIdentity: fixture.snapshot,
      language: 'python',
      relativePath: 'src/ppo.py',
      symbolKind: 'function',
      symbolName: 'clipped_loss',
      startLine: 1,
      endLine: 2,
      contentHash: fixture.contentHash,
      note: '',
    });
    const ids = Object.fromEntries(
      details.evidence.map((evidence) => [evidence.kind, evidence.id]),
    );

    fixture.zotero.version = 5;
    fixture.status.currentSnapshotIdentity = 'snapshot:changed';
    const stale = await fixture.service.get(fixture.first.id, question.id);
    expect(stale.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'zotero_paper', availability: 'stale', itemVersion: 4 }),
        expect.objectContaining({
          kind: 'code',
          availability: 'stale',
          sourceSnapshotIdentity: fixture.snapshot,
        }),
      ]),
    );
    const codeEvidenceId = ids.code;
    expect(codeEvidenceId).toBeDefined();
    if (!codeEvidenceId) throw new Error('Expected code Evidence.');
    expect(
      await fixture.service.openEvidence({
        workspaceId: fixture.first.id,
        questionId: question.id,
        evidenceId: codeEvidenceId,
      }),
    ).toMatchObject({ opened: false, target: 'code' });

    fixture.zotero.available = false;
    await fixture.database.removeWorkspaceRepository(fixture.first.id, fixture.repositoryId);
    const unavailable = await fixture.service.get(fixture.first.id, question.id);
    expect(unavailable.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'zotero_paper', availability: 'unavailable' }),
        expect.objectContaining({ kind: 'code', availability: 'unavailable' }),
      ]),
    );
    expect(unavailable.evidence.map(({ id }) => id).sort()).toEqual(Object.values(ids).sort());
    await fixture.database.close();
  });

  it('rejects missing membership, untrusted code locations, and stale code snapshots', async () => {
    const fixture = await createFixture();
    const question = await fixture.service.create({
      workspaceId: fixture.second.id,
      title: 'Isolation',
      description: '',
      priority: 'low',
    });
    await expect(
      fixture.service.addZoteroEvidence({
        workspaceId: fixture.second.id,
        questionId: question.id,
        itemRef: ITEM_REF,
        note: '',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      fixture.service.addCodeEvidence({
        workspaceId: fixture.second.id,
        questionId: question.id,
        repositoryId: fixture.repositoryId,
        sourceSnapshotIdentity: fixture.snapshot,
        language: 'python',
        relativePath: 'src/ppo.py',
        symbolKind: 'function',
        symbolName: 'clipped_loss',
        startLine: 1,
        endLine: 2,
        contentHash: fixture.contentHash,
        note: '',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const firstQuestion = await fixture.service.create({
      workspaceId: fixture.first.id,
      title: 'Fresh index only',
      description: '',
      priority: 'normal',
    });
    fixture.status.currentSnapshotIdentity = 'snapshot:new';
    await expect(
      fixture.service.addCodeEvidence({
        workspaceId: fixture.first.id,
        questionId: firstQuestion.id,
        repositoryId: fixture.repositoryId,
        sourceSnapshotIdentity: fixture.snapshot,
        language: 'python',
        relativePath: 'src/ppo.py',
        symbolKind: 'function',
        symbolName: 'clipped_loss',
        startLine: 1,
        endLine: 2,
        contentHash: fixture.contentHash,
        note: '',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await fixture.database.close();
  });
});

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'papermind-question-'));
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
  return new QuestionService(
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
