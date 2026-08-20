// @vitest-environment node
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
describe('V1 capacity baseline', () => {
  it('records a reproducible medium Workspace graph projection measurement', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pm-v1-perf-'));
    roots.push(root);
    const db = new LibraryDatabase(path.join(root, 'db.sqlite3')),
      workspace = await db.createWorkspace({
        name: 'Medium graph',
        description: '',
        researchGoal: 'Measure projection',
      });
    for (let i = 0; i < 200; i++)
      await db.createQuestion({
        workspaceId: workspace.id,
        title: `Question ${String(i)}`,
        description: 'bounded fixture',
        priority: 'normal',
      });
    const experiments = new ExperimentService(db, db, db, {
      generate: () =>
        Promise.resolve({
          statement: 'unused',
          rationale: 'unused',
          providerId: 'openai',
          model: 'mock',
        }),
    });
    for (let i = 0; i < 40; i++)
      await experiments.create({
        workspaceId: workspace.id,
        questionId: null,
        title: `Experiment ${String(i)}`,
        hypothesis: `Hypothesis ${String(i)}`,
        repositoryId: null,
        codeSnapshotIdentity: null,
        configSummary: 'seed=1',
      });
    const graph = new ResearchGraphService(db, db, db, db, db, db, experiments),
      heapBefore = process.memoryUsage().heapUsed,
      started = performance.now(),
      projection = await graph.getProjection(workspace.id),
      elapsed = performance.now() - started,
      heapMiB = (process.memoryUsage().heapUsed - heapBefore) / (1024 * 1024),
      bytes = Buffer.byteLength(JSON.stringify(projection));
    expect(projection.nodes).toHaveLength(281);
    expect(projection.edges.length).toBeGreaterThanOrEqual(280);
    console.info(
      `[v1-graph-benchmark] questions=200 experiments=40 nodes=${String(projection.nodes.length)} edges=${String(projection.edges.length)} projectionMs=${elapsed.toFixed(1)} jsonKiB=${(bytes / 1024).toFixed(1)} heapDeltaMiB=${heapMiB.toFixed(1)}`,
    );
    await db.close();
  });
});
