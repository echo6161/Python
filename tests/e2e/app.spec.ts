import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

import { writePdfFixture, writeStructuredPdfFixture } from '../helpers/pdf-fixture';

const execFileAsync = promisify(execFile);

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
  environment.PAPERMIND_AI_PROVIDER = 'mock';
  environment.PAPERMIND_AI_MOCK_DELAY_MS = '50';
  delete environment.ELECTRON_RUN_AS_NODE;
  return environment;
}

async function launch(libraryRoot: string): Promise<ElectronApplication> {
  // The managed test host cannot initialize Chromium's Windows process sandbox.
  return electron.launch({
    args: ['.', '--disable-gpu', '--disable-gpu-sandbox', '--no-sandbox'],
    env: electronEnvironment(libraryRoot),
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

    await window.getByRole('button', { name: 'Create Workspace', exact: true }).click();
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
    await expect(window.getByText('Compare reproducible evidence synthesis methods')).toBeVisible();
    await expect(
      window.getByText('Define the research goal, then add relevant papers from Zotero.'),
    ).toBeVisible();
    await expect(window.getByLabel('Questions: Coming later')).toBeVisible();
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
    await expect(window.getByText('Compare reproducible evidence synthesis methods')).toBeVisible();

    await window.getByRole('button', { name: 'Archive' }).click();
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

    await window.getByRole('button', { name: 'Delete' }).click();
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

test('links, browses, refreshes, restores, and removes a read-only repository', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const libraryRoot = testInfo.outputPath('PaperMind Repository Library');
  const repositoryRoot = testInfo.outputPath('phase-9-repository-fixture');
  const sourcePath = path.join(repositoryRoot, 'src', 'index.ts');
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, 'export const phase = 9;\n', 'utf8');
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

    await selectDirectoryInDialog(electronApp, repositoryRoot);
    await window.getByRole('button', { name: 'Add repository' }).click();
    await expect(
      window.getByText('Repository linked. Local files were not copied or modified.'),
    ).toBeVisible();
    await expect(window.getByText(`main | ${initialHead.slice(0, 10)}`)).toBeVisible();
    await expect(window.getByText('Available', { exact: true })).toBeVisible();
    await expect(window.getByRole('button', { name: 'ignored.txt' })).not.toBeVisible();

    await window.getByRole('button', { name: 'src' }).click();
    await window.getByRole('button', { name: 'index.ts' }).click();
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
  await writeFile(sourcePath, 'export const phase = 9;\nexport const refreshed = true;\n', 'utf8');
  await git(repositoryRoot, ['add', 'src/index.ts']);
  await git(repositoryRoot, ['commit', '-m', 'fixture: advance head']);
  const refreshedHead = await git(repositoryRoot, ['rev-parse', 'HEAD']);

  electronApp = await launch(libraryRoot);
  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.getByRole('heading', { name: 'Repository Workspace' })).toBeVisible();
    await expect(window.getByText(`main | ${initialHead.slice(0, 10)}`)).toBeVisible();
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
