import { describe, expect, it } from 'vitest';
import {
  createExperimentSchema,
  addRunSchema,
  recordResultSchema,
} from '../../src/main/ipc/experiment-schemas';
const w = '11111111-1111-4111-8111-111111111111',
  e = '22222222-2222-4222-8222-222222222222';
describe('Experiment IPC schemas', () => {
  it('rejects commands, paths, URLs and oversized metrics', () => {
    expect(() =>
      createExperimentSchema.parse({
        workspaceId: w,
        questionId: null,
        title: 'x',
        hypothesis: 'h',
        repositoryId: null,
        codeSnapshotIdentity: null,
        configSummary: '',
        command: 'python train.py',
      }),
    ).toThrow();
    expect(() =>
      addRunSchema.parse({
        workspaceId: w,
        experimentId: e,
        label: 'run',
        toolName: 'tool',
        externalRunId: 'id',
        configSummary: '',
        startedAt: null,
        url: 'https://example.com',
      }),
    ).toThrow();
    expect(() =>
      recordResultSchema.parse({
        workspaceId: w,
        experimentId: e,
        runId: e,
        summary: 'r',
        outcome: 'supports',
        metrics: Array.from({ length: 51 }, (_, i) => ({
          name: `m${String(i)}`,
          value: i,
          unit: null,
        })),
      }),
    ).toThrow();
  });
});
