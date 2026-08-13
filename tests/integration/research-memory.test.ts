// @vitest-environment node

import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { LibraryDatabase } from '../../src/main/database/library-database';
import { MemoryExportService } from '../../src/main/research-memory/memory-export-service';
import { ResearchMemoryService } from '../../src/main/research-memory/research-memory-service';
import type { KnowledgeEngineService } from '../../src/main/knowledge/knowledge-engine-service';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Notes and Research Memory persistence', () => {
  it('does not persist a proposal when generation fails', async () => {
    const fixture = await createFixture();
    const note = await fixture.database.createResearchContent({
      workspaceId: fixture.workspaceId,
      type: 'note',
      title: 'Provider failure',
      bodyMarkdown: 'Do not persist halfway.',
    });
    const service = new ResearchMemoryService(
      fixture.database,
      {} as KnowledgeEngineService,
      { generate: () => Promise.reject(new Error('provider unavailable')) },
      {} as MemoryExportService,
    );
    await expect(
      service.createProposal({
        workspaceId: fixture.workspaceId,
        sourceNoteId: note.id,
        reason: 'Keep it',
      }),
    ).rejects.toThrow('provider unavailable');
    expect(await fixture.database.listResearchMemoryProposals(fixture.workspaceId)).toHaveLength(0);
    await fixture.database.close();
  });

  it('persists isolated CRUD, search, status, references and proposal confirmation without touching chat', async () => {
    const fixture = await createFixture();
    const note = await fixture.database.createResearchContent({
      workspaceId: fixture.workspaceId,
      type: 'note',
      title: 'Clipping observation',
      bodyMarkdown: 'The ratio is clipped, but KL is not directly constrained.',
    });
    const draft = await fixture.database.createResearchContent({
      workspaceId: fixture.workspaceId,
      type: 'memory',
      title: 'Draft memory',
      bodyMarkdown: 'Needs review.',
    });
    expect(draft).toMatchObject({ type: 'memory', status: 'draft', provenance: 'manual' });
    const updated = await fixture.database.updateResearchContent({
      workspaceId: fixture.workspaceId,
      type: 'memory',
      id: draft.id,
      title: draft.title,
      bodyMarkdown: draft.bodyMarkdown,
      status: 'confirmed',
      rowVersion: draft.rowVersion,
    });
    expect(updated).toMatchObject({ status: 'confirmed' });
    expect(
      await fixture.database.listResearchContent({
        workspaceId: fixture.workspaceId,
        query: 'clipped',
      }),
    ).toHaveLength(1);

    await fixture.database.addResearchReference({
      id: crypto.randomUUID(),
      workspaceId: fixture.workspaceId,
      ownerType: 'note',
      ownerId: note.id,
      chunkId: fixture.paperChunkId,
      sourceType: 'paper',
      title: 'PPO',
      citation: 'PPO, p. 3',
      snippet: 'The probability ratio is clipped.',
      provenanceJson: JSON.stringify(paperProvenance(fixture.workspaceId)),
      createdAt: new Date().toISOString(),
    });
    await expect(
      fixture.database.addResearchReference({
        id: crypto.randomUUID(),
        workspaceId: fixture.workspaceId,
        ownerType: 'note',
        ownerId: note.id,
        chunkId: fixture.paperChunkId,
        sourceType: 'paper',
        title: 'PPO',
        citation: 'PPO, p. 3',
        snippet: 'Duplicate',
        provenanceJson: JSON.stringify(paperProvenance(fixture.workspaceId)),
        createdAt: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const proposal = await fixture.database.createResearchMemoryProposal({
      id: crypto.randomUUID(),
      workspaceId: fixture.workspaceId,
      sourceNoteId: note.id,
      title: 'Memory: Clipping observation',
      bodyMarkdown: 'Clipping is a surrogate control, not a hard KL constraint [S1].',
      reason: 'Preserve this distinction.',
      providerId: 'openai',
      model: 'fake-model',
      createdAt: new Date().toISOString(),
    });
    expect(proposal).toMatchObject({ status: 'pending' });
    expect(proposal.references).toHaveLength(1);
    const rawBefore = new BetterSqlite3(fixture.databasePath, { readonly: true });
    expect(
      rawBefore.prepare('SELECT count(*) AS count FROM research_memory_entries').get(),
    ).toEqual({ count: 1 });
    expect(
      rawBefore.prepare('SELECT count(*) AS count FROM research_chat_conversations').get(),
    ).toEqual({ count: 0 });
    rawBefore.close();

    const confirmed = await fixture.database.confirmResearchMemoryProposal({
      workspaceId: fixture.workspaceId,
      proposalId: proposal.id,
      title: 'Confirmed clipping memory',
      bodyMarkdown: proposal.bodyMarkdown,
      rowVersion: proposal.rowVersion,
    });
    expect(confirmed).toMatchObject({ status: 'confirmed', provenance: 'ai-proposed-confirmed' });
    expect(confirmed.references).toHaveLength(1);
    await expect(
      fixture.database.confirmResearchMemoryProposal({
        workspaceId: fixture.workspaceId,
        proposalId: proposal.id,
        title: 'Again',
        bodyMarkdown: 'No',
        rowVersion: proposal.rowVersion,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const other = await fixture.database.createWorkspace({
      name: 'Other',
      description: '',
      researchGoal: '',
    });
    expect(
      await fixture.database.getResearchContent({
        workspaceId: other.id,
        type: 'note',
        id: note.id,
      }),
    ).toBeNull();
    await expect(
      fixture.database.addResearchReference({
        id: crypto.randomUUID(),
        workspaceId: other.id,
        ownerType: 'note',
        ownerId: note.id,
        chunkId: fixture.paperChunkId,
        sourceType: 'paper',
        title: 'PPO',
        citation: 'PPO, p. 3',
        snippet: 'No',
        provenanceJson: JSON.stringify(paperProvenance(fixture.workspaceId)),
        createdAt: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await fixture.database.close();
    const reopened = new LibraryDatabase(fixture.databasePath);
    expect(await reopened.getMigrationVersions()).toContain(12);
    expect(
      (
        await reopened.getResearchContent({
          workspaceId: fixture.workspaceId,
          type: 'memory',
          id: confirmed.id,
        })
      )?.references,
    ).toHaveLength(1);
    await reopened.close();
  });

  it('rejects a proposal without creating Memory and deletes only PaperMind-owned rows', async () => {
    const fixture = await createFixture();
    const note = await fixture.database.createResearchContent({
      workspaceId: fixture.workspaceId,
      type: 'note',
      title: 'Reject me',
      bodyMarkdown: 'Temporary.',
    });
    const proposal = await fixture.database.createResearchMemoryProposal({
      id: crypto.randomUUID(),
      workspaceId: fixture.workspaceId,
      sourceNoteId: note.id,
      title: 'Candidate',
      bodyMarkdown: 'Candidate body',
      reason: 'Test review',
      providerId: 'openai',
      model: 'fake',
      createdAt: new Date().toISOString(),
    });
    const rejected = await fixture.database.rejectResearchMemoryProposal({
      workspaceId: fixture.workspaceId,
      proposalId: proposal.id,
      rowVersion: proposal.rowVersion,
    });
    expect(rejected.status).toBe('rejected');
    expect(
      await fixture.database.listResearchContent({
        workspaceId: fixture.workspaceId,
        types: ['memory'],
      }),
    ).toHaveLength(0);
    expect(
      await fixture.database.deleteResearchContent({
        workspaceId: fixture.workspaceId,
        type: 'note',
        id: note.id,
      }),
    ).toBe(true);
    const raw = new BetterSqlite3(fixture.databasePath, { readonly: true });
    expect(raw.prepare('SELECT count(*) AS count FROM research_memory_proposals').get()).toEqual({
      count: 1,
    });
    expect(raw.prepare('SELECT count(*) AS count FROM papers').get()).toEqual({ count: 0 });
    raw.close();
    await fixture.database.close();
  });

  it('upgrades legacy data additively and remains idempotent', async () => {
    const fixture = await createFixture();
    const raw = new BetterSqlite3(fixture.databasePath);
    raw
      .prepare(
        "INSERT INTO settings (key, value_json, updated_at) VALUES ('legacy-phase', 'true', ?)",
      )
      .run(new Date().toISOString());
    raw.close();
    await fixture.database.close();
    const reopened = new LibraryDatabase(fixture.databasePath);
    const versions = await reopened.getMigrationVersions();
    expect(versions.at(-1)).toBe(12);
    expect(versions.filter((version) => version === 12)).toHaveLength(1);
    await reopened.close();
    const check = new BetterSqlite3(fixture.databasePath, { readonly: true });
    expect(
      check.prepare("SELECT value_json FROM settings WHERE key = 'legacy-phase'").get(),
    ).toEqual({ value_json: 'true' });
    check.close();
  });
});

describe('one-way Markdown export', () => {
  it('previews conflicts, creates a new file, never overwrites and binds preview to its owner', async () => {
    const fixture = await createFixture();
    const note = await fixture.database.createResearchContent({
      workspaceId: fixture.workspaceId,
      type: 'note',
      title: 'Export safety',
      bodyMarkdown: '# Finding\n\nBounded.',
    });
    const vault = path.join(fixture.root, 'test-vault');
    await import('node:fs/promises').then(({ mkdir }) =>
      mkdir(path.join(vault, 'PaperMind'), { recursive: true }),
    );
    const existingName = `Export safety-${note.id.slice(0, 8)}.md`;
    const existingPath = path.join(vault, 'PaperMind', existingName);
    await writeFile(existingPath, 'USER CONTENT', 'utf8');
    const service = new MemoryExportService(fixture.database, {
      chooseVaultDirectory: () => Promise.resolve(vault),
    });
    const preview = await service.prepare(
      { workspaceId: fixture.workspaceId, type: 'note', id: note.id },
      7,
    );
    expect(preview).toMatchObject({ conflict: true, existingPreview: 'USER CONTENT' });
    await expect(service.confirm(preview?.id ?? '', 8)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const result = await service.confirm(preview?.id ?? '', 7);
    expect(result.relativePath).toContain('-2.md');
    expect(await readFile(existingPath, 'utf8')).toBe('USER CONTENT');
    expect(await readFile(path.join(vault, ...result.relativePath.split('/')), 'utf8')).toContain(
      'papermind-type: note',
    );
    await fixture.database.close();
  });

  it('fails safely if the reviewed target appears before confirmation', async () => {
    const fixture = await createFixture();
    const note = await fixture.database.createResearchContent({
      workspaceId: fixture.workspaceId,
      type: 'memory',
      title: '../unsafe memory',
      bodyMarkdown: 'Safe export.',
    });
    const vault = path.join(fixture.root, 'vault-race');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(vault, { recursive: true }));
    const service = new MemoryExportService(fixture.database, {
      chooseVaultDirectory: () => Promise.resolve(vault),
    });
    const preview = await service.prepare(
      { workspaceId: fixture.workspaceId, type: 'memory', id: note.id },
      4,
    );
    if (!preview) throw new Error('Preview missing');
    const reviewedTarget = path.join(vault, ...preview.relativePath.split('/'));
    await import('node:fs/promises').then(({ mkdir }) =>
      mkdir(path.dirname(reviewedTarget), { recursive: true }),
    );
    await writeFile(reviewedTarget, 'EXTERNAL WINNER', 'utf8');
    await expect(service.confirm(preview.id, 4)).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
    expect(await readFile(reviewedTarget, 'utf8')).toBe('EXTERNAL WINNER');
    expect(path.resolve(reviewedTarget).startsWith(path.resolve(vault))).toBe(true);
    await fixture.database.close();
  });

  it('rejects an export directory junction that escapes the selected Vault', async () => {
    const fixture = await createFixture();
    const note = await fixture.database.createResearchContent({
      workspaceId: fixture.workspaceId,
      type: 'note',
      title: 'Junction boundary',
      bodyMarkdown: 'Remain inside the selected Vault.',
    });
    const vault = path.join(fixture.root, 'vault-junction');
    const outside = path.join(fixture.root, 'outside-vault');
    await Promise.all([mkdir(vault, { recursive: true }), mkdir(outside, { recursive: true })]);
    await symlink(outside, path.join(vault, 'PaperMind'), 'junction');
    const service = new MemoryExportService(fixture.database, {
      chooseVaultDirectory: () => Promise.resolve(vault),
    });
    await expect(
      service.prepare({ workspaceId: fixture.workspaceId, type: 'note', id: note.id }, 5),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await fixture.database.close();
  });
});

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'papermind-memory-test-'));
  roots.push(root);
  const databasePath = path.join(root, 'library.sqlite3');
  const database = new LibraryDatabase(databasePath);
  const workspace = await database.createWorkspace({
    name: 'Memory Workspace',
    description: '',
    researchGoal: 'Keep durable findings',
  });
  return {
    root,
    databasePath,
    database,
    workspaceId: workspace.id,
    paperChunkId: crypto.randomUUID(),
  };
}

function paperProvenance(workspaceId: string) {
  return {
    sourceType: 'paper' as const,
    sourceIdentity: `paper:${workspaceId}`,
    snapshotIdentity: 'paper:v1',
    indexedAt: new Date().toISOString(),
    itemRef: {
      serverId: 'ServerIdentity01',
      library: { type: 'user' as const, id: '0' },
      itemKey: 'PAPERAA2',
    },
    attachmentKey: 'PDFATT22',
    pageNumber: 3,
  };
}
