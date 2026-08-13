import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import {
  Archive,
  Bot,
  CheckCircle2,
  Clock3,
  History,
  Link2,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';

import type {
  PlanReferenceCandidate,
  PlanTask,
  PlanTaskStatus,
  ResearchPlan,
  ResearchPlanHistoryEntry,
  ResearchPlanProposal,
} from '../../../../shared/contracts/research-plan';
import type { Workspace } from '../../../../shared/contracts/workspace';
import { rendererLogger } from '../../../logger';
import type { ApiResult } from '../../../../shared/contracts/library';
import { PlanProposalDialog } from './PlanProposalDialog';
import { PlanTaskDeleteDialog } from './PlanTaskDeleteDialog';
import { PlanTaskList } from './PlanTaskList';

interface PendingTaskDeletion {
  readonly returnFocusTo: HTMLButtonElement;
  readonly task: PlanTask;
}

export function WorkspaceResearchPlanPage({ workspace }: { readonly workspace: Workspace }) {
  const [plan, setPlan] = useState<ResearchPlan | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<readonly PlanReferenceCandidate[]>([]);
  const [proposal, setProposal] = useState<ResearchPlanProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [goal, setGoal] = useState('');
  const [completionNote, setCompletionNote] = useState('');
  const [proposalInstruction, setProposalInstruction] = useState(
    'Prioritize the next verifiable research actions.',
  );
  const [history, setHistory] = useState<readonly ResearchPlanHistoryEntry[] | null>(null);
  const [taskPendingDelete, setTaskPendingDelete] = useState<PendingTaskDeletion | null>(null);
  const planRef = useRef<ResearchPlan | null>(null);
  const refreshSequenceRef = useRef(0);
  const mutationSequenceRef = useRef(0);
  const lifecycleRef = useRef(0);
  const scheduledRefreshRef = useRef<number | null>(null);
  const workspaceIdRef = useRef(workspace.id);
  const addTaskButtonRef = useRef<HTMLButtonElement>(null);
  workspaceIdRef.current = workspace.id;
  const selected = plan?.tasks.find(({ id }) => id === selectedId) ?? null;

  const applyPlan = useCallback(
    (next: ResearchPlan | null): boolean => {
      if (next && next.workspaceId !== workspaceIdRef.current) return false;
      const current = planRef.current;
      if (
        current?.id === next?.id &&
        next &&
        next.version < (current?.version ?? Number.NEGATIVE_INFINITY)
      )
        return false;
      planRef.current = next;
      setPlan(next);
      setGoal(next?.goal ?? workspace.researchGoal);
      setSelectedId((selectedTaskId) =>
        selectedTaskId && next?.tasks.some(({ id }) => id === selectedTaskId)
          ? selectedTaskId
          : next
            ? nextSelectedTaskId(next)
            : null,
      );
      return true;
    },
    [workspace.researchGoal],
  );

  const load = useCallback(async () => {
    if (workspace.id !== workspaceIdRef.current) return;
    const requestedWorkspaceId = workspace.id;
    const lifecycle = lifecycleRef.current;
    const refreshSequence = ++refreshSequenceRef.current;
    setError(null);
    try {
      const [planResult, candidateResult] = await Promise.all([
        window.paperMind.researchPlan.getActive(workspace.id),
        window.paperMind.researchPlan.listReferenceCandidates(workspace.id),
      ]);
      if (
        lifecycle !== lifecycleRef.current ||
        refreshSequence !== refreshSequenceRef.current ||
        requestedWorkspaceId !== workspaceIdRef.current
      )
        return;
      if (!planResult.ok) return setError(planResult.error.message);
      if (!candidateResult.ok) return setError(candidateResult.error.message);
      applyPlan(planResult.value);
      setCandidates(candidateResult.value);
    } catch (caught) {
      if (
        lifecycle !== lifecycleRef.current ||
        refreshSequence !== refreshSequenceRef.current ||
        requestedWorkspaceId !== workspaceIdRef.current
      )
        return;
      rendererLogger.error('Unable to load Research Plan', caught);
      setError('The Research Plan could not be loaded.');
    }
  }, [applyPlan, workspace.id]);
  useEffect(() => {
    const lifecycle = lifecycleRef.current;
    return () => {
      lifecycleRef.current = lifecycle + 1;
      if (scheduledRefreshRef.current !== null) window.clearTimeout(scheduledRefreshRef.current);
    };
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const runPlan = async (
    operation: () => Promise<
      | { readonly ok: true; readonly value: ResearchPlan }
      | { readonly ok: false; readonly error: { readonly message: string } }
    >,
  ) => {
    const requestedWorkspaceId = workspace.id;
    const lifecycle = lifecycleRef.current;
    const mutationSequence = ++mutationSequenceRef.current;
    let succeeded = false;
    ++refreshSequenceRef.current;
    setBusy(true);
    setError(null);
    try {
      const result = await operation();
      if (
        lifecycle !== lifecycleRef.current ||
        requestedWorkspaceId !== workspaceIdRef.current ||
        mutationSequence !== mutationSequenceRef.current
      )
        return false;
      if (!result.ok) setError(result.error.message);
      else {
        succeeded = applyPlan(result.value);
      }
      return result.ok && succeeded;
    } catch (caught) {
      if (
        lifecycle !== lifecycleRef.current ||
        requestedWorkspaceId !== workspaceIdRef.current ||
        mutationSequence !== mutationSequenceRef.current
      )
        return false;
      rendererLogger.error('Research Plan action failed', caught);
      setError('The Research Plan action could not be completed.');
      return false;
    } finally {
      if (
        lifecycle === lifecycleRef.current &&
        requestedWorkspaceId === workspaceIdRef.current &&
        mutationSequence === mutationSequenceRef.current
      ) {
        setBusy(false);
        if (succeeded) {
          if (scheduledRefreshRef.current !== null)
            window.clearTimeout(scheduledRefreshRef.current);
          scheduledRefreshRef.current = window.setTimeout(() => {
            scheduledRefreshRef.current = null;
            if (
              lifecycle === lifecycleRef.current &&
              requestedWorkspaceId === workspaceIdRef.current
            )
              void load();
          }, 0);
        }
      }
    }
  };

  const deletePlan = async () => {
    if (!plan) return;
    const requestedWorkspaceId = workspace.id;
    const requestedPlanId = plan.id;
    const lifecycle = lifecycleRef.current;
    const mutationSequence = ++mutationSequenceRef.current;
    ++refreshSequenceRef.current;
    setBusy(true);
    setError(null);
    try {
      const result = await window.paperMind.researchPlan.delete({
        workspaceId: requestedWorkspaceId,
        planId: requestedPlanId,
        confirmation: 'DELETE_RESEARCH_PLAN',
      });
      if (
        lifecycle !== lifecycleRef.current ||
        requestedWorkspaceId !== workspaceIdRef.current ||
        mutationSequence !== mutationSequenceRef.current
      )
        return;
      if (result.ok) applyPlan(null);
      else setError(result.error.message);
    } catch (caught) {
      if (
        lifecycle !== lifecycleRef.current ||
        requestedWorkspaceId !== workspaceIdRef.current ||
        mutationSequence !== mutationSequenceRef.current
      )
        return;
      rendererLogger.error('Research Plan deletion failed', caught);
      setError('The Research Plan could not be deleted.');
    } finally {
      if (
        lifecycle === lifecycleRef.current &&
        requestedWorkspaceId === workspaceIdRef.current &&
        mutationSequence === mutationSequenceRef.current
      )
        setBusy(false);
    }
  };

  const orderedIds = plan?.tasks.map(({ id }) => id) ?? [];
  const move = (id: string, offset: -1 | 1) => {
    if (!plan) return;
    const from = orderedIds.indexOf(id);
    const to = from + offset;
    if (to < 0 || to >= orderedIds.length) return;
    const ids = [...orderedIds];
    const fromId = ids[from];
    const toId = ids[to];
    if (!fromId || !toId) return;
    ids[from] = toId;
    ids[to] = fromId;
    void runPlan(() =>
      window.paperMind.researchPlan.reorderTasks({
        workspaceId: workspace.id,
        planId: plan.id,
        taskIds: ids,
      }),
    );
  };

  if (!plan)
    return (
      <EmptyPlan
        busy={busy}
        error={error}
        goal={goal}
        setGoal={setGoal}
        onCreate={() =>
          void runPlan(() =>
            window.paperMind.researchPlan.create({ workspaceId: workspace.id, goal }),
          )
        }
        onGenerate={() => void generateProposal('generate')}
      />
    );

  async function generateProposal(mode: 'adapt' | 'generate') {
    setBusy(true);
    setError(null);
    try {
      const result = await window.paperMind.researchPlan.generateProposal({
        workspaceId: workspace.id,
        mode,
        instruction: proposalInstruction,
      });
      if (!result.ok) setError(result.error.message);
      else setProposal(result.value);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="research-plan-page flex h-full min-w-0 flex-col bg-[#0b1017]">
      {error ? (
        <div
          className="mx-4 mt-3 border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      <header className="grid shrink-0 gap-3 border-b border-zinc-800 px-4 py-3 xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-zinc-100">Adaptive Research Plan</h2>
            <span className="text-xs text-zinc-500">v{plan.version}</span>
          </div>
          <div className="mt-2 flex gap-2">
            <input
              aria-label="Plan goal"
              className="form-input h-9 min-w-0 flex-1"
              maxLength={4000}
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
            />
            <button
              aria-label="Save plan goal"
              className="icon-button"
              disabled={busy || !goal.trim()}
              type="button"
              onClick={() =>
                void runPlan(() =>
                  window.paperMind.researchPlan.update({
                    workspaceId: workspace.id,
                    planId: plan.id,
                    goal,
                    rowVersion: plan.rowVersion,
                  }),
                )
              }
            >
              <Save aria-hidden="true" className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <button
            ref={addTaskButtonRef}
            className="secondary-button inline-flex items-center gap-2"
            disabled={busy}
            type="button"
            onClick={() => {
              setError(null);
              setShowTaskForm(true);
            }}
          >
            <Plus aria-hidden="true" className="size-4" /> Task
          </button>
          <button
            className="secondary-button inline-flex items-center gap-2"
            disabled={busy}
            type="button"
            onClick={() => void generateProposal('adapt')}
          >
            <Bot aria-hidden="true" className="size-4" /> Adapt
          </button>
          <button
            aria-label="Retire plan"
            className="icon-button"
            disabled={busy}
            title="Retire Plan"
            type="button"
            onClick={() => {
              if (window.confirm('Retire this Plan? It will become read-only.'))
                void runPlan(() =>
                  window.paperMind.researchPlan.retire({
                    workspaceId: workspace.id,
                    planId: plan.id,
                    rowVersion: plan.rowVersion,
                  }),
                );
            }}
          >
            <Archive aria-hidden="true" className="size-4" />
          </button>
          <button
            className="research-plan-danger-button"
            disabled={busy}
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  'Delete this PaperMind Plan and its tasks? External papers, questions, memories, and repositories are not deleted.',
                )
              )
                void deletePlan();
            }}
          >
            <Trash2 aria-hidden="true" className="size-4" /> Delete plan
          </button>
        </div>
      </header>
      <PlanSummary plan={plan} />
      <div className="grid min-h-0 flex-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="min-h-0 overflow-y-auto border-r border-zinc-800">
          <PlanTaskList
            tasks={plan.tasks}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={move}
          />
        </section>
        <aside
          className={`min-h-0 overflow-y-auto bg-[#0d131c] max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-40 max-xl:w-[min(440px,92vw)] max-xl:border-l max-xl:border-zinc-700 max-xl:shadow-2xl ${selected ? '' : 'max-xl:hidden'}`}
          aria-label="Task detail"
        >
          {selected ? (
            <TaskDetail
              task={selected}
              plan={plan}
              candidates={candidates}
              busy={busy}
              completionNote={completionNote}
              setCompletionNote={setCompletionNote}
              onClose={() => setSelectedId(null)}
              onHistory={() =>
                void (async () => {
                  const result = await window.paperMind.researchPlan.listHistory({
                    workspaceId: workspace.id,
                    planId: plan.id,
                  });
                  if (result.ok) setHistory(result.value);
                  else setError(result.error.message);
                })()
              }
              onRequestDelete={(task, returnFocusTo) =>
                setTaskPendingDelete({ task, returnFocusTo })
              }
              runPlan={runPlan}
            />
          ) : (
            <p className="p-5 text-sm text-zinc-500">
              Select a task to inspect details and sources.
            </p>
          )}
        </aside>
      </div>
      {showTaskForm ? (
        <TaskDialog
          busy={busy}
          error={error}
          title={taskTitle}
          description={taskDescription}
          setTitle={setTaskTitle}
          setDescription={setTaskDescription}
          onCancel={() => setShowTaskForm(false)}
          onSave={(title, description) =>
            void (async () => {
              const ok = await runPlan(() =>
                window.paperMind.researchPlan.createTask({
                  workspaceId: workspace.id,
                  planId: plan.id,
                  title,
                  description,
                }),
              );
              if (ok) {
                setTaskTitle('');
                setTaskDescription('');
                setShowTaskForm(false);
              }
            })()
          }
        />
      ) : null}
      {taskPendingDelete ? (
        <PlanTaskDeleteDialog
          busy={busy}
          error={error}
          returnFocusTo={taskPendingDelete.returnFocusTo}
          taskTitle={taskPendingDelete.task.title}
          onCancel={() => setTaskPendingDelete(null)}
          onConfirm={() =>
            void (async () => {
              const { task } = taskPendingDelete;
              const ok = await runPlan(() =>
                window.paperMind.researchPlan.deleteTask({
                  workspaceId: task.workspaceId,
                  planId: task.planId,
                  taskId: task.id,
                  confirmation: 'DELETE_PLAN_TASK',
                }),
              );
              if (ok) {
                setTaskPendingDelete(null);
                window.setTimeout(() => addTaskButtonRef.current?.focus(), 0);
              }
            })()
          }
        />
      ) : null}
      {proposal ? (
        <PlanProposalDialog
          proposal={proposal}
          busy={busy}
          onReject={() =>
            void (async () => {
              const result = await window.paperMind.researchPlan.rejectProposal({
                workspaceId: workspace.id,
                proposalId: proposal.id,
                rowVersion: proposal.rowVersion,
              });
              if (result.ok) setProposal(null);
              else setError(result.error.message);
            })()
          }
          onConfirm={(draft) =>
            void (async () => {
              setBusy(true);
              const updated = await window.paperMind.researchPlan.updateProposal({
                workspaceId: workspace.id,
                proposalId: proposal.id,
                goal: draft.goal,
                rationale: draft.rationale,
                changes: draft.changes,
                rowVersion: proposal.rowVersion,
              });
              setBusy(false);
              if (!updated.ok) {
                setError(updated.error.message);
                return;
              }
              const ok = await runPlan(() =>
                window.paperMind.researchPlan.confirmProposal({
                  workspaceId: workspace.id,
                  proposalId: updated.value.id,
                  rowVersion: updated.value.rowVersion,
                }),
              );
              if (ok) setProposal(null);
            })()
          }
        />
      ) : null}
      {history ? <HistoryDialog entries={history} onClose={() => setHistory(null)} /> : null}
      <input
        className="sr-only"
        aria-label="AI adaptation instruction"
        value={proposalInstruction}
        onChange={(event) => setProposalInstruction(event.target.value)}
      />
    </div>
  );
}

function nextSelectedTaskId(plan: ResearchPlan): string | null {
  return (
    plan.progress.nextTaskId ??
    plan.tasks.find(({ status }) => status !== 'done' && status !== 'retired')?.id ??
    plan.tasks[0]?.id ??
    null
  );
}

function PlanSummary({ plan }: { readonly plan: ResearchPlan }) {
  const next = plan.tasks.find(({ id }) => id === plan.progress.nextTaskId);
  return (
    <section
      className="grid shrink-0 grid-cols-2 border-b border-zinc-800 md:grid-cols-4"
      aria-label="Plan summary"
    >
      <Metric
        label="Task progress"
        value={`${String(plan.progress.percent)}%`}
        detail={`${String(plan.progress.completed)}/${String(plan.progress.eligible)} completed`}
      />
      <Metric
        label="Next action"
        value={next?.title ?? 'None ready'}
        detail="first unblocked task"
      />
      <Metric
        label="Blocked"
        value={String(plan.progress.blocked)}
        detail="explicit or dependency blocked"
      />
      <Metric label="History" value={`v${String(plan.version)}`} detail="canonical snapshots" />
      <p className="col-span-full border-t border-zinc-800 px-4 py-1.5 text-[11px] text-zinc-600">
        {plan.progress.explanation}
      </p>
    </section>
  );
}
function Metric({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}) {
  return (
    <div className="min-w-0 border-r border-zinc-800 px-4 py-2.5">
      <p className="text-[11px] uppercase text-zinc-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-zinc-100">{value}</p>
      <p className="truncate text-xs text-zinc-600">{detail}</p>
    </div>
  );
}

function TaskDetail({
  task,
  plan,
  candidates,
  busy,
  completionNote,
  setCompletionNote,
  onClose,
  onHistory,
  onRequestDelete,
  runPlan,
}: {
  readonly task: PlanTask;
  readonly plan: ResearchPlan;
  readonly candidates: readonly PlanReferenceCandidate[];
  readonly busy: boolean;
  readonly completionNote: string;
  readonly setCompletionNote: (value: string) => void;
  readonly onClose: () => void;
  readonly onHistory: () => void;
  readonly onRequestDelete: (task: PlanTask, returnFocusTo: HTMLButtonElement) => void;
  readonly runPlan: (operation: () => Promise<ApiResult<ResearchPlan>>) => Promise<boolean>;
}) {
  const [referenceId, setReferenceId] = useState('');
  const dependencies = useMemo(
    () => plan.tasks.filter(({ id }) => id !== task.id),
    [plan.tasks, task.id],
  );
  const status = (value: PlanTaskStatus): Exclude<PlanTaskStatus, 'done'> | undefined =>
    value === 'done' ? undefined : value;
  return (
    <div className="p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase text-sky-400">Current task</p>
          <h3 className="mt-1 text-base font-semibold text-zinc-100">{task.title}</h3>
        </div>
        <button
          aria-label="Close task detail"
          className="icon-button xl:hidden"
          type="button"
          onClick={onClose}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </header>
      <p className="mt-3 text-sm leading-6 text-zinc-400">
        {task.description || 'No detail recorded.'}
      </p>
      <label className="mt-5 block text-xs font-semibold text-zinc-400">
        Status
        <select
          className="form-input mt-1 h-9 w-full"
          disabled={busy}
          value={task.status}
          onChange={(event) => {
            const next = status(event.target.value as PlanTaskStatus);
            if (next)
              void runPlan(() =>
                window.paperMind.researchPlan.setTaskStatus({
                  workspaceId: task.workspaceId,
                  planId: task.planId,
                  taskId: task.id,
                  status: next,
                  ...(next === 'blocked' ? { blockedReason: 'Blocked pending user review.' } : {}),
                  rowVersion: task.rowVersion,
                }),
              );
          }}
        >
          <option value="todo">Todo</option>
          <option value="in_progress">In progress</option>
          <option value="blocked">Blocked</option>
          <option value="done" disabled>
            Done (use completion)
          </option>
          <option value="retired">Retired</option>
        </select>
      </label>
      <div className="mt-5">
        <p className="text-xs font-semibold text-zinc-400">Dependencies</p>
        <div className="mt-2 space-y-1">
          {dependencies.map((dependency) => (
            <label className="flex items-center gap-2 text-sm text-zinc-400" key={dependency.id}>
              <input
                type="checkbox"
                checked={task.dependencyIds.includes(dependency.id)}
                onChange={() => {
                  const ids = task.dependencyIds.includes(dependency.id)
                    ? task.dependencyIds.filter((id) => id !== dependency.id)
                    : [...task.dependencyIds, dependency.id];
                  void runPlan(() =>
                    window.paperMind.researchPlan.setDependencies({
                      workspaceId: task.workspaceId,
                      planId: task.planId,
                      taskId: task.id,
                      dependencyIds: ids,
                    }),
                  );
                }}
              />{' '}
              <span className="truncate">{dependency.title}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="mt-5">
        <p className="flex items-center gap-1 text-xs font-semibold text-zinc-400">
          <Link2 aria-hidden="true" className="size-3" /> Sources
        </p>
        <ul className="mt-2 space-y-2">
          {task.references.map((reference) => (
            <li className="border border-zinc-800 p-2 text-xs" key={reference.id}>
              <p className="font-medium text-zinc-200">{reference.citation}</p>
              <p
                className={
                  reference.availability === 'available' ? 'text-zinc-500' : 'text-amber-400'
                }
              >
                {reference.availability}
                {reference.availabilityReason ? `: ${reference.availabilityReason}` : ''}
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <select
            aria-label="Add source"
            className="form-input h-9 min-w-0 flex-1"
            value={referenceId}
            onChange={(event) => setReferenceId(event.target.value)}
          >
            <option value="">Select source...</option>
            {candidates.map((candidate) => (
              <option
                disabled={
                  candidate.availability === 'unavailable' ||
                  task.references.some(
                    ({ target }) => JSON.stringify(target) === JSON.stringify(candidate.target),
                  )
                }
                key={candidate.id}
                value={candidate.id}
              >
                {candidate.type}: {candidate.title}
              </option>
            ))}
          </select>
          <button
            aria-label="Add source"
            className="icon-button"
            disabled={!referenceId || busy}
            type="button"
            onClick={() => {
              const candidate = candidates.find(({ id }) => id === referenceId);
              if (candidate)
                void runPlan(() =>
                  window.paperMind.researchPlan.addReference({
                    workspaceId: task.workspaceId,
                    planId: task.planId,
                    taskId: task.id,
                    target: candidate.target,
                  }),
                );
            }}
          >
            <Plus aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
      {task.status !== 'done' && task.status !== 'retired' ? (
        <div className="mt-5 border-t border-zinc-800 pt-4">
          <label className="text-xs font-semibold text-zinc-400">
            Completion note
            <textarea
              className="form-input mt-1 min-h-20 w-full resize-none"
              maxLength={4000}
              value={completionNote}
              onChange={(event) => setCompletionNote(event.target.value)}
            />
          </label>
          <button
            className="primary-button mt-2 inline-flex items-center gap-2"
            disabled={busy || !completionNote.trim()}
            type="button"
            onClick={() =>
              void runPlan(() =>
                window.paperMind.researchPlan.completeTask({
                  workspaceId: task.workspaceId,
                  planId: task.planId,
                  taskId: task.id,
                  completionNote,
                  evidenceReferenceIds: task.references.map(({ id }) => id),
                  rowVersion: task.rowVersion,
                }),
              )
            }
          >
            <CheckCircle2 aria-hidden="true" className="size-4" /> Complete with evidence
          </button>
        </div>
      ) : null}
      <div className="mt-6 flex gap-2 border-t border-zinc-800 pt-4">
        <button
          className="secondary-button inline-flex items-center gap-2"
          type="button"
          onClick={onHistory}
        >
          <History aria-hidden="true" className="size-4" /> History
        </button>
        {task.status !== 'done' ? (
          <button
            className="research-plan-danger-button"
            disabled={busy}
            type="button"
            onClick={(event) => onRequestDelete(task, event.currentTarget)}
          >
            <Trash2 aria-hidden="true" className="size-4" /> Delete task
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EmptyPlan({
  busy,
  error,
  goal,
  setGoal,
  onCreate,
  onGenerate,
}: {
  readonly busy: boolean;
  readonly error: string | null;
  readonly goal: string;
  readonly setGoal: (value: string) => void;
  readonly onCreate: () => void;
  readonly onGenerate: () => void;
}) {
  return (
    <div className="research-plan-page grid h-full place-items-center p-6">
      <section className="w-full max-w-2xl border border-zinc-800 bg-[#0d131c] p-6">
        <Clock3 aria-hidden="true" className="size-7 text-sky-400" />
        <h2 className="mt-3 text-xl font-semibold">Define the next research actions</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Start manually without AI, or request a proposal that remains pending until you confirm
          it.
        </p>
        {error ? (
          <p className="mt-3 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        <label className="mt-5 block text-xs font-semibold text-zinc-400">
          Plan goal
          <textarea
            className="form-input mt-1 min-h-24 w-full resize-none"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
          />
        </label>
        <div className="mt-4 flex gap-2">
          <button
            className="primary-button"
            disabled={busy || !goal.trim()}
            type="button"
            onClick={onCreate}
          >
            Create manually
          </button>
          <button
            className="secondary-button inline-flex items-center gap-2"
            disabled={busy}
            type="button"
            onClick={onGenerate}
          >
            <Bot aria-hidden="true" className="size-4" /> Generate proposal
          </button>
        </div>
      </section>
    </div>
  );
}
function TaskDialog({
  busy,
  error,
  title,
  description,
  setTitle,
  setDescription,
  onCancel,
  onSave,
}: {
  readonly busy: boolean;
  readonly error: string | null;
  readonly title: string;
  readonly description: string;
  readonly setTitle: (value: string) => void;
  readonly setDescription: (value: string) => void;
  readonly onCancel: () => void;
  readonly onSave: (title: string, description: string) => void;
}) {
  const [showTitleError, setShowTitleError] = useState(false);
  const composingRef = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timer = window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  const save = (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const nextTitle = titleRef.current?.value ?? title;
    const nextDescription = descriptionRef.current?.value ?? description;
    if (!nextTitle.trim()) {
      setShowTitleError(true);
      titleRef.current?.focus();
      return;
    }
    onSave(nextTitle, nextDescription);
  };
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      role="presentation"
      onKeyDown={(event) => {
        const composing = composingRef.current || event.nativeEvent.isComposing;
        if (event.key === 'Escape' && !composing && !busy) onCancel();
      }}
    >
      <section
        className="w-full max-w-lg border border-zinc-700 bg-[#0d131c] p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-task-title"
      >
        <h2 className="text-lg font-semibold" id="new-task-title">
          Add research task
        </h2>
        {error ? (
          <p
            className="mt-3 border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <form onSubmit={save}>
          <label className="mt-4 block text-xs text-zinc-400">
            Title
            <input
              ref={titleRef}
              aria-describedby={showTitleError ? 'new-task-title-error' : undefined}
              aria-invalid={showTitleError}
              className="form-input mt-1 h-9 w-full"
              maxLength={300}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (event.target.value.trim()) setShowTitleError(false);
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
              }}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  (composingRef.current ||
                    event.nativeEvent.isComposing ||
                    Reflect.get(event.nativeEvent, 'keyCode') === 229)
                )
                  event.preventDefault();
              }}
            />
          </label>
          {showTitleError ? (
            <p className="mt-1 text-xs text-red-300" id="new-task-title-error" role="alert">
              Task title is required.
            </p>
          ) : null}
          <label className="mt-3 block text-xs text-zinc-400">
            Description
            <textarea
              ref={descriptionRef}
              className="form-input mt-1 min-h-24 w-full resize-none"
              maxLength={10000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button className="secondary-button" disabled={busy} type="button" onClick={onCancel}>
              Cancel
            </button>
            <button className="primary-button" disabled={busy} type="submit">
              Add task
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function HistoryDialog({
  entries,
  onClose,
}: {
  readonly entries: readonly ResearchPlanHistoryEntry[];
  readonly onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <section
        aria-labelledby="plan-history-title"
        aria-modal="true"
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col border border-zinc-700 bg-[#0d131c]"
        role="dialog"
      >
        <header className="flex items-center justify-between border-b border-zinc-800 p-4">
          <div>
            <h2 className="font-semibold" id="plan-history-title">
              Plan history
            </h2>
            <p className="text-xs text-zinc-500">Immutable canonical snapshots</p>
          </div>
          <button
            aria-label="Close plan history"
            className="icon-button"
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </header>
        <ol className="min-h-0 divide-y divide-zinc-800 overflow-y-auto">
          {entries.map((entry) => (
            <li
              className="grid grid-cols-[56px_minmax(0,1fr)_auto] gap-3 p-3 text-sm"
              key={entry.id}
            >
              <span className="font-mono text-sky-400">v{entry.version}</span>
              <div>
                <p className="font-medium text-zinc-200">{entry.summary}</p>
                <p className="text-xs text-zinc-500">
                  {entry.changeKind.replaceAll('_', ' ')} · {entry.actor}
                </p>
              </div>
              <time className="text-xs text-zinc-600">
                {new Date(entry.createdAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
