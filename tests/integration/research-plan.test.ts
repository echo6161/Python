// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LibraryDatabase } from '../../src/main/database/library-database';
import type { PlanProposalGenerator } from '../../src/main/research-plan/plan-proposal-generator';
import { ResearchPlanService } from '../../src/main/research-plan/research-plan-service';
import type { QuestionDataGateway } from '../../src/main/question/question-data-gateway';
import type { ZoteroBridgeService } from '../../src/main/zotero/zotero-bridge-service';

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'papermind-plan-'));
  roots.push(root);
  const databasePath = path.join(root, 'library.sqlite3');
  const database = new LibraryDatabase(databasePath);
  const workspace = await database.createWorkspace({
    name: 'Plan Workspace',
    description: '',
    researchGoal: 'Verify a method',
  });
  return { database, databasePath, workspace };
}

describe('Adaptive Research Plan persistence', () => {
  it('supports manual CRUD, ordering, dependencies, blocked state, completion, history and restart', async () => {
    const { database, databasePath, workspace } = await fixture();
    let plan = await database.createResearchPlan({
      workspaceId: workspace.id,
      goal: 'Verify a method',
    });
    plan = await database.createPlanTask({
      workspaceId: workspace.id,
      planId: plan.id,
      title: 'Read evidence',
      description: 'Read the primary paper.',
    });
    plan = await database.createPlanTask({
      workspaceId: workspace.id,
      planId: plan.id,
      title: 'Inspect code',
      description: 'Inspect the implementation.',
    });
    const [read, inspect] = plan.tasks;
    expect(read && inspect).toBeTruthy();
    if (!read || !inspect) return;
    plan = await database.setPlanDependencies({
      workspaceId: workspace.id,
      planId: plan.id,
      taskId: inspect.id,
      dependencyIds: [read.id],
    });
    expect(plan.progress.blocked).toBe(1);
    expect(plan.progress.nextTaskId).toBe(read.id);
    plan = await database.reorderPlanTasks({
      workspaceId: workspace.id,
      planId: plan.id,
      taskIds: [inspect.id, read.id],
    });
    expect(plan.tasks.map(({ id }) => id)).toEqual([inspect.id, read.id]);
    const currentRead = plan.tasks.find(({ id }) => id === read.id);
    if (!currentRead) return;
    plan = await database.setPlanTaskStatus({
      workspaceId: workspace.id,
      planId: plan.id,
      taskId: read.id,
      status: 'in_progress',
      blockedReason: null,
      rowVersion: currentRead.rowVersion,
    });
    const runningRead = plan.tasks.find(({ id }) => id === read.id);
    if (!runningRead) return;
    const question = await database.createQuestion({
      workspaceId: workspace.id,
      title: 'Does the evidence support the method?',
      description: 'A source owned outside the Plan domain.',
      priority: 'high',
    });
    const referenceId = crypto.randomUUID();
    plan = await database.addPlanReference({
      workspaceId: workspace.id,
      planId: plan.id,
      taskId: read.id,
      id: referenceId,
      sourceKey: question.id,
      title: question.title,
      citation: `Research Question: ${question.title}`,
      target: { type: 'question', questionId: question.id },
      snapshotIdentity: `question:${question.id}:v${String(question.rowVersion)}`,
      createdAt: new Date().toISOString(),
    });
    const referencedRead = plan.tasks.find(({ id }) => id === read.id);
    if (!referencedRead) return;
    plan = await database.completePlanTask({
      workspaceId: workspace.id,
      planId: plan.id,
      taskId: read.id,
      completionNote: 'Paper checked against the claim.',
      evidenceReferenceIds: [referenceId],
      rowVersion: referencedRead.rowVersion,
    });
    expect(plan.progress).toMatchObject({ completed: 1, eligible: 2, percent: 50, blocked: 0 });
    expect(plan.tasks.find(({ id }) => id === read.id)?.completionEvidence).toMatchObject([
      { sourceType: 'question', note: 'Paper checked against the claim.' },
    ]);
    expect(
      (await database.listResearchPlanHistory(workspace.id, plan.id)).length,
    ).toBeGreaterThanOrEqual(7);

    await expect(
      database.setPlanDependencies({
        workspaceId: workspace.id,
        planId: plan.id,
        taskId: read.id,
        dependencyIds: [inspect.id],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const other = await database.createWorkspace({
      name: 'Other',
      description: '',
      researchGoal: '',
    });
    await expect(
      database.setPlanDependencies({
        workspaceId: other.id,
        planId: plan.id,
        taskId: inspect.id,
        dependencyIds: [read.id],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await database.close();
    const reopened = new LibraryDatabase(databasePath);
    const restored = await reopened.getActiveResearchPlan(workspace.id);
    expect(restored?.tasks.find(({ id }) => id === read.id)?.status).toBe('done');
    expect(restored?.tasks.find(({ id }) => id === read.id)?.completionEvidence).toHaveLength(1);
    expect(await reopened.getQuestion(workspace.id, question.id)).not.toBeNull();
    expect(restored?.progress.percent).toBe(50);
    await reopened.close();
  });

  it('marks orphaned references unavailable and rejects cross-Workspace sources', async () => {
    const { database, workspace } = await fixture();
    const service = new ResearchPlanService(
      database,
      database,
      database,
      database,
      database,
      {} as ZoteroBridgeService,
      {} as PlanProposalGenerator,
    );
    let plan = await service.create({ workspaceId: workspace.id, goal: 'Trace sources' });
    plan = await service.createTask({
      workspaceId: workspace.id,
      planId: plan.id,
      title: 'Resolve source',
      description: '',
    });
    const task = plan.tasks[0];
    if (!task) return;
    const question = await database.createQuestion({
      workspaceId: workspace.id,
      title: 'Temporary source',
      description: '',
      priority: 'normal',
    });
    plan = await service.addReference({
      workspaceId: workspace.id,
      planId: plan.id,
      taskId: task.id,
      target: { type: 'question', questionId: question.id },
    });
    expect(plan.tasks[0]?.references[0]?.availability).toBe('available');

    const other = await database.createWorkspace({
      name: 'Other reference owner',
      description: '',
      researchGoal: '',
    });
    const foreignQuestion = await database.createQuestion({
      workspaceId: other.id,
      title: 'Foreign source',
      description: '',
      priority: 'normal',
    });
    await expect(
      service.addReference({
        workspaceId: workspace.id,
        planId: plan.id,
        taskId: task.id,
        target: { type: 'question', questionId: foreignQuestion.id },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(await database.deleteQuestion(workspace.id, question.id)).toBe(true);
    const hydrated = await service.getActive(workspace.id);
    expect(hydrated?.tasks[0]?.references[0]).toMatchObject({
      availability: 'unavailable',
      availabilityReason: 'The external source is no longer available in this Workspace.',
    });
    await database.close();
  });

  it('does not make local task mutations wait for external source hydration', async () => {
    const { database, workspace } = await fixture();
    let plan = await database.createResearchPlan({ workspaceId: workspace.id, goal: 'Stay local' });
    plan = await database.createPlanTask({
      workspaceId: workspace.id,
      planId: plan.id,
      title: 'Keep referenced task',
      description: '',
    });
    plan = await database.createPlanTask({
      workspaceId: workspace.id,
      planId: plan.id,
      title: 'Delete local task',
      description: '',
    });
    const [referenced, deleted] = plan.tasks;
    if (!referenced || !deleted) return;
    await database.addPlanReference({
      workspaceId: workspace.id,
      planId: plan.id,
      taskId: referenced.id,
      id: crypto.randomUUID(),
      sourceKey: crypto.randomUUID(),
      title: 'Unavailable question',
      citation: 'Research Question: unavailable',
      target: { type: 'question', questionId: crypto.randomUUID() },
      snapshotIdentity: null,
      createdAt: new Date().toISOString(),
    });
    const listQuestions = vi.fn().mockRejectedValue(new Error('External source unavailable'));
    const service = new ResearchPlanService(
      database,
      database,
      { listQuestions } as unknown as QuestionDataGateway,
      database,
      database,
      {} as ZoteroBridgeService,
      {} as PlanProposalGenerator,
    );

    const updated = await service.deleteTask({
      workspaceId: workspace.id,
      planId: plan.id,
      taskId: deleted.id,
    });
    expect(updated.tasks.map(({ id }) => id)).toEqual([referenced.id]);
    expect(listQuestions).not.toHaveBeenCalled();
    await database.close();
  });

  it('keeps proposals non-canonical until confirmation and preserves completed tasks during adapt', async () => {
    const { database, databasePath, workspace } = await fixture();
    let plan = await database.createResearchPlan({
      workspaceId: workspace.id,
      goal: 'Original goal',
    });
    plan = await database.createPlanTask({
      workspaceId: workspace.id,
      planId: plan.id,
      title: 'Completed finding',
      description: 'User-owned work.',
    });
    const completed = plan.tasks[0];
    if (!completed) return;
    plan = await database.completePlanTask({
      workspaceId: workspace.id,
      planId: plan.id,
      taskId: completed.id,
      completionNote: 'Verified manually.',
      evidenceReferenceIds: [],
      rowVersion: completed.rowVersion,
    });
    const proposal = await database.createResearchPlanProposal({
      id: crypto.randomUUID(),
      workspaceId: workspace.id,
      planId: plan.id,
      baseVersion: plan.version,
      mode: 'adapt',
      goal: 'Adapted goal',
      rationale: 'Add the next action.',
      changesJson: JSON.stringify([
        {
          id: crypto.randomUUID(),
          kind: 'update',
          taskId: completed.id,
          title: 'AI overwrite attempt',
          description: 'Must not overwrite.',
          rationale: 'Test',
          dependencyTaskIds: [],
          referenceCandidateIds: [],
        },
        {
          id: crypto.randomUUID(),
          kind: 'add',
          taskId: null,
          title: 'New bounded action',
          description: 'Inspect another source.',
          rationale: 'Test',
          dependencyTaskIds: [],
          referenceCandidateIds: [],
        },
      ]),
      providerId: 'openai',
      model: 'fake',
      createdAt: new Date().toISOString(),
    });
    const raw = new BetterSqlite3(databasePath, { readonly: true });
    expect(raw.prepare('SELECT count(*) AS count FROM plan_tasks').get()).toEqual({ count: 1 });
    raw.close();
    plan = await database.confirmResearchPlanProposal({
      workspaceId: workspace.id,
      proposalId: proposal.id,
      rowVersion: proposal.rowVersion,
    });
    expect(plan.tasks.map(({ title }) => title)).toEqual([
      'Completed finding',
      'New bounded action',
    ]);
    expect(plan.tasks[0]?.status).toBe('done');
    await database.close();
  });

  it('retire and delete remove only PaperMind plan rows', async () => {
    const { database, workspace } = await fixture();
    let plan = await database.createResearchPlan({
      workspaceId: workspace.id,
      goal: 'Temporary plan',
    });
    plan = await database.retireResearchPlan({
      workspaceId: workspace.id,
      planId: plan.id,
      rowVersion: plan.rowVersion,
    });
    expect(plan.status).toBe('retired');
    expect(await database.deleteResearchPlan(workspace.id, plan.id)).toBe(true);
    expect(await database.getResearchPlan(workspace.id, plan.id)).toBeNull();
    expect(await database.getWorkspace(workspace.id)).not.toBeNull();
    await database.close();
  });
});
