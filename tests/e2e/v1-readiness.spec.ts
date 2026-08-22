import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
  const shots = path.resolve('docs/screenshots/overview-redesign');
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
    await w.screenshot({ path: info.outputPath('state-onboarding-empty-1280x800.png') });
    expect(
      await w.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  } finally {
    await app.close();
  }

  const emptyOverviewRoot = info.outputPath('Overview Empty State');
  await mkdir(emptyOverviewRoot, { recursive: true });
  const emptyOverviewDatabase = new LibraryDatabase(
    path.join(emptyOverviewRoot, 'library.sqlite3'),
  );
  const emptyWorkspace = await emptyOverviewDatabase.createWorkspace({
    name: 'New research study',
    description: '',
    researchGoal: '',
  });
  await emptyOverviewDatabase.setLastActiveWorkspace(emptyWorkspace.id);
  await emptyOverviewDatabase.close();
  app = await launch(emptyOverviewRoot);
  try {
    const w = await app.firstWindow();
    await w.setViewportSize({ width: 1280, height: 800 });
    await expect(w.getByRole('heading', { name: 'Research Goal' })).toBeVisible();
    await expect(w.getByRole('button', { name: /Define goal/ })).toBeVisible();
    await expect(w.getByRole('button', { name: /Create plan/ })).toBeVisible();
    await expect(w.getByRole('button', { name: /Add from Zotero/ })).toBeVisible();
    await w.screenshot({ path: path.join(shots, 'overview-workbench-empty-1280x800.png') });
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
  for (const [index, title] of [
    'Does clipping improve stability under distribution shift?',
    'Which assumptions determine the practical trust-region effect?',
    'How does the implementation measure policy divergence?',
    'Which ablations isolate the clipping contribution?',
    'Where do the paper and implementation disagree?',
    'What evidence would close the remaining uncertainty?',
  ].entries())
    await db.createQuestion({
      workspaceId: workspace.id,
      title,
      description: 'Bounded release fixture question',
      priority: index < 2 ? 'high' : 'normal',
    });
  const repositoryRoot = info.outputPath('overview-source-folder');
  const sourcePath = path.join(repositoryRoot, 'src', 'policy.ts');
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(
    sourcePath,
    [
      'export function clippedObjective(ratio: number, advantage: number) {',
      '  const clipped = Math.min(Math.max(ratio, 0.8), 1.2);',
      '  return Math.min(ratio * advantage, clipped * advantage);',
      '}',
    ].join('\n'),
    'utf8',
  );
  const repo = await db.createOrUpdateRepository({
    canonicalRoot: repositoryRoot,
    canonicalKey: 'v1-readiness',
    displayName: 'ppo-reference',
    kind: 'source_folder',
    gitRoot: null,
    currentBranch: null,
    headCommit: null,
    remotes: [],
    availability: 'available',
    lastErrorCode: null,
    observedAt: '2026-08-20T00:00:00.000Z',
  });
  await db.addWorkspaceRepository(workspace.id, repo.id);
  await db.addWorkspaceZoteroPaper(workspace.id, {
    serverId: 'ServerIdentity01',
    library: { type: 'user', id: '1' },
    itemKey: 'ABCD2345',
  });
  let plan = await db.createResearchPlan({
    workspaceId: workspace.id,
    goal: workspace.researchGoal,
  });
  plan = await db.createPlanTask({
    workspaceId: workspace.id,
    planId: plan.id,
    title: 'Review the primary clipping evidence and stated limitations',
    description: 'Capture the exact claim before comparing code.',
  });
  await db.createPlanTask({
    workspaceId: workspace.id,
    planId: plan.id,
    title: 'Trace the objective to the current implementation',
    description: 'Record the pinned code location and any divergence.',
  });
  await db.close();
  app = await launch(root);
  try {
    const w = await app.firstWindow();
    await expect(w.getByRole('heading', { name: 'V1 Evidence Review' })).toBeVisible();
    const sourceTree = w.getByRole('navigation', { name: 'ppo-reference source tree' });
    await expect(sourceTree).toBeVisible();
    await sourceTree.getByRole('button', { name: 'src' }).click();
    await sourceTree.getByRole('button', { name: 'policy.ts' }).click();
    await expect(w.getByRole('heading', { name: 'src/policy.ts' })).toBeVisible();
    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 1440, height: 900 },
      { width: 1280, height: 800 },
    ]) {
      await w.setViewportSize(viewport);
      await expect(
        w.getByText('Does clipping improve stability under distribution shift?').first(),
      ).toBeVisible();
      await expect(w.getByText('ppo-reference').first()).toBeVisible();
      await expect(
        w.getByText('Review the primary clipping evidence and stated limitations').first(),
      ).toBeVisible();
      await expect(w.getByRole('heading', { name: 'Papers', exact: true })).toBeVisible();
      await expect(w.getByRole('heading', { name: 'Code', exact: true })).toBeVisible();
      await expect(w.getByRole('heading', { name: 'Research Graph', exact: true })).toBeVisible();
      await expect(
        w.getByRole('heading', { name: 'Paper-Code Links', exact: true }),
      ).toBeAttached();
      await expect(w.getByRole('heading', { name: 'Recent Notes', exact: true })).toBeAttached();
      await expect(w.getByRole('heading', { name: 'AI Assistant', exact: true })).toBeAttached();
      await expect(w.getByRole('tab', { name: 'Experiments' })).toBeVisible();
      await expect(w.getByRole('tab', { name: 'Graph' })).toBeVisible();
      expect(
        await w.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      const overviewMetrics = await w.evaluate(() => {
        const dashboard = document.querySelector<HTMLElement>('.overview-integrated-grid');
        const central = document.querySelector<HTMLElement>('.overview-central-workspace');
        const rail = document.querySelector<HTMLElement>('.overview-information-rail');
        const navigator = document.querySelector<HTMLElement>('.workspace-navigator');
        const chromeHeader = document.querySelector<HTMLElement>('.workspace-chrome-header');
        const tabs = document.querySelector<HTMLElement>('.workspace-tabs');
        const content = document.querySelector<HTMLElement>('.workspace-content');
        const centralRect = central?.getBoundingClientRect();
        const railRect = rail?.getBoundingClientRect();
        return {
          dashboardDisplay: dashboard ? getComputedStyle(dashboard).display : null,
          railIsRight: centralRect && railRect ? railRect.left >= centralRect.right - 1 : false,
          railIsBelow: centralRect && railRect ? railRect.top >= centralRect.bottom - 1 : false,
          navigatorWidth: navigator?.getBoundingClientRect().width ?? 0,
          chromeHeight: chromeHeader?.getBoundingClientRect().height ?? 0,
          tabsHeight: tabs?.getBoundingClientRect().height ?? 0,
          contentBackground: content ? getComputedStyle(content).backgroundColor : null,
        };
      });
      expect(overviewMetrics.dashboardDisplay).toBe('grid');
      if (viewport.width >= 1440) expect(overviewMetrics.railIsRight).toBe(true);
      else expect(overviewMetrics.railIsBelow).toBe(true);
      expect(overviewMetrics.navigatorWidth).toBeGreaterThanOrEqual(220);
      expect(overviewMetrics.navigatorWidth).toBeLessThanOrEqual(240);
      expect(overviewMetrics.chromeHeight).toBe(54);
      expect(overviewMetrics.tabsHeight).toBe(42);
      expect(overviewMetrics.contentBackground).toBe('rgb(243, 241, 235)');
      await w.screenshot({
        path: path.join(
          shots,
          `overview-workbench-${String(viewport.width)}x${String(viewport.height)}.png`,
        ),
      });
    }
    await w.setViewportSize({ width: 1280, height: 800 });
    await w.getByRole('tab', { name: 'Overview' }).focus();
    await w.keyboard.press('Tab');
    await expect(w.getByRole('tab', { name: 'Papers' })).toBeFocused();
    await w.getByRole('button', { name: 'Delete' }).click();
    const dialog = w.getByRole('alertdialog', { name: 'Delete Workspace?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await w.screenshot({
      path: path.join(shots, 'overview-workbench-confirmation-1280x800.png'),
    });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  } finally {
    await app.close();
  }
  expect(await readFile(sourcePath, 'utf8')).toContain('clippedObjective');
  expect(existsSync('C:\\v1-readiness-fixture')).toBe(false);
});
