import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { _electron as electron, expect, test, type Page } from '@playwright/test';

import { LibraryDatabase } from '../../src/main/database/library-database';

function environment(root: string) {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) result[key] = value;
  }
  result.NODE_ENV = 'test';
  result.PAPERMIND_LIBRARY_ROOT = root;
  result.PAPERMIND_USER_DATA_ROOT = path.join(root, '.user');
  result.PAPERMIND_AI_PROVIDER = 'mock';
  delete result.ELECTRON_RUN_AS_NODE;
  return result;
}

async function expectLightTheme(page: Page) {
  const colors = await page.evaluate(() => {
    const workspaceRoot = document.querySelector<HTMLElement>('.workspace-root');
    const appShell = document.querySelector<HTMLElement>('.app-shell');
    const target = workspaceRoot ?? appShell;
    return {
      background: target ? getComputedStyle(target).backgroundColor : null,
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth,
      largeDarkSurfaces: [...document.querySelectorAll<HTMLElement>('body *')].filter((element) => {
        const bounds = element.getBoundingClientRect();
        const background = getComputedStyle(element).backgroundColor;
        return (
          bounds.width > 300 &&
          bounds.height > 150 &&
          ['rgb(11, 16, 23)', 'rgb(13, 19, 28)', 'rgb(17, 24, 33)'].includes(background)
        );
      }).length,
    };
  });
  expect(colors.background).toMatch(/rgb\((243, 241, 235|250, 249, 245)\)/u);
  expect(colors.horizontalOverflow).toBe(false);
  expect(colors.largeDarkSurfaces).toBe(0);
}

test('keeps every accessible page in the shared warm light theme', async ({
  browserName,
}, info) => {
  expect(browserName).toBe('chromium');
  const root = info.outputPath('Theme Migration');
  const screenshots = path.resolve('docs/screenshots/theme-unification');
  const repositoryRoot = info.outputPath('theme-source-folder');
  await mkdir(root, { recursive: true });
  await mkdir(screenshots, { recursive: true });
  await mkdir(path.join(repositoryRoot, 'src'), { recursive: true });
  await writeFile(
    path.join(repositoryRoot, 'src', 'evidence.ts'),
    'export const evidenceBoundary = "reviewed";\n',
    'utf8',
  );

  const database = new LibraryDatabase(path.join(root, 'library.sqlite3'));
  const workspace = await database.createWorkspace({
    name: 'Theme Review Workspace',
    description: 'Deterministic visual migration fixture',
    researchGoal: 'Trace evidence across papers, code, plans, and experiments',
  });
  await database.setLastActiveWorkspace(workspace.id);
  await database.createQuestion({
    workspaceId: workspace.id,
    title: 'Which evidence supports the implementation decision?',
    description: 'Review bounded sources without changing ownership.',
    priority: 'high',
  });
  await database.addWorkspaceZoteroPaper(workspace.id, {
    serverId: 'ThemeFixtureServer',
    library: { type: 'user', id: '1' },
    itemKey: 'THEME234',
  });
  const repository = await database.createOrUpdateRepository({
    canonicalRoot: repositoryRoot,
    canonicalKey: 'theme-migration-repository',
    displayName: 'evidence-source',
    kind: 'source_folder',
    gitRoot: null,
    currentBranch: null,
    headCommit: null,
    remotes: [],
    availability: 'available',
    lastErrorCode: null,
    observedAt: '2026-08-22T00:00:00.000Z',
  });
  await database.addWorkspaceRepository(workspace.id, repository.id);
  const plan = await database.createResearchPlan({
    workspaceId: workspace.id,
    goal: workspace.researchGoal,
  });
  await database.createPlanTask({
    workspaceId: workspace.id,
    planId: plan.id,
    title: 'Review the primary paper evidence',
    description: 'Capture the bounded claim and its limitations.',
  });
  await database.createResearchContent({
    workspaceId: workspace.id,
    type: 'note',
    title: 'Evidence review notes',
    bodyMarkdown: 'Compare the cited paper location with the authorized source snapshot.',
  });
  await database.createExperiment({
    workspaceId: workspace.id,
    questionId: null,
    title: 'Bounded evidence check',
    hypothesis: 'The pinned implementation matches the reviewed claim.',
    repositoryId: repository.id,
    codeSnapshotIdentity: null,
    configSummary: 'Read-only visual fixture',
  });
  await database.close();

  const app = await electron.launch({
    args: ['.', '--disable-gpu', '--disable-gpu-sandbox', '--no-sandbox'],
    env: environment(root),
  });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByRole('heading', { name: workspace.name })).toBeVisible();

    const workspaceTabs = [
      'Overview',
      'Papers',
      'Code',
      'Questions',
      'Links',
      'Knowledge',
      'Chat',
      'Notes',
      'Plan',
      'Agent',
      'Experiments',
      'Graph',
    ] as const;

    for (const tabName of workspaceTabs) {
      await page.getByRole('tab', { name: tabName, exact: true }).click();
      await expect(page.getByRole('tab', { name: tabName, exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      if (tabName === 'Code') {
        const sourceTree = page.getByRole('navigation', { name: 'evidence-source source tree' });
        await sourceTree.getByRole('button', { name: 'src' }).click();
        await sourceTree.getByRole('button', { name: 'evidence.ts' }).click();
        await expect(page.getByRole('heading', { name: 'src/evidence.ts' })).toBeVisible();
      }
      if (tabName === 'Notes') {
        await page.getByRole('button', { name: 'Open item list' }).click();
        await page.getByText('Evidence review notes', { exact: true }).click();
        await expect(page.getByLabel('Title')).toHaveValue('Evidence review notes');
        await expect(page.locator('.research-memory-list')).not.toHaveClass(
          /research-memory-drawer-open/u,
        );
        await page.waitForTimeout(220);
      }
      await expectLightTheme(page);
      await page.screenshot({
        path: path.join(screenshots, `${tabName.toLowerCase()}-1440x900.png`),
      });
    }

    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      await expectLightTheme(page);
      await page.screenshot({
        path: path.join(
          screenshots,
          `overview-${String(viewport.width)}x${String(viewport.height)}.png`,
        ),
      });
    }

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const confirmation = page.getByRole('alertdialog', { name: 'Delete Workspace?' });
    await expect(confirmation).toBeVisible();
    expect(
      await confirmation.evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe('rgb(250, 249, 245)');
    await page.screenshot({
      path: path.join(screenshots, 'workspace-delete-confirmation-1280x800.png'),
    });
    await confirmation.getByRole('button', { name: 'Cancel' }).click();

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: 'Zotero Library', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Zotero Integration' })).toBeVisible();
    await expectLightTheme(page);
    await page.screenshot({ path: path.join(screenshots, 'zotero-library-1440x900.png') });

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'AI providers' })).toBeVisible();
    await expectLightTheme(page);
    await page.screenshot({ path: path.join(screenshots, 'settings-1440x900.png') });

    await page.getByRole('button', { name: 'Legacy Library', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'All papers' })).toBeVisible();
    await expectLightTheme(page);
    await page.screenshot({ path: path.join(screenshots, 'legacy-library-1440x900.png') });
  } finally {
    await app.close();
  }
});
