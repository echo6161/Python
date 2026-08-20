import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { LibraryDatabase } from '../../src/main/database/library-database';
function env(root: string) {
  const e: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) e[k] = v;
  e.NODE_ENV = 'test';
  e.PAPERMIND_LIBRARY_ROOT = root;
  e.PAPERMIND_USER_DATA_ROOT = path.join(root, '.user');
  e.PAPERMIND_AI_PROVIDER = 'mock';
  e.PAPERMIND_AI_MOCK_DELAY_MS = '5';
  delete e.ELECTRON_RUN_AS_NODE;
  return e;
}
const launch = (root: string) =>
  electron.launch({
    args: ['.', '--disable-gpu', '--disable-gpu-sandbox', '--no-sandbox'],
    env: env(root),
  });
test('completes Phase 19 Experiment, Graph, and controlled-link checkpoints', async ({
  browserName,
}, info) => {
  expect(browserName).toBe('chromium');
  const root = info.outputPath('Phase19 A'),
    shots = path.resolve('docs/screenshots/phase-19');
  await mkdir(root, { recursive: true });
  await mkdir(shots, { recursive: true });
  let app = await launch(root);
  try {
    const w = await app.firstWindow();
    await w.getByRole('button', { name: 'Create Workspace', exact: true }).first().click();
    const d = w.getByRole('dialog', { name: 'Create Workspace' });
    await d.getByLabel('Name').fill('Experiment Research');
    await d.getByLabel('Research goal').fill('Verify clipping stability');
    await d.getByRole('button', { name: 'Create Workspace' }).click();
  } finally {
    await app.close();
  }
  const db = new LibraryDatabase(path.join(root, 'library.sqlite3')),
    ws = (await db.listWorkspaces())[0];
  if (!ws) throw new Error('workspace');
  await db.createQuestion({
    workspaceId: ws.id,
    title: 'Does clipping stabilize training?',
    description: '',
    priority: 'high',
  });
  const repo = await db.createOrUpdateRepository({
    canonicalRoot: 'C:\\phase19-fixture',
    canonicalKey: 'phase19',
    displayName: 'ppo-reference',
    kind: 'git',
    gitRoot: 'C:\\phase19-fixture',
    currentBranch: 'main',
    headCommit: 'a'.repeat(40),
    remotes: [{ name: 'origin', url: 'https://github.com/example/ppo-reference.git' }],
    availability: 'available',
    lastErrorCode: null,
    observedAt: new Date().toISOString(),
  });
  await db.addWorkspaceRepository(ws.id, repo.id);
  const memory = await db.createResearchContent({
    workspaceId: ws.id,
    type: 'memory',
    title: 'Experiment finding',
    bodyMarkdown: 'Bounded confirmed memory.',
  });
  await db.updateResearchContent({
    workspaceId: ws.id,
    type: 'memory',
    id: memory.id,
    title: memory.title,
    bodyMarkdown: memory.bodyMarkdown,
    status: 'confirmed',
    rowVersion: memory.rowVersion,
  });
  await db.close();
  app = await launch(root);
  try {
    const w = await app.firstWindow();
    await w.setViewportSize({ width: 1536, height: 1024 });
    await w.getByRole('tab', { name: 'Experiments' }).click();
    await w.getByRole('button', { name: 'Experiment', exact: true }).click();
    await w.getByLabel('Title').fill('Clipping ablation');
    await w.getByLabel('Hypothesis').fill('Clipping reduces unstable policy updates.');
    await w
      .getByLabel('Research Question')
      .selectOption({ label: 'Does clipping stabilize training?' });
    await w.getByLabel('Repository snapshot').selectOption(repo.id);
    await w.getByLabel('Configuration summary').fill('seed=7, clip=0.2, epochs=10');
    await w.getByRole('button', { name: 'Create', exact: true }).click();
    await w.getByLabel('Run label').fill('Ablation 01');
    await w.getByLabel('Run tool').fill('Weights & Biases');
    await w.getByLabel('External run ID').fill('run-001');
    await w.getByRole('button', { name: 'Add run' }).click();
    await w.getByLabel('Run status Ablation 01').selectOption('succeeded');
    await w.getByLabel('Result summary').fill('Training stayed stable and reward improved.');
    await w.getByLabel('Result outcome').selectOption('supports');
    await w.getByLabel('Metric name').fill('reward');
    await w.getByLabel('Metric value').fill('42');
    await w.getByRole('button', { name: 'Save result' }).click();
    await w
      .getByLabel('Conclusion statement')
      .fill('Draft a bounded conclusion from the recorded result.');
    await w.getByRole('button', { name: 'AI proposal' }).click();
    await expect(w.getByText('Unconfirmed AI proposal')).toBeVisible();
    await w
      .getByLabel('Proposed conclusion')
      .fill('Clipping supported stability for this pinned run.');
    await w.getByRole('button', { name: 'Confirm conclusion' }).click();
    await expect(w.getByText('confirmed conclusion')).toBeVisible();
    await w.screenshot({ path: path.join(shots, 'checkpoint-a-experiment-1536x1024.png') });
    expect(
      await w.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await w.getByRole('tab', { name: 'Graph' }).click();
    await expect(w.getByText(/nodes ·/u)).toBeVisible();
    const runFilter = w.getByRole('checkbox', { name: 'run' });
    await runFilter.uncheck();
    await expect(w.getByText('Ablation 01', { exact: true })).toHaveCount(0);
    await runFilter.check();
    await expect(w.getByText('Ablation 01', { exact: true })).toBeVisible();
    await w.getByText('Clipping ablation', { exact: true }).last().click();
    await expect(w.getByRole('complementary', { name: 'Graph node details' })).toContainText(
      'Clipping ablation',
    );
    for (const viewport of [
      { width: 1536, height: 1024 },
      { width: 1280, height: 800 },
      { width: 1024, height: 768 },
    ]) {
      await w.setViewportSize(viewport);
      if (viewport.width < 1200)
        await expect(w.getByRole('complementary', { name: 'Graph node details' })).toHaveClass(
          /open/u,
        );
      expect(
        await w.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      await w.screenshot({
        path: path.join(
          shots,
          `graph-main-${String(viewport.width)}x${String(viewport.height)}.png`,
        ),
      });
    }
    await w.screenshot({ path: path.join(shots, 'checkpoint-b-graph-1024x768.png') });
    await w.setViewportSize({ width: 1280, height: 800 });
    await w.getByRole('button', { name: 'Close Graph details' }).click();
    await w.getByText('Experiment finding', { exact: true }).last().click();
    await w.getByRole('button', { name: 'Open Obsidian' }).click();
    await expect(w.getByRole('status')).toContainText('Export it from Notes');
    await w.screenshot({ path: path.join(shots, 'checkpoint-c-obsidian-fallback-1280x800.png') });
  } finally {
    await app.close();
  }
});
