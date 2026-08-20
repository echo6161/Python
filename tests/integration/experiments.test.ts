import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LibraryDatabase } from '../../src/main/database/library-database';
import { ExperimentService } from '../../src/main/experiment/experiment-service';
const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))),
);
describe('Experiment lifecycle', () => {
  it('persists hypothesis, snapshot, external run, result, manual and confirmed AI conclusion without touching sources', async () => {
    const f = await fixture(),
      service = f.service;
    let e = await service.create({
      workspaceId: f.workspace.id,
      questionId: f.question.id,
      title: 'Clipping ablation',
      hypothesis: 'Clipping reduces unstable updates.',
      repositoryId: f.repository.id,
      codeSnapshotIdentity: 'a'.repeat(40),
      configSummary: 'seed=7, epochs=10',
    });
    e = await service.addRun({
      workspaceId: f.workspace.id,
      experimentId: e.id,
      label: 'Ablation 01',
      toolName: 'Weights & Biases',
      externalRunId: 'run-001',
      configSummary: 'clip=0.2',
      startedAt: null,
    });
    const run = e.runs[0];
    if (!run) throw new Error('run');
    e = await service.updateRun({
      workspaceId: f.workspace.id,
      experimentId: e.id,
      runId: run.id,
      label: run.label,
      status: 'succeeded',
      configSummary: run.configSummary,
      startedAt: '2026-08-20T00:00:00.000Z',
      completedAt: '2026-08-20T00:10:00.000Z',
      rowVersion: run.rowVersion,
    });
    e = await service.recordResult({
      workspaceId: f.workspace.id,
      experimentId: e.id,
      runId: run.id,
      summary: 'Clipped training remained stable.',
      outcome: 'supports',
      metrics: [{ name: 'reward', value: 42, unit: null }],
    });
    e = await service.createConclusion({
      workspaceId: f.workspace.id,
      experimentId: e.id,
      resultId: e.runs[0]?.result?.id ?? null,
      statement: 'Manual bounded conclusion.',
    });
    expect(e.conclusions[0]?.provenance).toBe('manual');
    const p = await service.generateProposal({
      workspaceId: f.workspace.id,
      experimentId: e.id,
      instruction: 'Summarize bounded result',
    });
    expect((await service.get(f.workspace.id, e.id)).conclusions).toHaveLength(1);
    e = await service.confirmProposal({
      workspaceId: f.workspace.id,
      experimentId: e.id,
      proposalId: p.id,
      statement: p.statement,
      rowVersion: p.rowVersion,
    });
    expect(e.conclusions.some((c) => c.provenance === 'ai-proposed-confirmed')).toBe(true);
    await f.db.close();
  });
  it('marks repository drift stale, rejects cross-workspace refs and deletes metadata only', async () => {
    const f = await fixture();
    let e = await f.service.create({
      workspaceId: f.workspace.id,
      questionId: f.question.id,
      title: 'Snapshot check',
      hypothesis: 'Pinned code is reproducible.',
      repositoryId: f.repository.id,
      codeSnapshotIdentity: 'a'.repeat(40),
      configSummary: '',
    });
    await f.db.updateRepositoryObservation(f.repository.id, {
      kind: 'git',
      gitRoot: 'C:\\fixture',
      currentBranch: 'main',
      headCommit: 'b'.repeat(40),
      remotes: [],
      availability: 'available',
      lastErrorCode: null,
      observedAt: new Date().toISOString(),
    });
    e = await f.service.get(f.workspace.id, e.id);
    expect(e.availability.repository).toBe('stale');
    const other = await f.db.createWorkspace({
      name: 'Other',
      description: '',
      researchGoal: 'Other',
    });
    await expect(
      f.service.create({
        workspaceId: other.id,
        questionId: f.question.id,
        title: 'Bad',
        hypothesis: 'Bad ref',
        repositoryId: null,
        codeSnapshotIdentity: null,
        configSummary: '',
      }),
    ).rejects.toThrow('not in this Workspace');
    await f.service.delete(f.workspace.id, e.id);
    expect(await f.db.getQuestion(f.workspace.id, f.question.id)).not.toBeNull();
    expect(await f.db.getRepository(f.repository.id)).not.toBeNull();
    await f.db.close();
  });
});
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pm-exp-'));
  roots.push(root);
  const db = new LibraryDatabase(path.join(root, 'db.sqlite3'));
  const workspace = await db.createWorkspace({
    name: 'Experiment WS',
    description: '',
    researchGoal: 'Verify',
  });
  const question = await db.createQuestion({
    workspaceId: workspace.id,
    title: 'Does clipping help?',
    description: '',
    priority: 'high',
  });
  const repository = await db.createOrUpdateRepository({
    canonicalRoot: 'C:\\fixture',
    canonicalKey: 'fixture',
    displayName: 'fixture',
    kind: 'git',
    gitRoot: 'C:\\fixture',
    currentBranch: 'main',
    headCommit: 'a'.repeat(40),
    remotes: [],
    availability: 'available',
    lastErrorCode: null,
    observedAt: new Date().toISOString(),
  });
  await db.addWorkspaceRepository(workspace.id, repository.id);
  const service = new ExperimentService(db, db, db, {
    generate: () =>
      Promise.resolve({
        statement: 'AI bounded conclusion.',
        rationale: 'Based on recorded result only.',
        providerId: 'openai',
        model: 'mock',
      }),
  });
  return { db, workspace, question, repository, service };
}
