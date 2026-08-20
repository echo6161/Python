import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';
import BetterSqlite3 from 'better-sqlite3';

function environment(libraryRoot: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env))
    if (value !== undefined) result[key] = value;
  result.NODE_ENV = 'test';
  result.PAPERMIND_LIBRARY_ROOT = libraryRoot;
  result.PAPERMIND_USER_DATA_ROOT = path.join(libraryRoot, '.electron-user-data');
  result.PAPERMIND_AI_PROVIDER = 'mock';
  result.PAPERMIND_AI_MOCK_DELAY_MS = '35';
  delete result.ELECTRON_RUN_AS_NODE;
  return result;
}

test('runs, audits, cancels and reviews a bounded Research Agent across viewports', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const libraryRoot = testInfo.outputPath('PaperMind Research Agent Library');
  const screenshotRoot = path.resolve('docs/screenshots/phase-18');
  await mkdir(libraryRoot, { recursive: true });
  await mkdir(screenshotRoot, { recursive: true });

  let app = await electron.launch({
    args: ['.', '--disable-gpu', '--disable-gpu-sandbox', '--no-sandbox'],
    env: environment(libraryRoot),
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.getByRole('button', { name: 'Create Workspace', exact: true }).first().click();
    const dialog = window.getByRole('dialog', { name: 'Create Workspace' });
    await dialog.getByLabel('Name').fill('Research Agent Workspace');
    await dialog
      .getByLabel('Research goal')
      .fill('Compare clipping evidence across paper and code');
    await dialog.getByRole('button', { name: 'Create Workspace' }).click();
  } finally {
    await app.close();
  }

  seedKnowledge(path.join(libraryRoot, 'library.sqlite3'));
  app = await electron.launch({
    args: ['.', '--disable-gpu', '--disable-gpu-sandbox', '--no-sandbox'],
    env: environment(libraryRoot),
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.setViewportSize({ width: 1280, height: 800 });
    await window.getByRole('tab', { name: 'Agent' }).click();
    await window
      .getByLabel('Research Agent goal')
      .fill('How does clipping in the paper map to code?');
    await window.getByRole('button', { name: 'Run Agent' }).click();
    await expect(window.getByRole('button', { name: 'Cancel run' })).toBeVisible();
    await window.screenshot({ path: path.join(screenshotRoot, 'agent-running-1280x800.png') });
    await expect(window.getByText('Completed', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(window.getByText('## Audited synthesis')).toBeVisible();
    await expect(window.getByRole('button', { name: /^S\d+ · paper$/u })).toBeVisible();
    await expect(window.getByRole('button', { name: /^S\d+ · code$/u })).toBeVisible();
    await expect(window.getByText(/Pending proposals · 1/u)).toBeVisible();

    for (const viewport of [
      { width: 1536, height: 1024 },
      { width: 1280, height: 800 },
      { width: 1024, height: 768 },
    ]) {
      await window.setViewportSize(viewport);
      if (viewport.width < 1200) {
        await window.getByRole('button', { name: 'Inspector' }).click();
        await expect(
          window.getByRole('complementary', { name: 'Agent run inspector' }),
        ).toHaveClass(/is-open/u);
      }
      await expect(window.getByText('Limits and usage')).toBeVisible();
      await expect(window.getByText('Tool summary')).toBeVisible();
      const overflow = await window.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
      await window.screenshot({
        path: path.join(
          screenshotRoot,
          `agent-complete-${String(viewport.width)}x${String(viewport.height)}.png`,
        ),
      });
      if (viewport.width < 1200)
        await window.getByRole('button', { name: 'Close Agent inspector' }).click();
    }

    await window.setViewportSize({ width: 1280, height: 800 });
    await window.getByRole('button', { name: /Candidate research synthesis/u }).click();
    await expect(window.getByText(/not confirmed Memory/u)).toBeVisible();
    await window.screenshot({
      path: path.join(screenshotRoot, 'agent-proposal-review-1280x800.png'),
    });
    await window.getByRole('button', { name: 'Send to Memory review' }).click();

    const database = new BetterSqlite3(path.join(libraryRoot, 'library.sqlite3'), {
      readonly: true,
    });
    expect(
      (
        database.prepare('SELECT count(*) AS count FROM research_memory_entries').get() as {
          readonly count: number;
        }
      ).count,
    ).toBe(0);
    expect(
      (
        database.prepare('SELECT count(*) AS count FROM research_memory_proposals').get() as {
          readonly count: number;
        }
      ).count,
    ).toBe(1);
    database.close();

    await window.getByLabel('Research Agent goal').fill('Cancel this bounded investigation.');
    await window.getByRole('button', { name: 'Run Agent' }).click();
    await window.getByRole('button', { name: 'Cancel run' }).click();
    await expect(window.getByText('Cancelled', { exact: true })).toBeVisible();
    await window.screenshot({ path: path.join(screenshotRoot, 'agent-cancelled-1280x800.png') });
  } finally {
    await app.close();
  }
});

function seedKnowledge(databasePath: string): void {
  const database = new BetterSqlite3(databasePath);
  const workspace = database.prepare('SELECT id FROM workspaces LIMIT 1').get() as {
    readonly id: string;
  };
  const now = '2026-08-19T08:00:00.000Z';
  database
    .prepare(
      `INSERT INTO knowledge_index_states
       (workspace_id, status, index_version, source_count, chunk_count, processed_sources,
        total_sources, completed_at, updated_at)
       VALUES (?, 'ready', 'papermind-knowledge-v1', 2, 2, 2, 2, ?, ?)`,
    )
    .run(workspace.id, now, now);
  const source = database.prepare(
    `INSERT INTO knowledge_sources
     (id, workspace_id, source_type, source_identity, snapshot_identity, title, fingerprint,
      provenance_json, unavailable_reason, indexed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '{}', NULL, ?)`,
  );
  const chunk = database.prepare(
    `INSERT INTO knowledge_chunks
     (id, source_id, workspace_id, source_type, ordinal, content_hash, content, citation,
      provenance_json, embedding_json)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, NULL)`,
  );
  const rows = [
    {
      sourceId: '11111111-1111-4111-8111-111111111111',
      chunkId: '22222222-2222-4222-8222-222222222222',
      type: 'paper',
      identity: 'zotero:paper',
      snapshot: 'zotero:paper:v1',
      title: 'PPO clipping objective',
      content: 'The clipping objective constrains the policy ratio in the bounded surrogate.',
      citation: 'PPO paper, p. 3',
      provenance: {
        sourceType: 'paper',
        sourceIdentity: 'zotero:paper',
        snapshotIdentity: 'zotero:paper:v1',
        indexedAt: now,
        itemRef: {
          serverId: 'ServerIdentity01',
          library: { type: 'user', id: '0' },
          itemKey: 'PAPERAA2',
        },
        attachmentKey: 'PDFATT22',
        pageNumber: 3,
      },
    },
    {
      sourceId: '33333333-3333-4333-8333-333333333333',
      chunkId: '44444444-4444-4444-8444-444444444444',
      type: 'code',
      identity: 'repo:policy',
      snapshot: 'commit:abc123',
      title: 'src/policy.ts',
      content: 'The clippedObjective function implements a bounded probability ratio.',
      citation: 'repo/src/policy.ts:42-58',
      provenance: {
        sourceType: 'code',
        sourceIdentity: 'repo:policy',
        snapshotIdentity: 'commit:abc123',
        indexedAt: now,
        repositoryId: '55555555-5555-4555-8555-555555555555',
        repositoryName: 'ppo-reference',
        language: 'typescript',
        relativePath: 'src/policy.ts',
        startLine: 42,
        endLine: 58,
      },
    },
  ] as const;
  database.transaction(() => {
    for (const row of rows) {
      const hash = createHash('sha256').update(row.content).digest('hex');
      source.run(
        row.sourceId,
        workspace.id,
        row.type,
        row.identity,
        row.snapshot,
        row.title,
        hash,
        now,
      );
      chunk.run(
        row.chunkId,
        row.sourceId,
        workspace.id,
        row.type,
        hash,
        row.content,
        row.citation,
        JSON.stringify(row.provenance),
      );
    }
  })();
  database.close();
}
