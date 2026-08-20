import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { LibraryDatabase } from '../../src/main/database/library-database';
function environment(root: string) {
  const e: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) e[k] = v;
  e.NODE_ENV = 'test';
  e.PAPERMIND_LIBRARY_ROOT = root;
  e.PAPERMIND_USER_DATA_ROOT = path.join(root, '.user');
  e.PAPERMIND_AI_PROVIDER = 'mock';
  delete e.ELECTRON_RUN_AS_NODE;
  return e;
}
const launch = (root: string) =>
  electron.launch({
    args: ['.', '--disable-gpu', '--disable-gpu-sandbox', '--no-sandbox'],
    env: environment(root),
  });
test('captures V1 onboarding, populated Overview, and destructive confirmation baselines', async ({
  browserName,
}, info) => {
  expect(browserName).toBe('chromium');
  const shots = path.resolve('docs/screenshots/phase-20');
  await mkdir(shots, { recursive: true });
  const emptyRoot = info.outputPath('V1 Empty');
  await mkdir(emptyRoot, { recursive: true });
  let app = await launch(emptyRoot);
  try {
    const w = await app.firstWindow();
    await w.setViewportSize({ width: 1280, height: 800 });
    await expect(w.getByRole('heading', { name: 'Create a research Workspace' })).toBeVisible();
    await w.keyboard.press('Tab');
    expect(await w.evaluate(() => document.activeElement?.tagName)).toBe('BUTTON');
    await w.screenshot({ path: path.join(shots, 'state-onboarding-empty-1280x800.png') });
    expect(
      await w.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  } finally {
    await app.close();
  }
  const root = info.outputPath('V1 Overview'),
    databasePath = path.join(root, 'library.sqlite3');
  await mkdir(root, { recursive: true });
  const db = new LibraryDatabase(databasePath),
    workspace = await db.createWorkspace({
      name: 'V1 Evidence Review',
      description: 'Release-readiness fixture',
      researchGoal: 'Audit evidence across papers, code, plans, and conclusions',
    });
  await db.setLastActiveWorkspace(workspace.id);
  await db.createQuestion({
    workspaceId: workspace.id,
    title: 'Does clipping improve stability?',
    description: 'Bounded release fixture question',
    priority: 'high',
  });
  const repo = await db.createOrUpdateRepository({
    canonicalRoot: 'C:\\v1-readiness-fixture',
    canonicalKey: 'v1-readiness',
    displayName: 'ppo-reference',
    kind: 'git',
    gitRoot: 'C:\\v1-readiness-fixture',
    currentBranch: 'main',
    headCommit: 'a'.repeat(40),
    remotes: [],
    availability: 'missing',
    lastErrorCode: 'MISSING',
    observedAt: '2026-08-20T00:00:00.000Z',
  });
  await db.addWorkspaceRepository(workspace.id, repo.id);
  await db.addWorkspaceZoteroPaper(workspace.id, {
    serverId: 'ServerIdentity01',
    library: { type: 'user', id: '1' },
    itemKey: 'ABCD2345',
  });
  await db.close();
  app = await launch(root);
  try {
    const w = await app.firstWindow();
    await expect(w.getByRole('heading', { name: 'V1 Evidence Review' })).toBeVisible();
    for (const viewport of [
      { width: 1536, height: 1024 },
      { width: 1280, height: 800 },
      { width: 1024, height: 768 },
    ]) {
      await w.setViewportSize(viewport);
      await expect(w.getByText('Does clipping improve stability?')).toBeVisible();
      await expect(w.getByText('ppo-reference')).toBeVisible();
      await expect(w.getByRole('tab', { name: 'Experiments' })).toBeVisible();
      await expect(w.getByRole('tab', { name: 'Graph' })).toBeVisible();
      expect(
        await w.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      await w.screenshot({
        path: path.join(shots, `overview-${String(viewport.width)}x${String(viewport.height)}.png`),
      });
    }
    await w.setViewportSize({ width: 1280, height: 800 });
    await w.getByRole('button', { name: 'Delete' }).click();
    const dialog = w.getByRole('alertdialog', { name: 'Delete Workspace?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await w.screenshot({ path: path.join(shots, 'state-destructive-confirmation-1280x800.png') });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  } finally {
    await app.close();
  }
  expect(existsSync('C:\\v1-readiness-fixture')).toBe(false);
});
