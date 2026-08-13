import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import { LibraryDatabase } from '../../src/main/database/library-database';

test('manages an adaptive Plan and captures responsive task and proposal states', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const libraryRoot = testInfo.outputPath('PaperMind Plan Library');
  await mkdir(libraryRoot, { recursive: true });
  await seedFixture(libraryRoot);
  const screenshotRoot = path.resolve('docs/screenshots/phase-17');
  await rm(screenshotRoot, { recursive: true, force: true });
  await mkdir(screenshotRoot, { recursive: true });
  const app = await electron.launch({
    args: ['.', '--disable-gpu', '--disable-gpu-sandbox', '--no-sandbox'],
    env: environment(libraryRoot),
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.locator('#workspace-tab-plan')).toBeVisible({ timeout: 15_000 });
    await window.locator('#workspace-tab-plan').click();
    await expect(window.getByText('Adaptive Research Plan')).toBeVisible();
    await expect(window.getByText('50%')).toBeVisible();
    await expect(window.getByText('Waiting for implementation comparison.')).toBeVisible();

    for (const [name, width, height] of [
      ['1536x1024', 1536, 1024],
      ['1280x800', 1280, 800],
      ['1024x768', 1024, 768],
    ] as const) {
      await window.setViewportSize({ width, height });
      await window.getByText('Compare implementation', { exact: true }).first().click();
      await expect(window.getByLabel('Status')).toBeVisible();
      await window.screenshot({ path: path.join(screenshotRoot, `research-plan-${name}.png`) });
      expect(
        await window.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      if (width < 1025) await window.getByRole('button', { name: 'Close task detail' }).click();
    }

    await window.setViewportSize({ width: 1280, height: 800 });
    await window.getByRole('button', { name: 'Adapt', exact: true }).click();
    await expect(
      window.getByRole('dialog', { name: 'Review changes before writing the Plan' }),
    ).toBeVisible();
    await expect(window.getByLabel('Change 1 title')).toHaveValue('Review the primary evidence');
    await window.screenshot({
      path: path.join(screenshotRoot, 'adapt-proposal-diff-1280x800.png'),
    });
    await window.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect(
      window.getByRole('dialog', { name: 'Review changes before writing the Plan' }),
    ).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('keeps Plan actions usable after deleting the selected task', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const libraryRoot = testInfo.outputPath('PaperMind Plan Delete Library');
  await mkdir(libraryRoot, { recursive: true });
  await seedFixture(libraryRoot);
  const app = await electron.launch({
    args: ['.', '--disable-gpu', '--disable-gpu-sandbox', '--no-sandbox'],
    env: environment(libraryRoot),
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.locator('#workspace-tab-plan').click();
    await window.getByText('Compare implementation', { exact: true }).first().click();
    await window.getByRole('button', { name: 'Delete task' }).click();
    await window.getByRole('button', { name: 'Confirm delete task' }).click();
    await expect(window.getByText('Compare implementation', { exact: true })).toHaveCount(0);

    const status = window.getByLabel('Status');
    await expect(status).toBeEnabled();
    await status.selectOption('in_progress');
    await expect(status).toHaveValue('in_progress');

    const addTask = window.getByRole('button', { name: 'Task', exact: true });
    await expect(addTask).toBeEnabled();
    await addTask.click();
    await window.getByLabel('Title').fill('Inspect follow-up evidence');
    await window.getByRole('button', { name: 'Add task', exact: true }).click();
    await expect(
      window.getByRole('button', { name: 'Inspect follow-up evidence todo' }),
    ).toBeVisible();
  } finally {
    await app.close();
  }
});

test('creates a new task after deleting the only task', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium');
  const libraryRoot = testInfo.outputPath('PaperMind Last Plan Task Library');
  await mkdir(libraryRoot, { recursive: true });
  await seedSingleTaskFixture(libraryRoot);
  const app = await electron.launch({
    args: ['.', '--disable-gpu', '--disable-gpu-sandbox', '--no-sandbox'],
    env: environment(libraryRoot),
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.locator('#workspace-tab-plan').click();
    await window.getByText('Only task', { exact: true }).first().click();
    await window.getByRole('button', { name: 'Delete task' }).click();
    await window.getByRole('button', { name: 'Confirm delete task' }).click();
    await expect(
      window.getByText('No tasks yet. Add the first concrete research action.'),
    ).toBeVisible();
    await expect(window.getByRole('button', { name: 'Delete plan' })).toBeVisible();

    const addTask = window.getByRole('button', { name: 'Task', exact: true });
    await expect(addTask).toBeFocused();
    await window.keyboard.press('Enter');
    const taskTitle = window.getByLabel('Title');
    await expect(taskTitle).toBeFocused();
    await window.keyboard.press('Enter');
    await expect(window.getByRole('alert')).toHaveText('Task title is required.');
    await expect(taskTitle).toBeFocused();
    await window.keyboard.type('Replacement task');
    await window.keyboard.press('Enter');
    await expect(window.getByRole('dialog', { name: 'Add research task' })).toHaveCount(0);
    await expect(window.getByRole('button', { name: 'Replacement task todo' })).toBeVisible();

    const database = new LibraryDatabase(path.join(libraryRoot, 'library.sqlite3'));
    const workspaces = await database.listWorkspaces();
    const current = workspaces[0] ? await database.getActiveResearchPlan(workspaces[0].id) : null;
    expect(current?.tasks.map(({ title }) => title)).toEqual(['Replacement task']);
    await database.close();
  } finally {
    await app.close();
  }
});

async function seedFixture(libraryRoot: string): Promise<void> {
  const database = new LibraryDatabase(path.join(libraryRoot, 'library.sqlite3'));
  const workspace = await database.createWorkspace({
    name: 'Adaptive Planning',
    description: 'Phase 17 visual fixture',
    researchGoal: 'Verify the algorithm claim against paper evidence and implementation.',
  });
  await database.setLastActiveWorkspace(workspace.id);
  let plan = await database.createResearchPlan({
    workspaceId: workspace.id,
    goal: workspace.researchGoal,
  });
  for (const [title, description] of [
    ['Review primary paper', 'Extract the exact claim and its stated limitations.'],
    ['Compare implementation', 'Trace the claim to the current repository implementation.'],
    ['Resolve conflicting evidence', 'Document why the paper and code differ before proceeding.'],
    ['Record bounded conclusion', 'Preserve the result with provenance and remaining uncertainty.'],
  ] as const)
    plan = await database.createPlanTask({
      workspaceId: workspace.id,
      planId: plan.id,
      title,
      description,
    });
  const [review, compare, blocked, done] = plan.tasks;
  if (!review || !compare || !blocked || !done)
    throw new Error('Plan fixture tasks were not created.');
  plan = await database.setPlanDependencies({
    workspaceId: workspace.id,
    planId: plan.id,
    taskId: compare.id,
    dependencyIds: [review.id],
  });
  plan = await database.setPlanDependencies({
    workspaceId: workspace.id,
    planId: plan.id,
    taskId: blocked.id,
    dependencyIds: [compare.id],
  });
  const currentReview = plan.tasks.find(({ id }) => id === review.id);
  if (!currentReview) throw new Error('Review task missing.');
  plan = await database.completePlanTask({
    workspaceId: workspace.id,
    planId: plan.id,
    taskId: review.id,
    completionNote: 'Primary evidence reviewed.',
    evidenceReferenceIds: [],
    rowVersion: currentReview.rowVersion,
  });
  const currentCompare = plan.tasks.find(({ id }) => id === compare.id);
  const currentBlocked = plan.tasks.find(({ id }) => id === blocked.id);
  const currentDone = plan.tasks.find(({ id }) => id === done.id);
  if (!currentCompare || !currentBlocked || !currentDone)
    throw new Error('Plan fixture state missing.');
  plan = await database.setPlanTaskStatus({
    workspaceId: workspace.id,
    planId: plan.id,
    taskId: compare.id,
    status: 'in_progress',
    blockedReason: null,
    rowVersion: currentCompare.rowVersion,
  });
  plan = await database.setPlanTaskStatus({
    workspaceId: workspace.id,
    planId: plan.id,
    taskId: blocked.id,
    status: 'blocked',
    blockedReason: 'Waiting for implementation comparison.',
    rowVersion: currentBlocked.rowVersion,
  });
  const refreshedDone = plan.tasks.find(({ id }) => id === done.id);
  if (!refreshedDone) throw new Error('Completion task missing.');
  await database.completePlanTask({
    workspaceId: workspace.id,
    planId: plan.id,
    taskId: done.id,
    completionNote: 'Earlier conclusion retained.',
    evidenceReferenceIds: [],
    rowVersion: refreshedDone.rowVersion,
  });
  await database.close();
}

async function seedSingleTaskFixture(libraryRoot: string): Promise<void> {
  const database = new LibraryDatabase(path.join(libraryRoot, 'library.sqlite3'));
  const workspace = await database.createWorkspace({
    name: 'Single task planning',
    description: '',
    researchGoal: 'Replace the only task.',
  });
  await database.setLastActiveWorkspace(workspace.id);
  let plan = await database.createResearchPlan({
    workspaceId: workspace.id,
    goal: workspace.researchGoal,
  });
  plan = await database.createPlanTask({
    workspaceId: workspace.id,
    planId: plan.id,
    title: 'Only task',
    description: 'Delete this task during acceptance.',
  });
  expect(plan.tasks).toHaveLength(1);
  await database.close();
}

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
