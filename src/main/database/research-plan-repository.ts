import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import type {
  CreatePlanTaskInput,
  CreateResearchPlanInput,
  PlanCompletionEvidence,
  PlanProgress,
  PlanReference,
  PlanReferenceTarget,
  PlanTask,
  PlanTaskIdentityInput,
  PlanTaskStatus,
  ResearchPlan,
  ResearchPlanHistoryEntry,
  ResearchPlanProposal,
  SetPlanDependenciesInput,
  UpdatePlanTaskInput,
  UpdateResearchPlanInput,
} from '../../shared/contracts/research-plan';
import { LibraryError } from '../library/errors';
import type {
  StoredPlanProposalInput,
  StoredPlanReferenceInput,
} from '../research-plan/research-plan-data-gateway';

interface PlanRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly goal: string;
  readonly status: 'active' | 'retired';
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface TaskRow {
  readonly id: string;
  readonly plan_id: string;
  readonly workspace_id: string;
  readonly title: string;
  readonly description: string;
  readonly status: PlanTaskStatus;
  readonly blocked_reason: string | null;
  readonly display_order: number;
  readonly completed_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly row_version: number;
}

interface ReferenceRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly task_id: string;
  readonly source_type: PlanReference['type'];
  readonly source_key: string;
  readonly title: string;
  readonly citation: string;
  readonly target_json: string;
  readonly snapshot_identity: string | null;
  readonly display_order: number;
  readonly created_at: string;
}

interface EvidenceRow extends Omit<ReferenceRow, 'display_order'> {
  readonly note: string;
}

interface ProposalRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly plan_id: string | null;
  readonly base_version: number | null;
  readonly mode: 'adapt' | 'generate';
  readonly goal: string;
  readonly rationale: string;
  readonly changes_json: string;
  readonly provider_id: 'codex' | 'openai';
  readonly model_name: string;
  readonly status: ResearchPlanProposal['status'];
  readonly created_at: string;
  readonly reviewed_at: string | null;
  readonly row_version: number;
}

const PLAN_SELECT = `SELECT id, workspace_id, goal, status, version, created_at, updated_at,
  row_version FROM research_plans`;
const TASK_SELECT = `SELECT id, plan_id, workspace_id, title, description, status,
  blocked_reason, display_order, completed_at, created_at, updated_at, row_version FROM plan_tasks`;
const REFERENCE_SELECT = `SELECT id, workspace_id, task_id, source_type, source_key, title,
  citation, target_json, snapshot_identity, display_order, created_at FROM plan_references`;
const PROPOSAL_SELECT = `SELECT id, workspace_id, plan_id, base_version, mode, goal, rationale,
  changes_json, provider_id, model_name, status, created_at, reviewed_at, row_version
  FROM research_plan_proposals`;

export class ResearchPlanRepository {
  public constructor(private readonly database: Database.Database) {}

  public getActive(workspaceId: string): ResearchPlan | null {
    const row = this.database
      .prepare(`${PLAN_SELECT} WHERE workspace_id = ? AND status = 'active'`)
      .get(workspaceId) as PlanRow | undefined;
    return row ? this.mapPlan(row) : null;
  }

  public get(workspaceId: string, planId: string): ResearchPlan | null {
    const row = this.database
      .prepare(`${PLAN_SELECT} WHERE workspace_id = ? AND id = ?`)
      .get(workspaceId, planId) as PlanRow | undefined;
    return row ? this.mapPlan(row) : null;
  }

  public create(input: CreateResearchPlanInput): ResearchPlan {
    this.requireMutableWorkspace(input.workspaceId);
    if (this.getActive(input.workspaceId)) {
      throw new LibraryError('CONFLICT', 'This Workspace already has an active Research Plan.');
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO research_plans
        (id, workspace_id, goal, status, version, created_at, updated_at, row_version)
        VALUES (?, ?, ?, 'active', 1, ?, ?, 1)`,
      )
      .run(id, input.workspaceId, input.goal, now, now);
    const plan = this.require(input.workspaceId, id);
    this.recordHistory(plan, 'user', 'create', 'Created the Research Plan.');
    return plan;
  }

  public update(input: UpdateResearchPlanInput): ResearchPlan {
    return this.mutate(
      input.workspaceId,
      input.planId,
      'update_goal',
      'Updated the plan goal.',
      () => {
        const result = this.database
          .prepare(
            `UPDATE research_plans SET goal = ?, row_version = row_version + 1
          WHERE id = ? AND workspace_id = ? AND status = 'active' AND row_version = ?`,
          )
          .run(input.goal, input.planId, input.workspaceId, input.rowVersion);
        if (result.changes !== 1) this.throwMissingOrConflict(input.workspaceId, input.planId);
      },
    );
  }

  public retire(input: {
    readonly workspaceId: string;
    readonly planId: string;
    readonly rowVersion: number;
  }): ResearchPlan {
    return this.mutate(
      input.workspaceId,
      input.planId,
      'retire',
      'Retired the Research Plan.',
      () => {
        const result = this.database
          .prepare(
            `UPDATE research_plans SET status = 'retired', row_version = row_version + 1
          WHERE id = ? AND workspace_id = ? AND status = 'active' AND row_version = ?`,
          )
          .run(input.planId, input.workspaceId, input.rowVersion);
        if (result.changes !== 1) this.throwMissingOrConflict(input.workspaceId, input.planId);
      },
    );
  }

  public delete(workspaceId: string, planId: string): boolean {
    this.requireWorkspace(workspaceId);
    return (
      this.database
        .prepare('DELETE FROM research_plans WHERE id = ? AND workspace_id = ?')
        .run(planId, workspaceId).changes === 1
    );
  }

  public createTask(input: CreatePlanTaskInput): ResearchPlan {
    return this.mutate(
      input.workspaceId,
      input.planId,
      'add_task',
      `Added task: ${input.title}`,
      () => {
        this.requireActive(input.workspaceId, input.planId);
        const order = (
          this.database
            .prepare(
              'SELECT COALESCE(MAX(display_order), -1) + 1 AS value FROM plan_tasks WHERE plan_id = ?',
            )
            .get(input.planId) as { readonly value: number }
        ).value;
        const now = new Date().toISOString();
        this.database
          .prepare(
            `INSERT INTO plan_tasks
          (id, plan_id, workspace_id, title, description, status, blocked_reason,
           display_order, completed_at, created_at, updated_at, row_version)
          VALUES (?, ?, ?, ?, ?, 'todo', NULL, ?, NULL, ?, ?, 1)`,
          )
          .run(
            randomUUID(),
            input.planId,
            input.workspaceId,
            input.title,
            input.description,
            order,
            now,
            now,
          );
      },
    );
  }

  public updateTask(input: UpdatePlanTaskInput): ResearchPlan {
    return this.mutate(
      input.workspaceId,
      input.planId,
      'update_task',
      `Updated task: ${input.title}`,
      () => {
        this.requireActive(input.workspaceId, input.planId);
        const result = this.database
          .prepare(
            `UPDATE plan_tasks
        SET title = ?, description = ?, updated_at = ?, row_version = row_version + 1
        WHERE id = ? AND plan_id = ? AND workspace_id = ? AND row_version = ?`,
          )
          .run(
            input.title,
            input.description,
            new Date().toISOString(),
            input.taskId,
            input.planId,
            input.workspaceId,
            input.rowVersion,
          );
        if (result.changes !== 1)
          throw new LibraryError('CONFLICT', 'The Plan task changed or no longer exists.');
      },
    );
  }

  public deleteTask(input: PlanTaskIdentityInput): ResearchPlan {
    return this.mutate(
      input.workspaceId,
      input.planId,
      'delete_task',
      'Deleted a Plan task.',
      () => {
        this.requireActive(input.workspaceId, input.planId);
        const task = this.requireTask(input);
        if (task.status === 'done') {
          throw new LibraryError('CONFLICT', 'Completed tasks must be retired, not deleted.');
        }
        this.database
          .prepare('DELETE FROM plan_tasks WHERE id = ? AND plan_id = ? AND workspace_id = ?')
          .run(input.taskId, input.planId, input.workspaceId);
        this.normalizeOrder(input.planId);
      },
    );
  }

  public reorderTasks(input: {
    readonly workspaceId: string;
    readonly planId: string;
    readonly taskIds: readonly string[];
  }): ResearchPlan {
    return this.mutate(input.workspaceId, input.planId, 'reorder', 'Reordered Plan tasks.', () => {
      this.requireActive(input.workspaceId, input.planId);
      const current = this.taskRows(input.workspaceId, input.planId).map(({ id }) => id);
      if (
        current.length !== input.taskIds.length ||
        new Set(input.taskIds).size !== input.taskIds.length ||
        current.some((id) => !input.taskIds.includes(id))
      ) {
        throw new LibraryError(
          'INVALID_INPUT',
          'The task order must contain every task exactly once.',
        );
      }
      const offset = input.taskIds.length + 1;
      this.database
        .prepare('UPDATE plan_tasks SET display_order = display_order + ? WHERE plan_id = ?')
        .run(offset, input.planId);
      const update = this.database.prepare(
        'UPDATE plan_tasks SET display_order = ? WHERE id = ? AND plan_id = ?',
      );
      input.taskIds.forEach((id, index) => update.run(index, id, input.planId));
    });
  }

  public setTaskStatus(
    input: PlanTaskIdentityInput & {
      readonly status: string;
      readonly blockedReason: string | null;
      readonly rowVersion: number;
    },
  ): ResearchPlan {
    return this.mutate(
      input.workspaceId,
      input.planId,
      'task_status',
      `Set task status to ${input.status}.`,
      () => {
        this.requireActive(input.workspaceId, input.planId);
        if (input.status === 'done')
          throw new LibraryError(
            'INVALID_INPUT',
            'Use complete task to record completion evidence.',
          );
        const result = this.database
          .prepare(
            `UPDATE plan_tasks SET status = ?, blocked_reason = ?,
        completed_at = NULL, updated_at = ?, row_version = row_version + 1
        WHERE id = ? AND plan_id = ? AND workspace_id = ? AND row_version = ?`,
          )
          .run(
            input.status,
            input.status === 'blocked' ? input.blockedReason : null,
            new Date().toISOString(),
            input.taskId,
            input.planId,
            input.workspaceId,
            input.rowVersion,
          );
        if (result.changes !== 1)
          throw new LibraryError('CONFLICT', 'The Plan task changed or no longer exists.');
      },
    );
  }

  public completeTask(
    input: PlanTaskIdentityInput & {
      readonly completionNote: string;
      readonly evidenceReferenceIds: readonly string[];
      readonly rowVersion: number;
    },
  ): ResearchPlan {
    return this.mutate(
      input.workspaceId,
      input.planId,
      'complete_task',
      'Completed a Plan task with evidence.',
      () => {
        this.requireActive(input.workspaceId, input.planId);
        const task = this.requireTask(input);
        if (task.row_version !== input.rowVersion)
          throw new LibraryError('CONFLICT', 'The Plan task changed.');
        const references = this.referenceRows(input.workspaceId, input.taskId);
        const selected = references.filter(({ id }) => input.evidenceReferenceIds.includes(id));
        if (selected.length !== new Set(input.evidenceReferenceIds).size) {
          throw new LibraryError('INVALID_INPUT', 'Completion evidence must reference this task.');
        }
        const now = new Date().toISOString();
        const insert = this.database.prepare(`INSERT INTO plan_completion_evidence
        (id, workspace_id, task_id, source_type, source_key, title, citation, target_json,
         snapshot_identity, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        selected.forEach((reference) =>
          insert.run(
            randomUUID(),
            input.workspaceId,
            input.taskId,
            reference.source_type,
            reference.source_key,
            reference.title,
            reference.citation,
            reference.target_json,
            reference.snapshot_identity,
            input.completionNote,
            now,
          ),
        );
        this.database
          .prepare(
            `UPDATE plan_tasks SET status = 'done', blocked_reason = NULL,
        completed_at = ?, updated_at = ?, row_version = row_version + 1 WHERE id = ?`,
          )
          .run(now, now, input.taskId);
      },
    );
  }

  public setDependencies(input: SetPlanDependenciesInput): ResearchPlan {
    return this.mutate(
      input.workspaceId,
      input.planId,
      'dependencies',
      'Updated task dependencies.',
      () => {
        this.requireActive(input.workspaceId, input.planId);
        this.requireTask(input);
        const ids = [...new Set(input.dependencyIds)];
        if (ids.includes(input.taskId))
          throw new LibraryError('INVALID_INPUT', 'A task cannot depend on itself.');
        for (const id of ids) this.requireTask({ ...input, taskId: id });
        const graph = new Map(
          this.taskRows(input.workspaceId, input.planId).map(({ id }) => [
            id,
            this.dependencyIds(id),
          ]),
        );
        graph.set(input.taskId, ids);
        if (hasCycle(graph))
          throw new LibraryError('INVALID_INPUT', 'Plan task dependencies cannot contain a cycle.');
        this.database
          .prepare('DELETE FROM plan_task_dependencies WHERE task_id = ?')
          .run(input.taskId);
        const insert = this.database.prepare(
          'INSERT INTO plan_task_dependencies (task_id, depends_on_task_id, created_at) VALUES (?, ?, ?)',
        );
        ids.forEach((id) => insert.run(input.taskId, id, new Date().toISOString()));
      },
    );
  }

  public addReference(input: StoredPlanReferenceInput): ResearchPlan {
    return this.mutate(
      input.workspaceId,
      input.planId,
      'add_reference',
      `Added source: ${input.citation}`,
      () => {
        this.requireActive(input.workspaceId, input.planId);
        this.requireTask(input);
        const order = (
          this.database
            .prepare(
              'SELECT COALESCE(MAX(display_order), -1) + 1 AS value FROM plan_references WHERE task_id = ?',
            )
            .get(input.taskId) as { readonly value: number }
        ).value;
        this.database
          .prepare(
            `INSERT INTO plan_references
        (id, workspace_id, task_id, source_type, source_key, title, citation, target_json,
         snapshot_identity, display_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            input.id,
            input.workspaceId,
            input.taskId,
            input.target.type,
            input.sourceKey,
            input.title,
            input.citation,
            JSON.stringify(input.target),
            input.snapshotIdentity,
            order,
            input.createdAt,
          );
      },
    );
  }

  public removeReference(
    input: PlanTaskIdentityInput & { readonly referenceId: string },
  ): ResearchPlan {
    return this.mutate(
      input.workspaceId,
      input.planId,
      'remove_reference',
      'Removed a task source.',
      () => {
        this.requireActive(input.workspaceId, input.planId);
        const result = this.database
          .prepare('DELETE FROM plan_references WHERE id = ? AND task_id = ? AND workspace_id = ?')
          .run(input.referenceId, input.taskId, input.workspaceId);
        if (result.changes !== 1)
          throw new LibraryError('NOT_FOUND', 'The Plan source was not found.');
      },
    );
  }

  public listReferences(workspaceId: string, planId: string): readonly PlanReference[] {
    return this.database
      .prepare(
        `${REFERENCE_SELECT} WHERE workspace_id = ? AND task_id IN
      (SELECT id FROM plan_tasks WHERE plan_id = ?) ORDER BY task_id, display_order`,
      )
      .all(workspaceId, planId)
      .map((row) => mapReference(row as ReferenceRow));
  }

  public listHistory(workspaceId: string, planId: string): readonly ResearchPlanHistoryEntry[] {
    this.require(workspaceId, planId);
    return (
      this.database
        .prepare(
          `SELECT id, workspace_id, plan_id, version, actor,
      change_kind, summary, snapshot_json, created_at FROM research_plan_history
      WHERE workspace_id = ? AND plan_id = ? ORDER BY version DESC`,
        )
        .all(workspaceId, planId) as Record<string, unknown>[]
    ).map((row) => ({
      id: String(row.id),
      workspaceId: String(row.workspace_id),
      planId: String(row.plan_id),
      version: Number(row.version),
      actor: row.actor as 'ai-confirmed' | 'user',
      changeKind: String(row.change_kind),
      summary: String(row.summary),
      snapshot: JSON.parse(String(row.snapshot_json)) as ResearchPlan,
      createdAt: String(row.created_at),
    }));
  }

  public createProposal(input: StoredPlanProposalInput): ResearchPlanProposal {
    this.requireMutableWorkspace(input.workspaceId);
    this.database
      .prepare(
        `INSERT INTO research_plan_proposals
      (id, workspace_id, plan_id, base_version, mode, goal, rationale, changes_json,
       provider_id, model_name, status, created_at, reviewed_at, row_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, 1)`,
      )
      .run(
        input.id,
        input.workspaceId,
        input.planId,
        input.baseVersion,
        input.mode,
        input.goal,
        input.rationale,
        input.changesJson,
        input.providerId,
        input.model,
        input.createdAt,
      );
    return this.requireProposal(input.workspaceId, input.id);
  }

  public getProposal(workspaceId: string, proposalId: string): ResearchPlanProposal | null {
    const row = this.database
      .prepare(`${PROPOSAL_SELECT} WHERE workspace_id = ? AND id = ?`)
      .get(workspaceId, proposalId) as ProposalRow | undefined;
    return row ? mapProposal(row) : null;
  }

  public updateProposal(input: {
    readonly workspaceId: string;
    readonly proposalId: string;
    readonly goal: string;
    readonly rationale: string;
    readonly changesJson: string;
    readonly rowVersion: number;
  }): ResearchPlanProposal {
    const result = this.database
      .prepare(
        `UPDATE research_plan_proposals SET goal = ?, rationale = ?,
      changes_json = ?, row_version = row_version + 1 WHERE id = ? AND workspace_id = ?
      AND status = 'pending' AND row_version = ?`,
      )
      .run(
        input.goal,
        input.rationale,
        input.changesJson,
        input.proposalId,
        input.workspaceId,
        input.rowVersion,
      );
    if (result.changes !== 1)
      throw new LibraryError('CONFLICT', 'The Plan proposal changed or is no longer pending.');
    return this.requireProposal(input.workspaceId, input.proposalId);
  }

  public confirmProposal(input: {
    readonly workspaceId: string;
    readonly proposalId: string;
    readonly rowVersion: number;
  }): ResearchPlan {
    const transaction = this.database.transaction(() => {
      const proposal = this.requireProposal(input.workspaceId, input.proposalId);
      if (proposal.status !== 'pending' || proposal.rowVersion !== input.rowVersion) {
        throw new LibraryError('CONFLICT', 'The Plan proposal changed or was already reviewed.');
      }
      const current = this.getActive(input.workspaceId);
      if (
        proposal.mode === 'adapt' &&
        (current?.id !== proposal.planId || current.version !== proposal.baseVersion)
      ) {
        throw new LibraryError(
          'CONFLICT',
          'The canonical Plan changed. Generate a new adaptation proposal.',
        );
      }
      let plan = current;
      if (!plan) {
        plan = this.create({ workspaceId: input.workspaceId, goal: proposal.goal });
      } else {
        this.database
          .prepare('UPDATE research_plans SET goal = ? WHERE id = ?')
          .run(proposal.goal, plan.id);
      }
      for (const change of proposal.changes) {
        if (change.kind === 'conflict' || change.kind === 'keep') continue;
        if (change.kind === 'add') {
          plan = this.createTask({
            workspaceId: input.workspaceId,
            planId: plan.id,
            title: change.title,
            description: change.description,
          });
        } else if (change.taskId) {
          const task = plan.tasks.find(({ id }) => id === change.taskId);
          if (task && task.status !== 'done' && task.status !== 'retired') {
            plan = this.updateTask({
              workspaceId: input.workspaceId,
              planId: plan.id,
              taskId: task.id,
              title: change.title,
              description: change.description,
              rowVersion: task.rowVersion,
            });
          }
        }
        const changedTask = change.taskId
          ? plan.tasks.find(({ id }) => id === change.taskId)
          : [...plan.tasks]
              .reverse()
              .find(
                ({ title, description }) =>
                  title === change.title && description === change.description,
              );
        if (changedTask && changedTask.status !== 'done' && changedTask.status !== 'retired') {
          plan = this.setDependencies({
            workspaceId: input.workspaceId,
            planId: plan.id,
            taskId: changedTask.id,
            dependencyIds: change.dependencyTaskIds,
          });
        }
      }
      this.database
        .prepare(
          `UPDATE research_plan_proposals SET status = 'confirmed', reviewed_at = ?,
        row_version = row_version + 1 WHERE id = ?`,
        )
        .run(new Date().toISOString(), proposal.id);
      const confirmed = this.require(input.workspaceId, plan.id);
      this.recordHistoryAfterBump(
        confirmed,
        'ai-confirmed',
        'proposal_confirm',
        'Confirmed an AI Plan proposal.',
      );
      return this.require(input.workspaceId, plan.id);
    });
    return transaction();
  }

  public rejectProposal(input: {
    readonly workspaceId: string;
    readonly proposalId: string;
    readonly rowVersion: number;
  }): ResearchPlanProposal {
    const result = this.database
      .prepare(
        `UPDATE research_plan_proposals SET status = 'rejected',
      reviewed_at = ?, row_version = row_version + 1 WHERE id = ? AND workspace_id = ?
      AND status = 'pending' AND row_version = ?`,
      )
      .run(new Date().toISOString(), input.proposalId, input.workspaceId, input.rowVersion);
    if (result.changes !== 1)
      throw new LibraryError('CONFLICT', 'The Plan proposal changed or was already reviewed.');
    return this.requireProposal(input.workspaceId, input.proposalId);
  }

  private mutate(
    workspaceId: string,
    planId: string,
    changeKind: string,
    summary: string,
    operation: () => void,
  ): ResearchPlan {
    const transaction = this.database.transaction(() => {
      this.requireMutableWorkspace(workspaceId);
      operation();
      const plan = this.require(workspaceId, planId);
      return this.recordHistoryAfterBump(plan, 'user', changeKind, summary);
    });
    return transaction();
  }

  private recordHistoryAfterBump(
    plan: ResearchPlan,
    actor: 'ai-confirmed' | 'user',
    changeKind: string,
    summary: string,
  ): ResearchPlan {
    const now = new Date().toISOString();
    this.database
      .prepare(
        `UPDATE research_plans SET version = version + 1, updated_at = ?,
      row_version = row_version + 1 WHERE id = ?`,
      )
      .run(now, plan.id);
    const current = this.require(plan.workspaceId, plan.id);
    this.recordHistory(current, actor, changeKind, summary);
    return current;
  }

  private recordHistory(
    plan: ResearchPlan,
    actor: 'ai-confirmed' | 'user',
    changeKind: string,
    summary: string,
  ): void {
    this.database
      .prepare(
        `INSERT INTO research_plan_history
      (id, workspace_id, plan_id, version, actor, change_kind, summary, snapshot_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        plan.workspaceId,
        plan.id,
        plan.version,
        actor,
        changeKind,
        summary,
        JSON.stringify(plan),
        new Date().toISOString(),
      );
  }

  private mapPlan(row: PlanRow): ResearchPlan {
    const rawTasks = this.taskRows(row.workspace_id, row.id).map((task) => this.mapTask(task));
    const byId = new Map(rawTasks.map((task) => [task.id, task]));
    const tasks = rawTasks.map((task) => {
      if (task.blockedReason) return task;
      const waiting = task.dependencyIds
        .map((id) => byId.get(id))
        .filter((dependency): dependency is PlanTask =>
          Boolean(dependency && dependency.status !== 'done'),
        );
      return waiting.length
        ? { ...task, blockedReason: `Waiting for: ${waiting.map(({ title }) => title).join(', ')}` }
        : task;
    });
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      goal: row.goal,
      status: row.status,
      version: row.version,
      tasks,
      progress: calculateProgress(tasks),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      rowVersion: row.row_version,
    };
  }

  private mapTask(row: TaskRow): PlanTask {
    const references = this.referenceRows(row.workspace_id, row.id).map(mapReference);
    const evidence = (
      this.database
        .prepare(
          `SELECT id, workspace_id, task_id, source_type,
      source_key, title, citation, target_json, snapshot_identity, note, created_at
      FROM plan_completion_evidence WHERE task_id = ? ORDER BY created_at`,
        )
        .all(row.id) as EvidenceRow[]
    ).map(mapEvidence);
    return {
      id: row.id,
      planId: row.plan_id,
      workspaceId: row.workspace_id,
      title: row.title,
      description: row.description,
      status: row.status,
      blockedReason: row.blocked_reason,
      displayOrder: row.display_order,
      dependencyIds: this.dependencyIds(row.id),
      references,
      completionEvidence: evidence,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      rowVersion: row.row_version,
    };
  }

  private taskRows(workspaceId: string, planId: string): readonly TaskRow[] {
    return this.database
      .prepare(`${TASK_SELECT} WHERE workspace_id = ? AND plan_id = ? ORDER BY display_order`)
      .all(workspaceId, planId) as TaskRow[];
  }

  private referenceRows(workspaceId: string, taskId: string): readonly ReferenceRow[] {
    return this.database
      .prepare(`${REFERENCE_SELECT} WHERE workspace_id = ? AND task_id = ? ORDER BY display_order`)
      .all(workspaceId, taskId) as ReferenceRow[];
  }

  private dependencyIds(taskId: string): readonly string[] {
    return (
      this.database
        .prepare(
          'SELECT depends_on_task_id FROM plan_task_dependencies WHERE task_id = ? ORDER BY depends_on_task_id',
        )
        .all(taskId) as { readonly depends_on_task_id: string }[]
    ).map(({ depends_on_task_id }) => depends_on_task_id);
  }

  private normalizeOrder(planId: string): void {
    const ids = (
      this.database
        .prepare('SELECT id FROM plan_tasks WHERE plan_id = ? ORDER BY display_order')
        .all(planId) as { readonly id: string }[]
    ).map(({ id }) => id);
    const offset = ids.length + 1;
    this.database
      .prepare('UPDATE plan_tasks SET display_order = display_order + ? WHERE plan_id = ?')
      .run(offset, planId);
    const update = this.database.prepare('UPDATE plan_tasks SET display_order = ? WHERE id = ?');
    ids.forEach((id, index) => update.run(index, id));
  }

  private require(workspaceId: string, planId: string): ResearchPlan {
    const plan = this.get(workspaceId, planId);
    if (!plan) throw new LibraryError('NOT_FOUND', 'The Research Plan was not found.');
    return plan;
  }

  private requireActive(workspaceId: string, planId: string): ResearchPlan {
    const plan = this.require(workspaceId, planId);
    if (plan.status !== 'active')
      throw new LibraryError('CONFLICT', 'Retired Research Plans are read-only.');
    return plan;
  }

  private requireTask(input: PlanTaskIdentityInput): TaskRow {
    const row = this.database
      .prepare(`${TASK_SELECT} WHERE id = ? AND plan_id = ? AND workspace_id = ?`)
      .get(input.taskId, input.planId, input.workspaceId) as TaskRow | undefined;
    if (!row) throw new LibraryError('NOT_FOUND', 'The Plan task was not found in this Workspace.');
    return row;
  }

  private requireWorkspace(workspaceId: string): { readonly status: string } {
    const workspace = this.database
      .prepare('SELECT status FROM workspaces WHERE id = ?')
      .get(workspaceId) as { readonly status: string } | undefined;
    if (!workspace) throw new LibraryError('NOT_FOUND', 'The Workspace was not found.');
    return workspace;
  }

  private requireMutableWorkspace(workspaceId: string): void {
    if (this.requireWorkspace(workspaceId).status === 'archived') {
      throw new LibraryError('CONFLICT', 'Archived Workspaces cannot be changed.');
    }
  }

  private throwMissingOrConflict(workspaceId: string, planId: string): never {
    if (!this.get(workspaceId, planId))
      throw new LibraryError('NOT_FOUND', 'The Research Plan was not found.');
    throw new LibraryError('CONFLICT', 'The Research Plan changed. Refresh and try again.');
  }

  private requireProposal(workspaceId: string, proposalId: string): ResearchPlanProposal {
    const proposal = this.getProposal(workspaceId, proposalId);
    if (!proposal) throw new LibraryError('NOT_FOUND', 'The Plan proposal was not found.');
    return proposal;
  }
}

function mapReference(row: ReferenceRow): PlanReference {
  return {
    id: row.id,
    taskId: row.task_id,
    workspaceId: row.workspace_id,
    type: row.source_type,
    title: row.title,
    citation: row.citation,
    target: JSON.parse(row.target_json) as PlanReferenceTarget,
    snapshotIdentity: row.snapshot_identity,
    availability: 'available',
    availabilityReason: null,
    displayOrder: row.display_order,
    createdAt: row.created_at,
  };
}

function mapEvidence(row: EvidenceRow): PlanCompletionEvidence {
  return {
    id: row.id,
    taskId: row.task_id,
    workspaceId: row.workspace_id,
    sourceType: row.source_type,
    title: row.title,
    citation: row.citation,
    target: JSON.parse(row.target_json) as PlanReferenceTarget,
    snapshotIdentity: row.snapshot_identity,
    note: row.note,
    createdAt: row.created_at,
  };
}

function mapProposal(row: ProposalRow): ResearchPlanProposal {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    planId: row.plan_id,
    baseVersion: row.base_version,
    mode: row.mode,
    goal: row.goal,
    rationale: row.rationale,
    changes: JSON.parse(row.changes_json) as ResearchPlanProposal['changes'],
    providerId: row.provider_id,
    model: row.model_name,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    rowVersion: row.row_version,
  };
}

export function calculateProgress(tasks: readonly PlanTask[]): PlanProgress {
  const eligibleTasks = tasks.filter(({ status }) => status !== 'retired');
  const completed = eligibleTasks.filter(({ status }) => status === 'done').length;
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const isDependencyBlocked = (task: PlanTask) =>
    task.dependencyIds.some((id) => taskById.get(id)?.status !== 'done');
  const blocked = eligibleTasks.filter(
    (task) => task.status === 'blocked' || isDependencyBlocked(task),
  ).length;
  const next =
    eligibleTasks.find((task) => task.status === 'in_progress' && !isDependencyBlocked(task)) ??
    eligibleTasks.find((task) => task.status === 'todo' && !isDependencyBlocked(task));
  return {
    completed,
    eligible: eligibleTasks.length,
    percent: eligibleTasks.length === 0 ? 0 : Math.floor((completed / eligibleTasks.length) * 100),
    blocked,
    nextTaskId: next?.id ?? null,
    explanation:
      'Completed non-retired tasks / all non-retired tasks. This is task progress, not research validity.',
  };
}

function hasCycle(graph: ReadonlyMap<string, readonly string[]>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of graph.get(id) ?? []) if (visit(dependency)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...graph.keys()].some(visit);
}
