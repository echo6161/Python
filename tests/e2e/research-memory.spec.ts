import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

import { LibraryDatabase } from '../../src/main/database/library-database';

function environment(libraryRoot: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env))
    if (value !== undefined) result[key] = value;
  result.NODE_ENV = 'test';
  result.PAPERMIND_LIBRARY_ROOT = libraryRoot;
  result.PAPERMIND_USER_DATA_ROOT = path.join(libraryRoot, '.electron-user-data');
  result.PAPERMIND_AI_PROVIDER = 'mock';
  result.PAPERMIND_AI_MOCK_DELAY_MS = '1';
  delete result.ELECTRON_RUN_AS_NODE;
  return result;
}

function launch(libraryRoot: string): Promise<ElectronApplication> {
  return electron.launch({
    args: ['.', '--disable-gpu', '--disable-gpu-sandbox', '--no-sandbox'],
    env: environment(libraryRoot),
  });
}

async function selectDirectoryInDialog(
  electronApp: ElectronApplication,
  selectedPath: string,
): Promise<void> {
  await electronApp.evaluate(({ dialog }, pathToSelect) => {
    const mutableDialog = dialog as unknown as {
      showOpenDialog: () => Promise<{ canceled: boolean; filePaths: readonly string[] }>;
    };
    mutableDialog.showOpenDialog = () =>
      Promise.resolve({ canceled: false, filePaths: [pathToSelect] });
  }, selectedPath);
}

test('edits, confirms and restores Workspace Notes and Memory across responsive viewports', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const libraryRoot = testInfo.outputPath('PaperMind Memory Library');
  const vaultRoot = testInfo.outputPath('Obsidian Fixture Vault');
  await mkdir(libraryRoot, { recursive: true });
  await mkdir(vaultRoot, { recursive: true });
  const fixture = await seedFixture(libraryRoot);
  const screenshotRoot = path.resolve('docs/screenshots/phase-16');
  await rm(screenshotRoot, { recursive: true, force: true });
  await mkdir(screenshotRoot, { recursive: true });

  let app = await launch(libraryRoot);
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.locator('#workspace-tab-notes')).toBeVisible({ timeout: 15_000 });
    await window.locator('#workspace-tab-notes').click();
    await window.getByRole('button', { name: 'Open item list' }).click();
    await window.getByText('PPO clipping memory', { exact: true }).click();
    await expect(window.getByLabel('Title')).toHaveValue('PPO clipping memory');

    for (const [name, width, height] of [
      ['1536x1024', 1536, 1024],
      ['1280x800', 1280, 800],
      ['1024x768', 1024, 768],
    ] as const) {
      await window.setViewportSize({ width, height });
      if (width < 1536) {
        await window.getByRole('button', { name: 'Open sources' }).click();
        await expect(window.getByText('PPO, p. 3')).toBeVisible();
        await window.waitForTimeout(200);
        expect(
          await window.locator('.research-memory-list').evaluate((element) => {
            const listBounds = element.getBoundingClientRect();
            const gridBounds = element.parentElement?.getBoundingClientRect();
            return gridBounds !== undefined && listBounds.right <= gridBounds.left;
          }),
        ).toBe(true);
      }
      await window.screenshot({ path: path.join(screenshotRoot, `notes-memory-${name}.png`) });
      if (width < 1536) await window.getByRole('button', { name: 'Close sources' }).click();
      expect(
        await window.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
    }

    await window.setViewportSize({ width: 1280, height: 800 });
    await window.getByRole('button', { name: 'Open item list' }).click();
    await window.getByText('Clipping work note', { exact: true }).click();
    await window.getByRole('button', { name: 'Propose Memory' }).click();
    await expect(window.getByRole('dialog', { name: 'Propose long-term Memory' })).toBeVisible();
    await window.getByRole('button', { name: 'Generate proposal' }).click();
    await expect(window.getByRole('dialog', { name: 'Review AI Memory proposal' })).toBeVisible();
    await window
      .getByLabel('Confirmed Memory body')
      .fill('Confirmed after user review. The clipped objective is a surrogate control [S1].');
    await window.screenshot({
      path: path.join(screenshotRoot, 'proposal-diff-confirm-1280x800.png'),
    });
    await window.getByRole('button', { name: 'Confirm Memory' }).click();
    await expect(window.getByText('Proposal confirmed as long-term Memory.')).toBeVisible();
    await expect(window.getByLabel('Title')).toHaveValue('Memory: Clipping work note');
    await window.getByLabel('Markdown body').fill('Confirmed after restart.');
    await window.getByRole('button', { name: 'Save' }).click();
    await expect(window.getByText('Saved locally.')).toBeVisible();
    await selectDirectoryInDialog(app, vaultRoot);
    await window.getByRole('button', { name: 'Export' }).click();
    await expect(
      window.getByRole('dialog', { name: 'Review one-way Markdown export' }),
    ).toBeVisible();
    await window.getByRole('button', { name: 'Export new file' }).click();
    await expect(window.getByText(/^Exported PaperMind\//u)).toBeVisible();
  } finally {
    await app.close();
  }

  app = await launch(libraryRoot);
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.locator('#workspace-tab-notes')).toBeVisible({ timeout: 15_000 });
    await window.locator('#workspace-tab-notes').click();
    await expect(window.getByLabel('Title')).toHaveValue('Memory: Clipping work note');
    await expect(window.getByLabel('Markdown body')).toHaveValue('Confirmed after restart.');
  } finally {
    await app.close();
  }

  const database = new LibraryDatabase(path.join(libraryRoot, 'library.sqlite3'));
  const proposals = await database.listResearchMemoryProposals(fixture.workspaceId);
  expect(proposals).toHaveLength(1);
  expect(proposals[0]?.status).toBe('confirmed');
  expect(
    (await database.listResearchContent({ workspaceId: fixture.workspaceId, types: ['memory'] }))
      .length,
  ).toBe(2);
  await database.close();
  const exportedFiles = await readdir(path.join(vaultRoot, 'PaperMind'));
  expect(exportedFiles).toHaveLength(1);
  const [exportedFile] = exportedFiles;
  if (!exportedFile) throw new Error('The reviewed Markdown export was not created.');
  expect(await readFile(path.join(vaultRoot, 'PaperMind', exportedFile), 'utf8')).toContain(
    'Confirmed after restart.',
  );
});

async function seedFixture(libraryRoot: string) {
  const databasePath = path.join(libraryRoot, 'library.sqlite3');
  await mkdir(path.dirname(databasePath), { recursive: true });
  const database = new LibraryDatabase(databasePath);
  const workspace = await database.createWorkspace({
    name: 'Policy Optimization',
    description: 'Phase 16 visual fixture',
    researchGoal: 'Track durable claims across papers and code.',
  });
  await database.setLastActiveWorkspace(workspace.id);
  const memory = await database.createResearchContent({
    workspaceId: workspace.id,
    type: 'memory',
    title: 'PPO clipping memory',
    bodyMarkdown:
      '## Durable finding\n\nThe clipped objective limits the update surrogate, but it is not a direct hard bound on KL divergence.\n\n## Limit\n\nThe exact behavior depends on optimization dynamics and implementation details.',
  });
  await database.updateResearchContent({
    workspaceId: workspace.id,
    type: 'memory',
    id: memory.id,
    title: memory.title,
    bodyMarkdown: memory.bodyMarkdown,
    status: 'confirmed',
    rowVersion: memory.rowVersion,
  });
  const note = await database.createResearchContent({
    workspaceId: workspace.id,
    type: 'note',
    title: 'Clipping work note',
    bodyMarkdown:
      'Compare the paper objective with the implementation guard and keep uncertainty explicit.',
  });
  const paperReference = reference(
    workspace.id,
    'paper',
    'PPO paper',
    'PPO, p. 3',
    'The probability ratio is clipped in the surrogate objective.',
  );
  const codeReference = reference(
    workspace.id,
    'code',
    'PPO implementation',
    'ppo.py:42-61',
    'ratio = exp(new_logp - old_logp); clipped = clamp(ratio, 1-eps, 1+eps)',
  );
  for (const owner of [
    { type: 'memory' as const, id: memory.id },
    { type: 'note' as const, id: note.id },
  ]) {
    for (const source of [paperReference, codeReference])
      await database.addResearchReference({
        ...source,
        id: crypto.randomUUID(),
        ownerType: owner.type,
        ownerId: owner.id,
      });
  }
  await database.close();
  return { workspaceId: workspace.id };
}

function reference(
  workspaceId: string,
  sourceType: 'code' | 'paper',
  title: string,
  citation: string,
  snippet: string,
) {
  const now = new Date().toISOString();
  const provenance =
    sourceType === 'paper'
      ? {
          sourceType,
          sourceIdentity: `paper:${title}`,
          snapshotIdentity: 'paper:v1',
          indexedAt: now,
          itemRef: {
            serverId: 'fixture-server',
            library: { type: 'user' as const, id: '0' },
            itemKey: 'PAPERAA2',
          },
          attachmentKey: 'PDFATT22',
          pageNumber: 3,
        }
      : {
          sourceType,
          sourceIdentity: `code:${title}`,
          snapshotIdentity: 'commit:fixture',
          indexedAt: now,
          repositoryId: crypto.randomUUID(),
          repositoryName: 'fixture-repo',
          language: 'python' as const,
          relativePath: 'src/ppo.py',
          startLine: 42,
          endLine: 61,
        };
  return {
    workspaceId,
    chunkId: null,
    sourceType,
    title,
    citation,
    snippet,
    provenanceJson: JSON.stringify(provenance),
    createdAt: now,
  };
}
