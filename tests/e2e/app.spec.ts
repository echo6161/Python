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

test('imports two PDFs, detects duplicates, and persists the isolated library', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const fixtureRoot = testInfo.outputPath('phase-2-fixtures');
  const libraryRoot = testInfo.outputPath('PaperMind Library');
  await mkdir(fixtureRoot, { recursive: true });
  const firstPdf = await writePdfFixture(fixtureRoot, 'alpha-study.pdf', 'Alpha study');
  const secondPdf = await writePdfFixture(fixtureRoot, 'beta-study.pdf', 'Beta study');
  const originalHashes = await Promise.all([firstPdf, secondPdf].map(hashFile));

  let electronApp = await launch(libraryRoot);
  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await expect(window.getByText('PaperMind', { exact: true })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Paper details' })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Assistant' })).toBeVisible();

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
    await expect(window.getByText('alpha-study', { exact: true })).toBeVisible();
    await expect(window.getByText('beta-study', { exact: true })).toBeVisible();

    await selectFilesInDialog(electronApp, [firstPdf]);
    await window.getByRole('button', { name: 'Import' }).click();
    await expect(window.getByText('1 already in library')).toBeVisible();
    await expect(window.getByText('2 papers')).toBeVisible();
    await window.screenshot({ path: testInfo.outputPath('papermind-library.png') });
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
    await expect(restartedWindow.getByText('alpha-study', { exact: true })).toBeVisible();
    await expect(restartedWindow.getByText('beta-study', { exact: true })).toBeVisible();
  } finally {
    await electronApp.close();
  }
});
