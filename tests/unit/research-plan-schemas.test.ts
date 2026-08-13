import { describe, expect, it } from 'vitest';

import {
  addPlanReferenceSchema,
  completePlanTaskSchema,
  deleteResearchPlanSchema,
  generateResearchPlanProposalSchema,
  reorderPlanTasksSchema,
  setPlanDependenciesSchema,
  setPlanTaskStatusSchema,
} from '../../src/main/ipc/research-plan-schemas';

const workspaceId = '550e8400-e29b-41d4-a716-446655440001';
const planId = '550e8400-e29b-41d4-a716-446655440002';
const taskId = '550e8400-e29b-41d4-a716-446655440003';

describe('Research Plan IPC validation', () => {
  it('rejects cycles at the service boundary shape, duplicate order ids and unbounded input', () => {
    expect(
      setPlanDependenciesSchema.safeParse({
        workspaceId,
        planId,
        taskId,
        dependencyIds: [taskId, taskId],
      }).success,
    ).toBe(false);
    expect(
      reorderPlanTasksSchema.safeParse({ workspaceId, planId, taskIds: [taskId, taskId] }).success,
    ).toBe(false);
    expect(
      generateResearchPlanProposalSchema.safeParse({
        workspaceId,
        mode: 'adapt',
        instruction: 'x'.repeat(4001),
      }).success,
    ).toBe(false);
  });

  it('requires explicit delete and completion semantics', () => {
    expect(
      deleteResearchPlanSchema.safeParse({ workspaceId, planId, confirmation: 'DELETE' }).success,
    ).toBe(false);
    expect(
      completePlanTaskSchema.safeParse({
        workspaceId,
        planId,
        taskId,
        completionNote: '',
        evidenceReferenceIds: [],
        rowVersion: 1,
      }).success,
    ).toBe(false);
    expect(
      setPlanTaskStatusSchema.safeParse({
        workspaceId,
        planId,
        taskId,
        status: 'blocked',
        rowVersion: 1,
      }).success,
    ).toBe(false);
  });

  it('accepts only domain-specific typed references without paths or URLs', () => {
    expect(
      addPlanReferenceSchema.safeParse({
        workspaceId,
        planId,
        taskId,
        target: { type: 'repository', repositoryId: workspaceId },
      }).success,
    ).toBe(true);
    expect(
      addPlanReferenceSchema.safeParse({
        workspaceId,
        planId,
        taskId,
        target: { type: 'repository', repositoryId: workspaceId, path: 'C:/secret' },
      }).success,
    ).toBe(false);
  });
});
