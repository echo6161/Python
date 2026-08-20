import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  ConclusionStatus,
  CreateExperimentInput,
  CreateExperimentRunInput,
  Experiment,
  ExperimentConclusion,
  ExperimentConclusionProposal,
  ExperimentMetric,
  ExperimentResult,
  ExperimentRunReference,
  ExperimentStatus,
  RecordExperimentResultInput,
  UpdateExperimentInput,
  UpdateExperimentRunInput,
} from '../../shared/contracts/experiment';
import { LibraryError } from '../library/errors';

interface ERow {
  id: string;
  workspace_id: string;
  question_id: string | null;
  title: string;
  hypothesis: string;
  status: ExperimentStatus;
  repository_id: string | null;
  code_snapshot_identity: string | null;
  config_summary: string;
  created_at: string;
  updated_at: string;
  row_version: number;
}
interface RRow {
  id: string;
  experiment_id: string;
  label: string;
  tool_name: string;
  external_run_id: string;
  status: ExperimentRunReference['status'];
  config_summary: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  row_version: number;
}
interface XRow {
  id: string;
  run_id: string;
  summary: string;
  outcome: ExperimentResult['outcome'];
  metrics_json: string;
  created_at: string;
  updated_at: string;
  row_version: number;
}
interface CRow {
  id: string;
  experiment_id: string;
  result_id: string | null;
  statement: string;
  status: ConclusionStatus;
  provenance: ExperimentConclusion['provenance'];
  created_at: string;
  updated_at: string;
  row_version: number;
}
interface PRow {
  id: string;
  experiment_id: string;
  workspace_id: string;
  statement: string;
  rationale: string;
  provider_id: 'codex' | 'openai';
  model_name: string;
  status: ExperimentConclusionProposal['status'];
  confirmed_conclusion_id: string | null;
  created_at: string;
  reviewed_at: string | null;
  row_version: number;
}
const ES = `SELECT id,workspace_id,question_id,title,hypothesis,status,repository_id,code_snapshot_identity,config_summary,created_at,updated_at,row_version FROM experiments`;
export class ExperimentRepository {
  constructor(private readonly db: Database.Database) {}
  list(workspaceId: string) {
    this.workspace(workspaceId);
    return (
      this.db
        .prepare(`${ES} WHERE workspace_id=? ORDER BY updated_at DESC,id`)
        .all(workspaceId) as ERow[]
    ).map((r) => this.map(r));
  }
  get(workspaceId: string, id: string) {
    const r = this.db.prepare(`${ES} WHERE workspace_id=? AND id=?`).get(workspaceId, id) as
      ERow | undefined;
    return r ? this.map(r) : null;
  }
  create(i: CreateExperimentInput) {
    return this.tx(() => {
      this.mutable(i.workspaceId);
      const now = new Date().toISOString(),
        id = randomUUID();
      this.db
        .prepare(`INSERT INTO experiments VALUES(?,?,?,?,?,'planned',?,?,?,?,?,1)`)
        .run(
          id,
          i.workspaceId,
          i.questionId,
          i.title,
          i.hypothesis,
          i.repositoryId,
          i.codeSnapshotIdentity,
          i.configSummary,
          now,
          now,
        );
      return this.req(i.workspaceId, id);
    });
  }
  update(i: UpdateExperimentInput) {
    return this.tx(() => {
      this.mutable(i.workspaceId);
      const q = this.db
        .prepare(
          `UPDATE experiments SET question_id=?,title=?,hypothesis=?,repository_id=?,code_snapshot_identity=?,config_summary=?,updated_at=?,row_version=row_version+1 WHERE id=? AND workspace_id=? AND row_version=?`,
        )
        .run(
          i.questionId,
          i.title,
          i.hypothesis,
          i.repositoryId,
          i.codeSnapshotIdentity,
          i.configSummary,
          new Date().toISOString(),
          i.id,
          i.workspaceId,
          i.rowVersion,
        );
      if (q.changes !== 1) this.conflict();
      return this.req(i.workspaceId, i.id);
    });
  }
  status(w: string, id: string, s: ExperimentStatus, v: number) {
    const q = this.db
      .prepare(
        `UPDATE experiments SET status=?,updated_at=?,row_version=row_version+1 WHERE id=? AND workspace_id=? AND row_version=?`,
      )
      .run(s, new Date().toISOString(), id, w, v);
    if (q.changes !== 1) this.conflict();
    return this.req(w, id);
  }
  delete(w: string, id: string) {
    this.mutable(w);
    return (
      this.db.prepare(`DELETE FROM experiments WHERE workspace_id=? AND id=?`).run(w, id)
        .changes === 1
    );
  }
  addRun(i: CreateExperimentRunInput) {
    return this.tx(() => {
      this.req(i.workspaceId, i.experimentId);
      const now = new Date().toISOString();
      this.db
        .prepare(`INSERT INTO experiment_runs VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?,1)`)
        .run(
          randomUUID(),
          i.experimentId,
          i.workspaceId,
          i.label,
          i.toolName,
          i.externalRunId,
          i.configSummary,
          i.startedAt,
          null,
          now,
          now,
        );
      return this.req(i.workspaceId, i.experimentId);
    });
  }
  updateRun(i: UpdateExperimentRunInput) {
    const q = this.db
      .prepare(
        `UPDATE experiment_runs SET label=?,status=?,config_summary=?,started_at=?,completed_at=?,updated_at=?,row_version=row_version+1 WHERE id=? AND experiment_id=? AND workspace_id=? AND row_version=?`,
      )
      .run(
        i.label,
        i.status,
        i.configSummary,
        i.startedAt,
        i.completedAt,
        new Date().toISOString(),
        i.runId,
        i.experimentId,
        i.workspaceId,
        i.rowVersion,
      );
    if (q.changes !== 1) this.conflict();
    return this.req(i.workspaceId, i.experimentId);
  }
  deleteRun(w: string, e: string, r: string) {
    const q = this.db
      .prepare(`DELETE FROM experiment_runs WHERE workspace_id=? AND experiment_id=? AND id=?`)
      .run(w, e, r);
    if (q.changes !== 1) throw new LibraryError('NOT_FOUND', 'The Experiment run does not exist.');
    return this.req(w, e);
  }
  result(i: RecordExperimentResultInput) {
    return this.tx(() => {
      this.req(i.workspaceId, i.experimentId);
      const run = this.db
        .prepare(`SELECT 1 FROM experiment_runs WHERE id=? AND experiment_id=? AND workspace_id=?`)
        .get(i.runId, i.experimentId, i.workspaceId);
      if (!run) throw new LibraryError('NOT_FOUND', 'The Experiment run does not exist.');
      const now = new Date().toISOString(),
        existing = this.db
          .prepare(`SELECT id FROM experiment_results WHERE run_id=?`)
          .get(i.runId) as { id: string } | undefined;
      if (existing)
        this.db
          .prepare(
            `UPDATE experiment_results SET summary=?,outcome=?,metrics_json=?,updated_at=?,row_version=row_version+1 WHERE id=?`,
          )
          .run(i.summary, i.outcome, JSON.stringify(i.metrics), now, existing.id);
      else
        this.db
          .prepare(`INSERT INTO experiment_results VALUES(?,?,?,?,?,?,?,?,?,1)`)
          .run(
            randomUUID(),
            i.runId,
            i.experimentId,
            i.workspaceId,
            i.summary,
            i.outcome,
            JSON.stringify(i.metrics),
            now,
            now,
          );
      return this.req(i.workspaceId, i.experimentId);
    });
  }
  conclusion(
    w: string,
    e: string,
    resultId: string | null,
    statement: string,
    provenance: ExperimentConclusion['provenance'],
  ) {
    this.req(w, e);
    const now = new Date().toISOString();
    this.db
      .prepare(`INSERT INTO experiment_conclusions VALUES(?,?,?,?,?,'draft',?,?,?,1)`)
      .run(randomUUID(), e, w, resultId, statement, provenance, now, now);
    return this.req(w, e);
  }
  updateConclusion(
    w: string,
    e: string,
    id: string,
    statement: string,
    status: ConclusionStatus,
    v: number,
  ) {
    const q = this.db
      .prepare(
        `UPDATE experiment_conclusions SET statement=?,status=?,updated_at=?,row_version=row_version+1 WHERE workspace_id=? AND experiment_id=? AND id=? AND row_version=?`,
      )
      .run(statement, status, new Date().toISOString(), w, e, id, v);
    if (q.changes !== 1) this.conflict();
    return this.req(w, e);
  }
  createProposal(i: {
    id: string;
    workspaceId: string;
    experimentId: string;
    statement: string;
    rationale: string;
    providerId: 'codex' | 'openai';
    model: string;
    createdAt: string;
  }) {
    this.req(i.workspaceId, i.experimentId);
    this.db
      .prepare(
        `INSERT INTO experiment_conclusion_proposals VALUES(?,?,?,?,?,?,?,'pending',NULL,?,NULL,1)`,
      )
      .run(
        i.id,
        i.experimentId,
        i.workspaceId,
        i.statement,
        i.rationale,
        i.providerId,
        i.model,
        i.createdAt,
      );
    return this.reqProposal(i.workspaceId, i.experimentId, i.id);
  }
  confirmProposal(i: {
    workspaceId: string;
    experimentId: string;
    proposalId: string;
    statement: string;
    rowVersion: number;
  }) {
    return this.tx(() => {
      const p = this.reqProposal(i.workspaceId, i.experimentId, i.proposalId);
      if (p.status !== 'pending' || p.rowVersion !== i.rowVersion) this.conflict();
      const now = new Date().toISOString(),
        id = randomUUID();
      this.db
        .prepare(
          `INSERT INTO experiment_conclusions VALUES(?,?,?,?,?,'confirmed','ai-proposed-confirmed',?,?,1)`,
        )
        .run(id, i.experimentId, i.workspaceId, null, i.statement, now, now);
      this.db
        .prepare(
          `UPDATE experiment_conclusion_proposals SET statement=?,status='confirmed',confirmed_conclusion_id=?,reviewed_at=?,row_version=row_version+1 WHERE id=?`,
        )
        .run(i.statement, id, now, i.proposalId);
      return this.req(i.workspaceId, i.experimentId);
    });
  }
  rejectProposal(w: string, e: string, id: string, v: number) {
    const q = this.db
      .prepare(
        `UPDATE experiment_conclusion_proposals SET status='rejected',reviewed_at=?,row_version=row_version+1 WHERE workspace_id=? AND experiment_id=? AND id=? AND status='pending' AND row_version=?`,
      )
      .run(new Date().toISOString(), w, e, id, v);
    if (q.changes !== 1) this.conflict();
    return this.reqProposal(w, e, id);
  }
  private map(r: ERow): Experiment {
    const runs = (
      this.db
        .prepare(
          `SELECT id,experiment_id,label,tool_name,external_run_id,status,config_summary,started_at,completed_at,created_at,updated_at,row_version FROM experiment_runs WHERE experiment_id=? ORDER BY created_at,id`,
        )
        .all(r.id) as RRow[]
    ).map((x) => this.run(x));
    const conclusions = (
      this.db
        .prepare(
          `SELECT id,experiment_id,result_id,statement,status,provenance,created_at,updated_at,row_version FROM experiment_conclusions WHERE experiment_id=? ORDER BY created_at,id`,
        )
        .all(r.id) as CRow[]
    ).map((x) => ({
      id: x.id,
      experimentId: x.experiment_id,
      resultId: x.result_id,
      statement: x.statement,
      status: x.status,
      provenance: x.provenance,
      createdAt: x.created_at,
      updatedAt: x.updated_at,
      rowVersion: x.row_version,
    }));
    const proposals = (
      this.db
        .prepare(
          `SELECT id,experiment_id,workspace_id,statement,rationale,provider_id,model_name,status,confirmed_conclusion_id,created_at,reviewed_at,row_version FROM experiment_conclusion_proposals WHERE experiment_id=? ORDER BY created_at,id`,
        )
        .all(r.id) as PRow[]
    ).map(mapProposal);
    return {
      id: r.id,
      workspaceId: r.workspace_id,
      questionId: r.question_id,
      title: r.title,
      hypothesis: r.hypothesis,
      status: r.status,
      repositoryId: r.repository_id,
      codeSnapshotIdentity: r.code_snapshot_identity,
      configSummary: r.config_summary,
      runs,
      conclusions,
      proposals,
      availability: { question: 'available', repository: 'available', reason: null },
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      rowVersion: r.row_version,
    };
  }
  private run(r: RRow): ExperimentRunReference {
    const x = this.db
      .prepare(
        `SELECT id,run_id,summary,outcome,metrics_json,created_at,updated_at,row_version FROM experiment_results WHERE run_id=?`,
      )
      .get(r.id) as XRow | undefined;
    return {
      id: r.id,
      experimentId: r.experiment_id,
      label: r.label,
      toolName: r.tool_name,
      externalRunId: r.external_run_id,
      status: r.status,
      configSummary: r.config_summary,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      result: x
        ? {
            id: x.id,
            runId: x.run_id,
            summary: x.summary,
            outcome: x.outcome,
            metrics: JSON.parse(x.metrics_json) as ExperimentMetric[],
            createdAt: x.created_at,
            updatedAt: x.updated_at,
            rowVersion: x.row_version,
          }
        : null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      rowVersion: r.row_version,
    };
  }
  private req(w: string, id: string) {
    const x = this.get(w, id);
    if (!x) throw new LibraryError('NOT_FOUND', 'The Experiment does not exist.');
    return x;
  }
  private reqProposal(w: string, e: string, id: string) {
    const x = this.db
      .prepare(
        `SELECT id,experiment_id,workspace_id,statement,rationale,provider_id,model_name,status,confirmed_conclusion_id,created_at,reviewed_at,row_version FROM experiment_conclusion_proposals WHERE workspace_id=? AND experiment_id=? AND id=?`,
      )
      .get(w, e, id) as PRow | undefined;
    if (!x) throw new LibraryError('NOT_FOUND', 'The conclusion proposal does not exist.');
    return mapProposal(x);
  }
  private workspace(w: string) {
    if (!this.db.prepare(`SELECT 1 FROM workspaces WHERE id=?`).get(w))
      throw new LibraryError('NOT_FOUND', 'The Workspace does not exist.');
  }
  private mutable(w: string) {
    const x = this.db.prepare(`SELECT status FROM workspaces WHERE id=?`).get(w) as
      { status: string } | undefined;
    if (!x) throw new LibraryError('NOT_FOUND', 'The Workspace does not exist.');
    if (x.status === 'archived')
      throw new LibraryError('CONFLICT', 'Archived Workspaces are read-only.');
  }
  private conflict(): never {
    throw new LibraryError('CONFLICT', 'The Experiment changed. Refresh and try again.');
  }
  private tx<T>(fn: () => T) {
    return this.db.transaction(fn)();
  }
}
function mapProposal(x: PRow): ExperimentConclusionProposal {
  return {
    id: x.id,
    experimentId: x.experiment_id,
    statement: x.statement,
    rationale: x.rationale,
    providerId: x.provider_id,
    model: x.model_name,
    status: x.status,
    confirmedConclusionId: x.confirmed_conclusion_id,
    createdAt: x.created_at,
    reviewedAt: x.reviewed_at,
    rowVersion: x.row_version,
  };
}
