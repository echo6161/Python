import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LibraryDatabase } from '../../src/main/database/library-database';
import { ExperimentService } from '../../src/main/experiment/experiment-service';
import { ResearchGraphService } from '../../src/main/research-graph/research-graph-service';
const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))),
);
describe('Research Graph projection', () => {
  it('rebuilds deterministically from canonical tables and isolates Workspaces', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pm-graph-'));
    roots.push(root);
    const db = new LibraryDatabase(path.join(root, 'db.sqlite3')),
      w = await db.createWorkspace({
        name: 'Graph',
        description: '',
        researchGoal: 'Trace result',
      }),
      other = await db.createWorkspace({ name: 'Other', description: '', researchGoal: 'Other' }),
      q = await db.createQuestion({
        workspaceId: w.id,
        title: 'Question',
        description: '',
        priority: 'normal',
      });
    const experiments = new ExperimentService(db, db, db, {
      generate: () =>
        Promise.resolve({
          statement: 'pending',
          rationale: 'pending',
          providerId: 'openai',
          model: 'mock',
        }),
    });
    let e = await experiments.create({
      workspaceId: w.id,
      questionId: q.id,
      title: 'Experiment',
      hypothesis: 'Hypothesis',
      repositoryId: null,
      codeSnapshotIdentity: null,
      configSummary: 'seed=1',
    });
    e = await experiments.addRun({
      workspaceId: w.id,
      experimentId: e.id,
      label: 'Run',
      toolName: 'external',
      externalRunId: 'r1',
      configSummary: '',
      startedAt: null,
    });
    const run = e.runs[0];
    if (!run) throw new Error('run');
    e = await experiments.recordResult({
      workspaceId: w.id,
      experimentId: e.id,
      runId: run.id,
      summary: 'Result',
      outcome: 'supports',
      metrics: [],
    });
    await experiments.createConclusion({
      workspaceId: w.id,
      experimentId: e.id,
      resultId: e.runs[0]?.result?.id ?? null,
      statement: 'Conclusion',
    });
    await experiments.generateProposal({
      workspaceId: w.id,
      experimentId: e.id,
      instruction: 'pending',
    });
    const graph = new ResearchGraphService(db, db, db, db, db, db, experiments),
      first = await graph.getProjection(w.id),
      second = await graph.getProjection(w.id);
    expect(second).toEqual(first);
    expect(first.nodes.map((n) => n.kind)).toEqual(
      expect.arrayContaining([
        'workspace',
        'question',
        'experiment',
        'hypothesis',
        'run',
        'result',
        'conclusion',
      ]),
    );
    expect(first.nodes.some((n) => n.label === 'pending')).toBe(false);
    expect((await graph.getProjection(other.id)).nodes).toHaveLength(1);
    await db.close();
  });
});
