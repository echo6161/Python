import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceResearchPlanPage } from '../../src/renderer/components/workspace/research-plan/WorkspaceResearchPlanPage';
import type { ResearchPlan, ResearchPlanProposal } from '../../src/shared/contracts/research-plan';
import type { Workspace } from '../../src/shared/contracts/workspace';

const workspace: Workspace = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Planning',
  description: '',
  researchGoal: 'Verify the clipping claim',
  status: 'active',
  createdAt: '2026-08-13T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
  rowVersion: 1,
};
const plan: ResearchPlan = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  workspaceId: workspace.id,
  goal: workspace.researchGoal,
  status: 'active',
  version: 4,
  createdAt: workspace.createdAt,
  updatedAt: workspace.updatedAt,
  rowVersion: 4,
  progress: {
    completed: 1,
    eligible: 3,
    percent: 33,
    blocked: 1,
    nextTaskId: '550e8400-e29b-41d4-a716-446655440003',
    explanation:
      'Completed non-retired tasks / all non-retired tasks. This is task progress, not research validity.',
  },
  tasks: [
    {
      id: '550e8400-e29b-41d4-a716-446655440003',
      planId: '550e8400-e29b-41d4-a716-446655440002',
      workspaceId: workspace.id,
      title: 'Read primary paper',
      description: 'Inspect the evidence.',
      status: 'in_progress',
      blockedReason: null,
      displayOrder: 0,
      dependencyIds: [],
      references: [],
      completionEvidence: [],
      completedAt: null,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      rowVersion: 1,
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440004',
      planId: '550e8400-e29b-41d4-a716-446655440002',
      workspaceId: workspace.id,
      title: 'Reproduce result',
      description: 'Run a bounded replication.',
      status: 'blocked',
      blockedReason: 'Waiting for: Read primary paper',
      displayOrder: 1,
      dependencyIds: ['550e8400-e29b-41d4-a716-446655440003'],
      references: [],
      completionEvidence: [],
      completedAt: null,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      rowVersion: 1,
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440005',
      planId: '550e8400-e29b-41d4-a716-446655440002',
      workspaceId: workspace.id,
      title: 'Record conclusion',
      description: 'Preserve the result.',
      status: 'done',
      blockedReason: null,
      displayOrder: 2,
      dependencyIds: [],
      references: [],
      completionEvidence: [],
      completedAt: workspace.updatedAt,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      rowVersion: 2,
    },
  ],
};
const proposal: ResearchPlanProposal = {
  id: '550e8400-e29b-41d4-a716-446655440006',
  workspaceId: workspace.id,
  planId: plan.id,
  baseVersion: plan.version,
  mode: 'adapt',
  goal: plan.goal,
  rationale: 'Add the next bounded action.',
  providerId: 'openai',
  model: 'fake',
  status: 'pending',
  createdAt: workspace.createdAt,
  reviewedAt: null,
  rowVersion: 1,
  changes: [
    {
      id: '550e8400-e29b-41d4-a716-446655440007',
      kind: 'add',
      taskId: null,
      title: 'Compare implementation',
      description: 'Inspect code against the paper.',
      rationale: 'Traceability',
      dependencyTaskIds: [],
      referenceCandidateIds: [],
    },
  ],
};

describe('WorkspaceResearchPlanPage', () => {
  const setStatus = vi.fn();
  const confirmProposal = vi.fn();
  const getActive = vi.fn();
  const createTask = vi.fn();
  const deleteTask = vi.fn();
  beforeEach(() => {
    setStatus.mockReset().mockResolvedValue({ ok: true, value: plan });
    confirmProposal.mockReset().mockResolvedValue({ ok: true, value: plan });
    getActive.mockReset().mockResolvedValue({ ok: true, value: plan });
    createTask.mockReset();
    deleteTask.mockReset();
    Object.defineProperty(window, 'paperMind', {
      configurable: true,
      value: {
        researchPlan: {
          getActive,
          listReferenceCandidates: vi.fn().mockResolvedValue({ ok: true, value: [] }),
          create: vi.fn(),
          update: vi.fn(),
          retire: vi.fn(),
          delete: vi.fn(),
          createTask,
          updateTask: vi.fn(),
          deleteTask,
          reorderTasks: vi.fn().mockResolvedValue({ ok: true, value: plan }),
          setTaskStatus: setStatus,
          completeTask: vi.fn(),
          setDependencies: vi.fn().mockResolvedValue({ ok: true, value: plan }),
          addReference: vi.fn(),
          removeReference: vi.fn(),
          listHistory: vi.fn().mockResolvedValue({ ok: true, value: [] }),
          generateProposal: vi.fn().mockResolvedValue({ ok: true, value: proposal }),
          updateProposal: vi
            .fn()
            .mockResolvedValue({ ok: true, value: { ...proposal, rowVersion: 2 } }),
          confirmProposal,
          rejectProposal: vi
            .fn()
            .mockResolvedValue({ ok: true, value: { ...proposal, status: 'rejected' } }),
        },
      },
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows dense progress, next action, blocked reason and manual status controls', async () => {
    render(<WorkspaceResearchPlanPage workspace={workspace} />);
    await screen.findByText('33%');
    expect(screen.getAllByText('Read primary paper').length).toBeGreaterThan(0);
    expect(screen.getByText('Waiting for: Read primary paper')).toBeTruthy();
    const resultTitle = screen.getAllByText('Reproduce result')[0];
    if (!resultTitle) throw new Error('Expected task title.');
    fireEvent.click(resultTitle);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'in_progress' } });
    await waitFor(() =>
      expect(setStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' })),
    );
  });

  it('keeps Adapt changes in a review dialog until explicit confirmation', async () => {
    render(<WorkspaceResearchPlanPage workspace={workspace} />);
    await screen.findByText('33%');
    fireEvent.click(screen.getByRole('button', { name: 'Adapt' }));
    await screen.findByRole('dialog', { name: 'Review changes before writing the Plan' });
    expect(screen.getByDisplayValue('Compare implementation')).toBeTruthy();
    expect(confirmProposal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm changes' }));
    await waitFor(() => expect(confirmProposal).toHaveBeenCalled());
  });

  it('explains that a title is required instead of silently disabling task creation', async () => {
    render(<WorkspaceResearchPlanPage workspace={workspace} />);
    await screen.findByText('33%');
    fireEvent.click(screen.getByRole('button', { name: 'Task' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Task title is required.');
    expect(createTask).not.toHaveBeenCalled();
  });

  it('uses an in-app task deletion confirmation and restores focus when cancelled', async () => {
    render(<WorkspaceResearchPlanPage workspace={workspace} />);
    const taskTitles = await screen.findAllByText('Read primary paper');
    const taskTitle = taskTitles[0];
    if (!taskTitle) throw new Error('Expected task title.');
    fireEvent.click(taskTitle);
    const deleteButton = screen.getByRole('button', { name: 'Delete task' });
    fireEvent.click(deleteButton);
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete task?' });
    expect(dialog).toBeTruthy();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    const close = screen.getByRole('button', { name: 'Close task deletion' });
    const confirm = screen.getByRole('button', { name: 'Confirm delete task' });
    confirm.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
    cancel.focus();
    expect(deleteTask).not.toHaveBeenCalled();
    fireEvent.click(cancel);
    await waitFor(() => expect(document.activeElement).toBe(deleteButton));
    expect(deleteTask).not.toHaveBeenCalled();
  });

  it('does not submit or close the task dialog while an IME composition is active', async () => {
    render(<WorkspaceResearchPlanPage workspace={workspace} />);
    await screen.findByText('33%');
    fireEvent.click(screen.getByRole('button', { name: 'Task' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add research task' });
    const title = screen.getByLabelText('Title');
    fireEvent.compositionStart(title);
    const accepted = fireEvent.keyDown(title, { key: 'Enter', keyCode: 229 });
    expect(accepted).toBe(false);
    fireEvent.keyDown(title, { key: 'Escape', keyCode: 229 });
    expect(dialog.isConnected).toBe(true);
    expect(createTask).not.toHaveBeenCalled();
    fireEvent.compositionEnd(title);
  });

  it('does not let a delayed empty refresh erase a task created after deleting the last task', async () => {
    const onlyTask = plan.tasks[0];
    if (!onlyTask) throw new Error('Expected fixture task.');
    const initial = planWithTasks(10, [onlyTask]);
    const empty = planWithTasks(11, []);
    const replacement = {
      ...onlyTask,
      id: '550e8400-e29b-41d4-a716-446655440008',
      title: 'Replacement task',
      status: 'todo' as const,
      rowVersion: 1,
    };
    const created = planWithTasks(12, [replacement]);
    let resolveStale: (value: { readonly ok: true; readonly value: ResearchPlan }) => void = () =>
      undefined;
    const stale = new Promise<{ readonly ok: true; readonly value: ResearchPlan }>((resolve) => {
      resolveStale = resolve;
    });
    getActive
      .mockResolvedValueOnce({ ok: true, value: initial })
      .mockReturnValueOnce(stale)
      .mockResolvedValue({ ok: true, value: created });
    deleteTask.mockResolvedValue({ ok: true, value: empty });
    createTask.mockResolvedValue({ ok: true, value: created });
    render(<WorkspaceResearchPlanPage workspace={workspace} />);
    const initialTaskTitles = await screen.findAllByText('Read primary paper');
    const initialTaskTitle = initialTaskTitles[0];
    if (!initialTaskTitle) throw new Error('Expected initial task title.');
    fireEvent.click(initialTaskTitle);
    fireEvent.click(screen.getByRole('button', { name: 'Delete task' }));
    expect(await screen.findByRole('alertdialog', { name: 'Delete task?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete task' }));
    await screen.findByText('No tasks yet. Add the first concrete research action.');
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Task' })),
    );
    await waitFor(() => expect(getActive).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Task' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Title')));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Replacement task' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect((await screen.findAllByText('Replacement task')).length).toBeGreaterThan(0);
    await waitFor(() => expect(getActive).toHaveBeenCalledTimes(3));
    await act(async () => {
      resolveStale({ ok: true, value: empty });
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.queryAllByText('Replacement task').length).toBeGreaterThan(0),
    );
    expect(screen.queryByText('No tasks yet. Add the first concrete research action.')).toBeNull();
  });
});

function planWithTasks(version: number, tasks: ResearchPlan['tasks']): ResearchPlan {
  const eligible = tasks.filter(({ status }) => status !== 'retired');
  const completed = eligible.filter(({ status }) => status === 'done').length;
  return {
    ...plan,
    version,
    rowVersion: version,
    tasks,
    progress: {
      ...plan.progress,
      completed,
      eligible: eligible.length,
      percent: eligible.length ? Math.floor((completed / eligible.length) * 100) : 0,
      blocked: 0,
      nextTaskId:
        tasks.find(({ status }) => status === 'in_progress')?.id ??
        tasks.find(({ status }) => status === 'todo')?.id ??
        null,
    },
  };
}
