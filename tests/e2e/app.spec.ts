import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import BetterSqlite3 from 'better-sqlite3';

import { writePdfFixture, writeStructuredPdfFixture } from '../helpers/pdf-fixture';

const execFileAsync = promisify(execFile);

function electronEnvironment(
  libraryRoot: string,
  extraEnvironment: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      environment[key] = value;
    }
  }
  environment.NODE_ENV = 'test';
  environment.PAPERMIND_LIBRARY_ROOT = libraryRoot;
  environment.PAPERMIND_USER_DATA_ROOT = path.join(libraryRoot, '.electron-user-data');
  environment.PAPERMIND_AI_PROVIDER = 'mock';
  environment.PAPERMIND_AI_MOCK_DELAY_MS = '50';
  Object.assign(environment, extraEnvironment);
  delete environment.ELECTRON_RUN_AS_NODE;
  return environment;
}

async function launch(
  libraryRoot: string,
  extraEnvironment: Readonly<Record<string, string>> = {},
): Promise<ElectronApplication> {
  // The managed test host cannot initialize Chromium's Windows process sandbox.
  return electron.launch({
    args: ['.', '--disable-gpu', '--disable-gpu-sandbox', '--no-sandbox'],
    env: electronEnvironment(libraryRoot, extraEnvironment),
  });
}

async function openLegacyLibrary(
  window: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
): Promise<void> {
  await window.getByRole('button', { name: 'Legacy Library' }).click();
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

async function selectDirectoryInDialog(
  electronApp: ElectronApplication,
  directoryPath: string,
): Promise<void> {
  await electronApp.evaluate(({ dialog }, selectedPath) => {
    const mutableDialog = dialog as unknown as {
      showOpenDialog: () => Promise<{ canceled: boolean; filePaths: readonly string[] }>;
    };
    mutableDialog.showOpenDialog = () =>
      Promise.resolve({ canceled: false, filePaths: [selectedPath] });
  }, directoryPath);
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

async function approveNativeAiRequests(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ dialog }) => {
    const mutableDialog = dialog as unknown as {
      showMessageBox: () => Promise<{ response: number; checkboxChecked: boolean }>;
    };
    mutableDialog.showMessageBox = () => Promise.resolve({ response: 1, checkboxChecked: false });
  });
}

async function stubChatGptOpen(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ shell }) => {
    const mutableShell = shell as unknown as {
      openExternal: (url: string) => Promise<void>;
    };
    mutableShell.openExternal = (url: string) => {
      const state = globalThis as typeof globalThis & { paperMindOpenedUrl?: string };
      state.paperMindOpenedUrl = url;
      return Promise.resolve();
    };
  });
}

async function stubVscodeOpen(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ shell }) => {
    const mutableShell = shell as unknown as {
      openExternal: (url: string) => Promise<void>;
    };
    mutableShell.openExternal = (url: string) => {
      const state = globalThis as typeof globalThis & { paperMindVscodeUrl?: string };
      state.paperMindVscodeUrl = url;
      return Promise.resolve();
    };
  });
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return result.stdout.trim();
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
    await openLegacyLibrary(window);

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
    await window.getByRole('button', { name: 'Reader' }).click();
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
    await openLegacyLibrary(restartedWindow);
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
    await openLegacyLibrary(window);
    await selectFilesInDialog(electronApp, [source]);
    await window.getByRole('button', { name: 'Import' }).click();
    await window.getByRole('button', { name: 'Reader' }).click();
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

test('confirms extracted metadata and persists library organization', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const fixtureRoot = testInfo.outputPath('phase-4-fixtures');
  const libraryRoot = testInfo.outputPath('PaperMind Metadata Library');
  await mkdir(fixtureRoot, { recursive: true });
  const metadataPdf = await writeStructuredPdfFixture(fixtureRoot, 'metadata-paper.pdf', {
    metadata: {
      title: 'Reliable Metadata Title',
      author: 'Ada Lovelace; Alan Turing',
    },
    pages: [
      [
        { text: 'Visible Research Heading', fontSize: 24, y: 740 },
        { text: 'Abstract', fontSize: 12, y: 680 },
        {
          text: 'This visible abstract is extracted locally from the first page.',
          fontSize: 10,
          y: 655,
        },
        { text: 'DOI: 10.4242/PAPERMIND.2026', fontSize: 10, y: 620 },
        { text: 'Introduction', fontSize: 12, y: 590 },
      ],
      [{ text: 'Organization fulltext needle', fontSize: 12, y: 700 }],
    ],
  });
  const plainPdf = await writePdfFixture(
    fixtureRoot,
    'no-standard-metadata.pdf',
    'Plain unstructured content',
  );
  const originalHashes = await Promise.all([metadataPdf, plainPdf].map(hashFile));

  let electronApp = await launch(libraryRoot);
  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await openLegacyLibrary(window);
    await selectFilesInDialog(electronApp, [metadataPdf, plainPdf]);
    await window.getByRole('button', { name: 'Import' }).click();

    await expect(window.getByText('Metadata review required.')).toBeVisible();
    await expect(window.getByLabel(/^Title/)).toHaveValue('Reliable Metadata Title');
    await expect(window.getByLabel(/^Authors/)).toHaveValue('Ada Lovelace; Alan Turing');
    await expect(window.getByLabel(/^DOI/)).toHaveValue('10.4242/papermind.2026');
    await expect(
      window
        .getByLabel(/^Title/)
        .locator('..')
        .getByText('PDF metadata: medium'),
    ).toBeVisible();
    await expect(
      window.getByLabel(/^DOI/).locator('..').getByText('First page: medium'),
    ).toBeVisible();

    await window.getByLabel(/^Title/).fill('Manually Corrected Paper');
    await window.getByLabel(/^Authors/).fill('Grace Hopper; Barbara Liskov');
    await window.getByLabel(/^Year/).fill('2025');
    await window.getByLabel(/^DOI/).fill('10.5555/MANUAL.42');

    await window.getByLabel('New tag name').fill('Methods');
    await window.getByRole('button', { name: 'Create tag' }).click();
    await expect(window.getByRole('checkbox', { name: 'Methods', exact: true })).toBeChecked();

    await window.getByLabel('New collection name').fill('Dissertation');
    await window.getByRole('button', { name: 'Create collection' }).click();
    await expect(window.getByRole('checkbox', { name: 'Dissertation', exact: true })).toBeChecked();
    await window.getByLabel('Reading status').selectOption('reading');
    await window.getByRole('button', { name: 'Add to favorites' }).click();
    await window.getByRole('button', { name: 'Confirm metadata' }).click();

    await expect(window.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    await expect(window.getByText('Metadata review required.')).not.toBeVisible();
    await expect(window.getByText('Manual: confirmed').first()).toBeVisible();

    await window.getByLabel('New tag name').fill('Temporary tag');
    await window.getByRole('button', { name: 'Create tag' }).click();
    await expect(
      window.getByRole('checkbox', { name: 'Temporary tag', exact: true }),
    ).toBeChecked();
    await window.getByLabel('New collection name').fill('Temporary collection');
    await window.getByRole('button', { name: 'Create collection' }).click();
    await expect(
      window.getByRole('checkbox', { name: 'Temporary collection', exact: true }),
    ).toBeChecked();
    await window.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(window.getByText('Paper metadata confirmed and saved.')).toBeVisible();
    await window.getByRole('button', { name: 'Dismiss notification' }).click();

    const tagDialogPromise = window.waitForEvent('dialog');
    const deleteTagPromise = window
      .getByRole('button', { name: 'Delete tag Temporary tag' })
      .click();
    const tagDialog = await tagDialogPromise;
    expect(tagDialog.message()).toBe('Delete tag "Temporary tag" from every paper?');
    await tagDialog.accept();
    await deleteTagPromise;
    await expect(
      window.getByRole('button', { name: 'Delete tag Temporary tag' }),
    ).not.toBeVisible();
    await window.getByRole('button', { name: 'Dismiss notification' }).click();

    const collectionDialogPromise = window.waitForEvent('dialog');
    const deleteCollectionPromise = window
      .getByRole('button', { name: 'Delete collection Temporary collection' })
      .click();
    const collectionDialog = await collectionDialogPromise;
    expect(collectionDialog.message()).toBe(
      'Delete collection "Temporary collection" from every paper?',
    );
    await collectionDialog.accept();
    await deleteCollectionPromise;
    await expect(
      window.getByRole('button', { name: 'Delete collection Temporary collection' }),
    ).not.toBeVisible();
    await window.getByRole('button', { name: 'Dismiss notification' }).click();

    await window.getByRole('button', { name: /no-standard-metadata/ }).click();
    await expect(window.getByLabel(/^Title/)).toHaveValue('no-standard-metadata');
    await expect(window.getByLabel(/^Authors/)).toHaveValue('');
    await expect(window.getByLabel(/^DOI/)).toHaveValue('');
    await expect(window.getByLabel(/^Abstract/)).toHaveValue('');
    await expect(window.getByText('Metadata review required.')).toBeVisible();
    await expect(
      window
        .getByLabel(/^Title/)
        .locator('..')
        .getByText('Filename fallback: unconfirmed'),
    ).toBeVisible();
    await expect(
      window.getByLabel(/^DOI/).locator('..').getByText('Not found: unconfirmed'),
    ).toBeVisible();

    await window.getByLabel('Select no-standard-metadata').check();
    const batchBar = window.getByRole('toolbar', { name: 'Batch actions' });
    await batchBar.getByText('Tags', { exact: true }).click();
    await batchBar.getByLabel('Methods').check();
    await batchBar.getByLabel('Set reading status').selectOption('completed');
    await batchBar.getByRole('button', { name: 'Apply' }).click();
    await expect(window.getByText('1 papers updated.')).toBeVisible();

    await window.getByRole('button', { name: /^Filters/ }).click();
    const filterPanel = window.getByRole('region', { name: 'Library filters' });
    await filterPanel.getByLabel('Methods').check();
    await filterPanel.getByLabel('Completed').check();
    await expect(window.getByRole('button', { name: /no-standard-metadata/ })).toBeVisible();
    await expect(
      window.getByRole('button', { name: /Manually Corrected Paper/ }),
    ).not.toBeVisible();
    await filterPanel.getByRole('button', { name: 'Clear filters' }).click();
    await expect(window.getByRole('button', { name: /Manually Corrected Paper/ })).toBeVisible();

    await filterPanel.getByLabel('Title', { exact: true }).fill('Manually Corrected');
    await expect(window.getByRole('button', { name: /Manually Corrected Paper/ })).toBeVisible();
    await expect(window.getByRole('button', { name: /no-standard-metadata/ })).not.toBeVisible();
    await filterPanel.getByLabel('Title', { exact: true }).fill('');

    await filterPanel.getByLabel('Author', { exact: true }).fill('Grace Hopper');
    await expect(window.getByRole('button', { name: /Manually Corrected Paper/ })).toBeVisible();
    await filterPanel.getByLabel('Author', { exact: true }).fill('');

    await filterPanel.getByLabel('Year', { exact: true }).fill('2025');
    await expect(window.getByRole('button', { name: /Manually Corrected Paper/ })).toBeVisible();
    await filterPanel.getByLabel('Year', { exact: true }).fill('');

    await filterPanel.getByLabel('Full text', { exact: true }).fill('Organization fulltext');
    await expect(window.getByRole('button', { name: /Manually Corrected Paper/ })).toBeVisible();
    await expect(window.getByRole('button', { name: /no-standard-metadata/ })).not.toBeVisible();
    await filterPanel.getByLabel('Full text', { exact: true }).fill('');

    await filterPanel.getByLabel('Sort by', { exact: true }).selectOption('title');
    await filterPanel.getByLabel('Sort direction', { exact: true }).selectOption('asc');
    await expect
      .poll(async () => window.locator('ul[aria-label="Papers"] > li > button').allTextContents())
      .toEqual([
        expect.stringContaining('Manually Corrected Paper'),
        expect.stringContaining('no-standard-metadata'),
      ]);

    await window.getByRole('button', { name: /Manually Corrected Paper/ }).click();
    const detailsPanel = window.locator('section[aria-labelledby="details-heading"]');
    await detailsPanel.getByLabel(/^Title/).fill('Unsaved temporary title');
    const dialogPromise = window.waitForEvent('dialog');
    const selectionPromise = window.getByRole('button', { name: /no-standard-metadata/ }).click();
    const discardDialog = await dialogPromise;
    expect(discardDialog.message()).toBe('Discard unsaved paper detail changes?');
    await discardDialog.dismiss();
    await selectionPromise;
    await expect(detailsPanel.getByLabel(/^Title/)).toHaveValue('Unsaved temporary title');
    await detailsPanel.getByLabel(/^Title/).fill('Manually Corrected Paper');
    await window.screenshot({ path: testInfo.outputPath('papermind-metadata-organization.png') });
  } finally {
    await electronApp.close();
  }

  electronApp = await launch(libraryRoot);
  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await openLegacyLibrary(window);
    await window.getByRole('button', { name: /Manually Corrected Paper/ }).click();
    await window.getByRole('button', { name: 'Details' }).click();
    await expect(window.getByLabel(/^Title/)).toHaveValue('Manually Corrected Paper');
    await expect(window.getByLabel(/^Authors/)).toHaveValue('Grace Hopper; Barbara Liskov');
    await expect(window.getByLabel(/^DOI/)).toHaveValue('10.5555/manual.42');
    await expect(window.getByLabel('Reading status')).toHaveValue('reading');
    await expect(window.getByRole('button', { name: 'Remove from favorites' })).toBeVisible();
    await expect(window.getByRole('checkbox', { name: 'Methods', exact: true })).toBeChecked();
    await expect(window.getByRole('checkbox', { name: 'Dissertation', exact: true })).toBeChecked();
  } finally {
    await electronApp.close();
  }

  expect(await Promise.all([metadataPdf, plainPdf].map(hashFile))).toEqual(originalHashes);
});

test('streams, cancels, and persists selected-text AI tasks with the Mock Provider', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const fixtureRoot = testInfo.outputPath('phase-5-fixtures');
  const libraryRoot = testInfo.outputPath('PaperMind AI Library');
  const source = await writePdfFixture(
    fixtureRoot,
    'selected-text-ai.pdf',
    'Phase five selected excerpt for translation',
  );
  const originalHash = await hashFile(source);

  let electronApp = await launch(libraryRoot);
  try {
    await approveNativeAiRequests(electronApp);
    await stubChatGptOpen(electronApp);
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await openLegacyLibrary(window);
    await selectFilesInDialog(electronApp, [source]);
    await window.getByRole('button', { name: 'Import' }).click();
    await window.getByRole('button', { name: 'Reader' }).click();
    await selectTextSpan(window, 1);
    await window.getByRole('button', { name: 'AI actions' }).click();
    await window.getByRole('menuitem', { name: 'Translate to Chinese' }).click();

    const outgoing = await window.getByTestId('outgoing-selection').textContent();
    expect(outgoing).toContain('Phase five selected excerpt for translation');
    await window.screenshot({ path: testInfo.outputPath('papermind-chatgpt-handoff.png') });
    await window.getByRole('button', { name: 'Copy prompt and open ChatGPT' }).click();
    await expect(window.getByText(/Prompt copied\. Paste it into ChatGPT/)).toBeVisible();
    const bridgeState = await electronApp.evaluate(({ clipboard }) => ({
      prompt: clipboard.readText(),
      openedUrl: (globalThis as typeof globalThis & { paperMindOpenedUrl?: string })
        .paperMindOpenedUrl,
    }));
    expect(bridgeState.openedUrl).toBe('https://chatgpt.com/');
    expect(bridgeState.prompt).toContain('Phase five selected excerpt for translation');
    expect(bridgeState.prompt).toContain('## 中文译文');
    expect(bridgeState.prompt).not.toContain('selected-text-ai.pdf');

    await window.getByRole('button', { name: 'AI actions' }).click();
    await window.getByRole('menuitem', { name: 'Translate to Chinese' }).click();
    await window.getByRole('button', { name: 'Send to api.openai.com' }).click();
    await expect(window.getByText('AI is responding...')).toBeVisible();
    await expect(
      window.getByText(/Selection: Phase five selected excerpt for translation/),
    ).toBeVisible();
    await expect(window.getByText('AI-generated')).toBeVisible();
    await window.screenshot({ path: testInfo.outputPath('papermind-ai-selected-text.png') });
  } finally {
    await electronApp.close();
  }

  electronApp = await launch(libraryRoot);
  try {
    await approveNativeAiRequests(electronApp);
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await openLegacyLibrary(window);
    await window.getByRole('tab', { name: 'AI Assistant' }).click();
    await expect(
      window.getByText(/Selection: Phase five selected excerpt for translation/),
    ).toBeVisible();

    await window.getByRole('button', { name: 'Reader' }).click();
    await selectTextSpan(window, 1);
    await window.getByRole('button', { name: 'AI actions' }).click();
    await window.getByRole('menuitem', { name: 'Explain selection' }).click();
    await window.getByRole('button', { name: 'Send to api.openai.com' }).click();
    await expect(window.getByText('AI is responding...')).toBeVisible();
    await window.getByRole('button', { name: 'Cancel' }).click();
    await expect(window.getByText('cancelled', { exact: true })).toBeVisible();
  } finally {
    await electronApp.close();
  }

  expect(await hashFile(source)).toBe(originalHash);
});

test('creates, switches, restores, archives, and deletes Workspaces', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const libraryRoot = testInfo.outputPath('PaperMind Workspace Library');
  let electronApp = await launch(libraryRoot);
  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(
      window.getByRole('heading', { name: 'Create a research Workspace' }),
    ).toBeVisible();

    await window.getByRole('button', { name: 'Create Workspace', exact: true }).first().click();
    let dialog = window.getByRole('dialog', { name: 'Create Workspace' });
    await expect(dialog.getByLabel('Name')).toBeFocused();
    await dialog.getByLabel('Name').fill('Evidence Workspace');
    await dialog.getByLabel('Research Goal').fill('Compare evidence synthesis methods');
    await dialog.getByRole('button', { name: 'Create Workspace' }).click();
    await expect(window.getByRole('heading', { name: 'Evidence Workspace' })).toBeVisible();

    await window.getByRole('button', { name: 'New Workspace', exact: true }).click();
    dialog = window.getByRole('dialog', { name: 'Create Workspace' });
    await dialog.getByLabel('Name').fill('Replication Workspace');
    await dialog.getByLabel('Research Goal').fill('Replicate the selected benchmark');
    await dialog.getByRole('button', { name: 'Create Workspace' }).click();
    await expect(window.getByRole('heading', { name: 'Replication Workspace' })).toBeVisible();

    const workspaceNavigation = window.getByRole('navigation', { name: 'Workspaces' });
    await workspaceNavigation.getByRole('button', { name: /Evidence Workspace/ }).click();
    await window.getByRole('button', { name: 'Edit' }).click();
    await window
      .getByLabel('Research Goal')
      .fill('Compare reproducible evidence synthesis methods');
    await window.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      window.getByText('Compare reproducible evidence synthesis methods').first(),
    ).toBeVisible();
    await expect(
      window.getByText('Define the research goal, then add relevant papers from Zotero.'),
    ).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Research Questions' })).toBeVisible();
    await window.getByRole('tab', { name: 'Questions' }).click();
    await window.getByRole('button', { name: 'New Question' }).click();
    const questionForm = window.locator('form').filter({ hasText: 'Question title' });
    await questionForm.getByLabel('Question title').fill('Does the evidence support the claim?');
    await questionForm
      .getByLabel('Description')
      .fill('Trace the claim to paper and code Evidence.');
    await questionForm.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(window.getByLabel('Question', { exact: true })).toHaveValue(
      'Does the evidence support the claim?',
    );
    await window.getByRole('tab', { name: 'Overview' }).click();
    await expect(window.getByText('Does the evidence support the claim?')).toBeVisible();
    await window.screenshot({ path: testInfo.outputPath('papermind-workspace-overview.png') });
    await window.setViewportSize({ width: 1100, height: 680 });
    expect(
      await window.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth),
    ).toBe(true);
    await window.screenshot({ path: testInfo.outputPath('papermind-workspace-minimum.png') });
  } finally {
    await electronApp.close();
  }

  electronApp = await launch(libraryRoot);
  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.getByRole('heading', { name: 'Evidence Workspace' })).toBeVisible();
    await expect(
      window.getByText('Compare reproducible evidence synthesis methods').first(),
    ).toBeVisible();
    await window.getByRole('tab', { name: 'Questions' }).click();
    await expect(window.getByLabel('Question', { exact: true })).toHaveValue(
      'Does the evidence support the claim?',
    );
    await window.getByLabel('Status').selectOption('closed');
    await expect(
      window.getByRole('navigation', { name: 'Research Questions' }).getByText(/closed/u),
    ).toBeVisible();

    await window.getByRole('button', { name: 'Archive', exact: true }).first().click();
    let confirmation = window.getByRole('alertdialog', { name: 'Archive Workspace?' });
    await expect(confirmation.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expect(confirmation).toContainText('Zotero links will be preserved');
    await confirmation.getByRole('button', { name: 'Archive Workspace' }).click();
    await expect(
      window
        .getByRole('heading', { name: 'Evidence Workspace' })
        .locator('..')
        .getByText('archived'),
    ).toBeVisible();

    await window.getByRole('button', { name: 'Delete', exact: true }).click();
    confirmation = window.getByRole('alertdialog', { name: 'Delete Workspace?' });
    await expect(confirmation).toContainText(
      'Zotero items, PDFs, annotations, and legacy library data will not be deleted',
    );
    await confirmation.getByRole('button', { name: 'Delete Workspace' }).click();
    await expect(window.getByRole('heading', { name: 'Replication Workspace' })).toBeVisible();
    await expect(
      window.getByRole('navigation', { name: 'Workspaces' }).getByText('Evidence Workspace'),
    ).not.toBeVisible();
  } finally {
    await electronApp.close();
  }
});

test('indexes, searches, refreshes, restores, and removes a read-only repository', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const libraryRoot = testInfo.outputPath('PaperMind Repository Library');
  const repositoryRoot = testInfo.outputPath('phase-9-repository-fixture');
  const sourcePath = path.join(repositoryRoot, 'src', 'index.ts');
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(
    sourcePath,
    'export function phaseTenSearch(): string {\n  return "semantic boundary";\n}\n',
    'utf8',
  );
  await writeFile(
    path.join(repositoryRoot, 'src', 'analysis.py'),
    'class EvidenceAnalyzer:\n    def analyze(self):\n        return "citation evidence"\n',
    'utf8',
  );
  await writeFile(
    path.join(repositoryRoot, 'src', 'helper.js'),
    'export const helper = () => "bounded snippet";\n',
    'utf8',
  );
  await writeFile(path.join(repositoryRoot, '.gitignore'), 'ignored.txt\n', 'utf8');
  await writeFile(path.join(repositoryRoot, 'ignored.txt'), 'not visible\n', 'utf8');
  await git(repositoryRoot, ['init', '-b', 'main']);
  await git(repositoryRoot, ['config', 'user.name', 'PaperMind E2E']);
  await git(repositoryRoot, ['config', 'user.email', 'papermind-e2e@example.invalid']);
  await git(repositoryRoot, ['add', '.']);
  await git(repositoryRoot, ['commit', '-m', 'fixture: initial']);
  const initialHead = await git(repositoryRoot, ['rev-parse', 'HEAD']);
  expect(await git(repositoryRoot, ['status', '--porcelain'])).toBe('');

  let electronApp = await launch(libraryRoot);
  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.getByRole('button', { name: 'Create Workspace', exact: true }).first().click();
    const dialog = window.getByRole('dialog', { name: 'Create Workspace' });
    await dialog.getByLabel('Name').fill('Repository Workspace');
    await dialog.getByRole('button', { name: 'Create Workspace' }).click();

    await window.getByRole('tab', { name: 'Code' }).click();
    await selectDirectoryInDialog(electronApp, repositoryRoot);
    await window.getByRole('button', { name: 'Add repository' }).click();
    await expect(
      window.getByText('Repository linked. Local files were not copied or modified.'),
    ).toBeVisible();
    await expect(window.getByText(`main | ${initialHead.slice(0, 10)}`)).toBeVisible();
    await expect(window.getByText('Available', { exact: true })).toBeVisible();
    await expect(window.getByRole('button', { name: 'ignored.txt' })).not.toBeVisible();

    await expect(window.getByText('Not indexed')).toBeVisible();
    await window.getByRole('button', { name: 'Build index' }).click();
    await expect(window.getByText(/Ready \| 3 files \|/)).toBeVisible();
    await window.getByLabel('Search indexed code').fill('phaseTenSearch');
    await window.getByRole('button', { name: 'Search' }).click();
    const symbolResult = window.getByRole('button', { name: /^function phaseTenSearch/u }).first();
    await expect(symbolResult).toBeVisible();
    await symbolResult.click();
    await expect(window.getByRole('heading', { name: 'src/index.ts' })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Open line 1 in VS Code' })).toHaveClass(
      /ring-emerald-500/u,
    );

    await expect(window.getByRole('heading', { name: 'src/index.ts' })).toBeVisible();
    await expect(window.getByText('export', { exact: true })).toBeVisible();
    await stubVscodeOpen(electronApp);
    await window.getByRole('button', { name: 'Open line 1 in VS Code' }).click();
    const openedUrl = await electronApp.evaluate(() => {
      const state = globalThis as typeof globalThis & { paperMindVscodeUrl?: string };
      return state.paperMindVscodeUrl ?? null;
    });
    expect(openedUrl).toMatch(/^vscode:\/\/file.*src\/index\.ts:1:1$/u);
    await window.screenshot({ path: testInfo.outputPath('papermind-repository-browser.png') });
  } finally {
    await electronApp.close();
  }

  expect(await git(repositoryRoot, ['status', '--porcelain'])).toBe('');
  await writeFile(
    sourcePath,
    'export function phaseTenSearch(): string {\n  return "updated semantic boundary";\n}\nexport const refreshed = true;\n',
    'utf8',
  );
  await git(repositoryRoot, ['add', 'src/index.ts']);
  await git(repositoryRoot, ['commit', '-m', 'fixture: advance head']);
  const refreshedHead = await git(repositoryRoot, ['rev-parse', 'HEAD']);

  electronApp = await launch(libraryRoot);
  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.getByRole('heading', { name: 'Repository Workspace' })).toBeVisible();
    await window.getByRole('tab', { name: 'Code' }).click();
    await expect(window.getByText(`main | ${initialHead.slice(0, 10)}`)).toBeVisible();
    await expect(window.getByText(/Stale \| 3 files \|/)).toBeVisible();
    await window.getByRole('button', { name: 'Update index' }).click();
    await expect(window.getByText(/Ready \| 3 files \|/)).toBeVisible();
    await window.getByLabel('Search indexed code').fill('updated semantic boundary');
    await window.getByRole('button', { name: 'Text' }).click();
    await window.getByRole('button', { name: 'Search' }).click();
    await expect(
      window.getByRole('button', { name: /updated semantic boundary/u }).first(),
    ).toBeVisible();
    await window.getByRole('button', { name: 'Refresh phase-9-repository-fixture' }).click();
    await expect(window.getByText(`main | ${refreshedHead.slice(0, 10)}`)).toBeVisible();

    window.once('dialog', (confirmation) => void confirmation.accept());
    await window
      .getByRole('button', { name: 'Remove phase-9-repository-fixture from Workspace' })
      .click();
    await expect(window.getByText('No repositories in this Workspace.')).toBeVisible();
  } finally {
    await electronApp.close();
  }

  expect(await git(repositoryRoot, ['status', '--porcelain'])).toBe('');
  expect(await readFile(sourcePath, 'utf8')).toContain('export const refreshed = true;');
});

test('renders dense responsive Workspace Knowledge results and provenance', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const libraryRoot = testInfo.outputPath('PaperMind Knowledge Library');
  let electronApp = await launch(libraryRoot);
  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.getByRole('button', { name: 'Create Workspace', exact: true }).first().click();
    const dialog = window.getByRole('dialog', { name: 'Create Workspace' });
    await dialog.getByLabel('Name').fill('Knowledge Workspace');
    await dialog.getByLabel('Research goal').fill('Audit clipping evidence across sources');
    await dialog.getByRole('button', { name: 'Create Workspace' }).click();
    await window.getByRole('tab', { name: 'Knowledge' }).click();
    await window.setViewportSize({ width: 1280, height: 800 });
    await expect(window.getByText('0 sources / 0 chunks / keyword only')).toBeVisible();
    await window.screenshot({
      path: testInfo.outputPath('knowledge-empty-provider-unavailable-1280x800.png'),
    });
  } finally {
    await electronApp.close();
  }

  seedKnowledgeFixture(path.join(libraryRoot, 'library.sqlite3'));
  electronApp = await launch(libraryRoot);
  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.getByRole('tab', { name: 'Knowledge' }).click();
    await window.getByLabel('Search Workspace Knowledge').fill('clipping');
    await window.getByRole('button', { name: 'Search' }).click();
    await expect(window.getByText('4 matches / keyword')).toBeVisible();
    await window.getByText('PPO clipping objective').click();
    await expect(window.getByRole('complementary', { name: 'Source provenance' })).toContainText(
      'PPO paper, p. 3',
    );

    for (const viewport of [
      { width: 1536, height: 1024 },
      { width: 1280, height: 800 },
      { width: 1024, height: 768 },
    ]) {
      await window.setViewportSize(viewport);
      await expect(window.getByLabel('Search Workspace Knowledge')).toBeVisible();
      await expect(
        window.getByRole('button', { name: /Paper PPO clipping objective/u }),
      ).toBeVisible();
      await expect(window.getByRole('complementary', { name: 'Source provenance' })).toBeVisible();
      const overflow = await window.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        compact: globalThis.matchMedia('(max-width: 1279px)').matches,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
      expect(overflow.compact).toBe(viewport.width < 1280);
      await window.screenshot({
        path: testInfo.outputPath(
          `knowledge-mixed-${String(viewport.width)}x${String(viewport.height)}.png`,
        ),
      });
    }
  } finally {
    await electronApp.close();
  }
});

test('renders responsive Research Chat with bounded paper and code citations', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const libraryRoot = testInfo.outputPath('PaperMind Research Chat Library');
  let electronApp = await launch(libraryRoot);
  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.getByRole('button', { name: 'Create Workspace', exact: true }).first().click();
    const dialog = window.getByRole('dialog', { name: 'Create Workspace' });
    await dialog.getByLabel('Name').fill('Research Chat Workspace');
    await dialog.getByLabel('Research goal').fill('Audit clipping evidence across paper and code');
    await dialog.getByRole('button', { name: 'Create Workspace' }).click();
  } finally {
    await electronApp.close();
  }

  seedKnowledgeFixture(path.join(libraryRoot, 'library.sqlite3'));
  electronApp = await launch(libraryRoot);
  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.setViewportSize({ width: 1280, height: 800 });
    await window.getByRole('tab', { name: 'Chat' }).click();
    await window.getByRole('checkbox', { name: 'Questions' }).uncheck({ force: true });
    await window.getByRole('checkbox', { name: 'Links' }).uncheck({ force: true });
    await window
      .getByLabel('Ask Research Chat')
      .fill('How does clipping in the paper correspond to code?');
    await window.getByRole('button', { name: 'Review sources' }).click();
    await expect(window.getByText('PPO clipping objective')).toBeVisible();
    await expect(window.getByText('src/policy.ts', { exact: true })).toBeVisible();
    await window.getByRole('button', { name: 'Send' }).click();
    await expect(window.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await window.screenshot({ path: testInfo.outputPath('research-chat-streaming-1280x800.png') });
    await expect(window.getByText('## Evidence summary')).toBeVisible();
    await expect(window.getByRole('button', { name: /Open citation S1/u }).first()).toBeVisible();
    await expect(window.getByRole('button', { name: /Open citation S2/u })).toBeVisible();

    for (const viewport of [
      { width: 1536, height: 1024 },
      { width: 1280, height: 800 },
      { width: 1024, height: 768 },
    ]) {
      await window.setViewportSize(viewport);
      await expect(window.getByLabel('Ask Research Chat')).toBeVisible();
      await expect(window.getByText('## Evidence summary')).toBeVisible();
      await expect(window.getByRole('button', { name: /Open citation S1/u }).first()).toBeVisible();
      if (viewport.width < 1280) {
        await expect(
          window.getByRole('complementary', { name: 'Research Chat sources' }),
        ).not.toHaveClass(/is-open/u);
        await window.waitForTimeout(250);
      }
      const overflow = await window.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        compact: globalThis.matchMedia('(max-width: 1279px)').matches,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
      expect(overflow.compact).toBe(viewport.width < 1280);
      await window.screenshot({
        path: testInfo.outputPath(
          `research-chat-complete-${String(viewport.width)}x${String(viewport.height)}.png`,
        ),
      });
    }
  } finally {
    await electronApp.close();
  }
});

test('renders responsive official provider status and recovery states', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const screenshotDirectory = path.resolve('docs/screenshots/phase-15');
  await mkdir(screenshotDirectory, { recursive: true });

  let electronApp = await launch(testInfo.outputPath('PaperMind Provider Connected'));
  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.getByRole('button', { name: 'Settings' }).first().click();
    await expect(window.getByRole('heading', { name: 'AI providers' })).toBeVisible();
    await expect(window.getByText('Official integration supported')).toBeVisible();
    await expect(window.getByText('ChatGPT account via Codex')).toBeVisible();

    for (const viewport of [
      { width: 1536, height: 1024 },
      { width: 1280, height: 800 },
      { width: 1024, height: 768 },
    ]) {
      await window.setViewportSize(viewport);
      await expect(window.getByText('Current provider')).toBeVisible();
      const overflow = await window.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
      await window.screenshot({
        path: path.join(
          screenshotDirectory,
          `provider-connected-${String(viewport.width)}x${String(viewport.height)}.png`,
        ),
      });
    }
  } finally {
    await electronApp.close();
  }

  electronApp = await launch(testInfo.outputPath('PaperMind Provider Session Expired'), {
    PAPERMIND_CODEX_MOCK_STATUS: 'expired',
  });
  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.setViewportSize({ width: 1280, height: 800 });
    await window.getByRole('button', { name: 'Settings' }).first().click();
    await window.getByRole('button', { name: 'Configure' }).click();
    await expect(window.getByTestId('provider-status-codex').first()).toContainText(
      'Session expired',
    );
    await expect(window.getByRole('button', { name: 'Sign in with ChatGPT' })).toBeVisible();
    await expect(
      window.getByText(/never reads browser cookies, ChatGPT web storage/u),
    ).toBeVisible();
    await window.screenshot({
      path: path.join(screenshotDirectory, 'provider-session-expired-1280x800.png'),
    });
  } finally {
    await electronApp.close();
  }
});

function seedKnowledgeFixture(databasePath: string): void {
  const database = new BetterSqlite3(databasePath);
  const workspace = database.prepare('SELECT id FROM workspaces LIMIT 1').get() as {
    readonly id: string;
  };
  const now = '2026-08-11T08:00:00.000Z';
  database
    .prepare(
      `INSERT INTO knowledge_index_states (
         workspace_id, status, index_version, source_count, chunk_count,
         processed_sources, total_sources, completed_at, updated_at
       ) VALUES (?, 'ready', 'papermind-knowledge-v1', 4, 4, 4, 4, ?, ?)`,
    )
    .run(workspace.id, now, now);
  const insertSource = database.prepare(
    `INSERT INTO knowledge_sources (
       id, workspace_id, source_type, source_identity, snapshot_identity, title,
       fingerprint, provenance_json, unavailable_reason, indexed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, '{}', NULL, ?)`,
  );
  const insertChunk = database.prepare(
    `INSERT INTO knowledge_chunks (
       id, source_id, workspace_id, source_type, ordinal, content_hash, content,
       citation, provenance_json, embedding_json
     ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, NULL)`,
  );
  const rows = knowledgeScreenshotRows(now);
  database.transaction(() => {
    for (const row of rows) {
      insertSource.run(
        row.sourceId,
        workspace.id,
        row.sourceType,
        row.sourceIdentity,
        row.snapshotIdentity,
        row.title,
        createHash('sha256').update(row.content).digest('hex'),
        now,
      );
      insertChunk.run(
        row.chunkId,
        row.sourceId,
        workspace.id,
        row.sourceType,
        createHash('sha256').update(row.content).digest('hex'),
        row.content,
        row.citation,
        JSON.stringify(row.provenance),
      );
    }
  })();
  database.close();
}

function knowledgeScreenshotRows(now: string) {
  const itemRef = {
    serverId: 'ServerIdentity01',
    library: { type: 'user', id: '0' },
    itemKey: 'PAPERAA2',
  } as const;
  return [
    {
      sourceId: '550e8400-e29b-41d4-a716-446655440101',
      chunkId: '550e8400-e29b-41d4-a716-446655440201',
      sourceType: 'paper',
      sourceIdentity: 'zotero:paper',
      snapshotIdentity: 'zotero:paper:v4',
      title: 'PPO clipping objective',
      content:
        'The clipping objective constrains the policy ratio while preserving a tractable surrogate.',
      citation: 'PPO paper, p. 3',
      provenance: {
        sourceType: 'paper',
        sourceIdentity: 'zotero:paper',
        snapshotIdentity: 'zotero:paper:v4',
        indexedAt: now,
        itemRef,
        attachmentKey: 'PDFATT22',
        pageNumber: 3,
      },
    },
    {
      sourceId: '550e8400-e29b-41d4-a716-446655440102',
      chunkId: '550e8400-e29b-41d4-a716-446655440202',
      sourceType: 'code',
      sourceIdentity: 'repo:file:policy',
      snapshotIdentity: 'commit:abc123',
      title: 'src/policy.ts',
      content:
        'The clippedObjective function implements clipping with a bounded probability ratio.',
      citation: 'repo/src/policy.ts:42-58',
      provenance: {
        sourceType: 'code',
        sourceIdentity: 'repo:file:policy',
        snapshotIdentity: 'commit:abc123',
        indexedAt: now,
        repositoryId: '550e8400-e29b-41d4-a716-446655440301',
        repositoryName: 'ppo-reference',
        language: 'typescript',
        relativePath: 'src/policy.ts',
        startLine: 42,
        endLine: 58,
      },
    },
    {
      sourceId: '550e8400-e29b-41d4-a716-446655440103',
      chunkId: '550e8400-e29b-41d4-a716-446655440203',
      sourceType: 'question',
      sourceIdentity: 'question:clipping',
      snapshotIdentity: 'question:clipping:v2',
      title: 'Does clipping constrain KL?',
      content:
        'Investigate whether clipping reliably constrains KL divergence across optimization epochs.',
      citation: 'Research question: Does clipping constrain KL?',
      provenance: {
        sourceType: 'question',
        sourceIdentity: 'question:clipping',
        snapshotIdentity: 'question:clipping:v2',
        indexedAt: now,
        questionId: '550e8400-e29b-41d4-a716-446655440302',
        status: 'investigating',
      },
    },
    {
      sourceId: '550e8400-e29b-41d4-a716-446655440104',
      chunkId: '550e8400-e29b-41d4-a716-446655440204',
      sourceType: 'link',
      sourceIdentity: 'link:clipping',
      snapshotIdentity: 'link:clipping:v1',
      title: 'Objective to implementation',
      content:
        'Confirmed clipping correspondence between the paper objective and the policy implementation.',
      citation: 'PPO p. 3 <-> src/policy.ts:42-58',
      provenance: {
        sourceType: 'link',
        sourceIdentity: 'link:clipping',
        snapshotIdentity: 'link:clipping:v1',
        indexedAt: now,
        linkId: '550e8400-e29b-41d4-a716-446655440303',
        itemRef,
        repositoryId: '550e8400-e29b-41d4-a716-446655440301',
        relativePath: 'src/policy.ts',
        startLine: 42,
        endLine: 58,
        pageNumber: 3,
      },
    },
  ] as const;
}
