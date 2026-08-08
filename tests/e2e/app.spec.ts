import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

import { writePdfFixture } from '../helpers/pdf-fixture';

function electronEnvironment(libraryRoot: string): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      environment[key] = value;
    }
  }
  environment.NODE_ENV = 'test';
  environment.PAPERMIND_LIBRARY_ROOT = libraryRoot;
  environment.PAPERMIND_USER_DATA_ROOT = path.join(libraryRoot, '.electron-user-data');
  delete environment.ELECTRON_RUN_AS_NODE;
  return environment;
}

async function launch(libraryRoot: string): Promise<ElectronApplication> {
  return electron.launch({ args: ['.'], env: electronEnvironment(libraryRoot) });
}

async function selectFilesInDialog(
  electronApp: ElectronApplication,
  filePaths: readonly string[],
): Promise<void> {
  await electronApp.evaluate(({ dialog }, selectedPaths) => {
    const mutableDialog = dialog as unknown as {
      showOpenDialog: () => Promise<{ canceled: boolean; filePaths: readonly string[] }>;
    };
    mutableDialog.showOpenDialog = () =>
      Promise.resolve({ canceled: false, filePaths: selectedPaths });
  }, filePaths);
}

async function hashFile(filePath: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

async function selectTextSpan(
  window: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  pageNumber: number,
) {
  const span = window.locator(`[data-page-number="${String(pageNumber)}"] .textLayer span`).first();
  await expect(span).toBeVisible();
  await span.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = globalThis.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element
      .closest('[data-page-number]')
      ?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
}

async function setSaveDialogPaths(
  electronApp: ElectronApplication,
  filePaths: readonly string[],
): Promise<void> {
  await electronApp.evaluate(({ dialog }, destinations) => {
    let index = 0;
    const mutableDialog = dialog as unknown as {
      showSaveDialog: () => Promise<{ canceled: boolean; filePath: string }>;
    };
    mutableDialog.showSaveDialog = () =>
      Promise.resolve({
        canceled: false,
        filePath: destinations[index++] ?? destinations[0] ?? '',
      });
  }, filePaths);
}

test('reads a short PDF and persists annotations, progress, deletion, and exports', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const fixtureRoot = testInfo.outputPath('phase-3-short-fixtures');
  const libraryRoot = testInfo.outputPath('PaperMind Library');
  await mkdir(fixtureRoot, { recursive: true });
  const firstPdf = await writePdfFixture(fixtureRoot, 'alpha-study.pdf', [
    'Alpha introduction page one',
    'Alpha evidence page two',
    'Alpha result page three',
  ]);
  const secondPdf = await writePdfFixture(fixtureRoot, 'beta-study.pdf', 'Beta study');
  const originalHashes = await Promise.all([firstPdf, secondPdf].map(hashFile));

  let electronApp = await launch(libraryRoot);
  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await expect(window.getByText('PaperMind', { exact: true })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'PDF reader' })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Annotations' })).toBeVisible();

    const securityState = await window.evaluate(() => {
      const isolatedWindow = window as unknown as {
        readonly paperMind?: { readonly library?: { readonly listPapers?: unknown } };
        readonly process?: unknown;
        readonly require?: unknown;
      };
      return {
        hasNodeRequire: typeof isolatedWindow.require !== 'undefined',
        hasNodeProcess: typeof isolatedWindow.process !== 'undefined',
        hasLibraryApi: typeof isolatedWindow.paperMind?.library?.listPapers === 'function',
      };
    });
    expect(securityState).toEqual({
      hasNodeRequire: false,
      hasNodeProcess: false,
      hasLibraryApi: true,
    });

    await selectFilesInDialog(electronApp, [firstPdf, secondPdf]);
    await window.getByRole('button', { name: 'Import' }).click();
    await expect(window.getByText('2 papers')).toBeVisible();
    await expect(window.getByRole('button', { name: 'alpha-study alpha-study.pdf' })).toBeVisible();
    await expect(window.getByRole('button', { name: 'beta-study beta-study.pdf' })).toBeVisible();
    await expect(window.locator('[data-page-number="1"]')).toBeVisible();

    await window.getByRole('button', { name: 'Search PDF' }).click();
    await window.getByRole('searchbox', { name: 'Search PDF' }).fill('result page three');
    await expect(window.getByText('Page 3', { exact: true })).toBeVisible();
    await window.getByText('Page 3', { exact: true }).click();
    await expect(window.getByLabel('Current page')).toHaveValue('3');

    await selectTextSpan(window, 3);
    await window.getByLabel('Annotation comment').fill('Main result to revisit.');
    await window.getByRole('button', { name: 'Highlight', exact: true }).click();
    await expect(window.getByText('1 saved')).toBeVisible();

    await window.getByLabel('Current page').fill('1');
    await window.getByLabel('Current page').press('Enter');
    await selectTextSpan(window, 1);
    await window.getByLabel('Annotation comment').fill('Opening context.');
    await window.getByRole('button', { name: 'Underline', exact: true }).click();
    await expect(window.getByText('2 saved')).toBeVisible();
    await window.getByRole('button', { name: 'Zoom in' }).click();
    await expect(window.getByText('110%', { exact: true })).toBeVisible();
    await window.waitForTimeout(750);

    await selectFilesInDialog(electronApp, [firstPdf]);
    await window.getByRole('button', { name: 'Import' }).click();
    await expect(window.getByText('1 already in library')).toBeVisible();
    await expect(window.getByText('2 papers')).toBeVisible();
    await window.screenshot({ path: testInfo.outputPath('papermind-reader-short.png') });
  } finally {
    await electronApp.close();
  }

  expect(await Promise.all([firstPdf, secondPdf].map(hashFile))).toEqual(originalHashes);
  const managedFiles = (
    await readdir(path.join(libraryRoot, 'papers'), { recursive: true })
  ).filter((entry) => entry.endsWith('.pdf'));
  expect(managedFiles).toHaveLength(2);

  electronApp = await launch(libraryRoot);
  try {
    const restartedWindow = await electronApp.firstWindow();
    await restartedWindow.waitForLoadState('domcontentloaded');
    await expect(restartedWindow.getByText('2 papers')).toBeVisible();
    await restartedWindow.getByRole('button', { name: 'alpha-study alpha-study.pdf' }).click();
    await expect(restartedWindow.getByText('2 saved')).toBeVisible();
    await expect(restartedWindow.getByText('Main result to revisit.')).toBeVisible();
    await expect(restartedWindow.getByText('Opening context.')).toBeVisible();
    await expect(restartedWindow.getByText('110%', { exact: true })).toBeVisible();

    await restartedWindow.getByRole('button', { name: /Page 3.*Alpha result page three/ }).click();
    await expect(restartedWindow.getByLabel('Current page')).toHaveValue('3');
    await restartedWindow.getByRole('button', { name: 'Delete annotation' }).first().click();
    await restartedWindow.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(restartedWindow.getByText('1 saved')).toBeVisible();

    const markdownPath = testInfo.outputPath('annotations.md');
    const jsonPath = testInfo.outputPath('annotations.json');
    await setSaveDialogPaths(electronApp, [markdownPath, jsonPath]);
    await restartedWindow.getByRole('button', { name: 'Export Markdown' }).click();
    await restartedWindow.getByRole('button', { name: 'JSON', exact: true }).click();
    expect(await readFile(markdownPath, 'utf8')).toContain('PaperMind annotation export');
    const json = JSON.parse(await readFile(jsonPath, 'utf8')) as { annotations: unknown[] };
    expect(json.annotations).toHaveLength(1);
  } finally {
    await electronApp.close();
  }
});

test('searches an 80-page PDF while only mounting visible pages', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const fixtureRoot = testInfo.outputPath('phase-3-long-fixtures');
  const libraryRoot = testInfo.outputPath('PaperMind Long Library');
  const labels = Array.from({ length: 80 }, (_, index) =>
    index === 79
      ? 'Final virtualization needle page eighty'
      : `Long paper page ${String(index + 1)}`,
  );
  const source = await writePdfFixture(fixtureRoot, 'long-paper.pdf', labels);
  const originalHash = await hashFile(source);
  const electronApp = await launch(libraryRoot);
  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await selectFilesInDialog(electronApp, [source]);
    await window.getByRole('button', { name: 'Import' }).click();
    await expect(window.getByText('/ 80', { exact: true })).toBeVisible();
    await expect(window.locator('[data-page-number]')).not.toHaveCount(0);
    expect(await window.locator('[data-page-number]').count()).toBeLessThan(15);

    await window.getByRole('button', { name: 'Search PDF' }).click();
    await window.getByRole('searchbox', { name: 'Search PDF' }).fill('virtualization needle');
    await expect(window.getByText('Page 80', { exact: true })).toBeVisible();
    await window.getByText('Page 80', { exact: true }).click();
    await expect(window.getByLabel('Current page')).toHaveValue('80');
    expect(await window.locator('[data-page-number]').count()).toBeLessThan(15);
    await window.screenshot({ path: testInfo.outputPath('papermind-reader-long.png') });
  } finally {
    await electronApp.close();
  }
  expect(await hashFile(source)).toBe(originalHash);
});
