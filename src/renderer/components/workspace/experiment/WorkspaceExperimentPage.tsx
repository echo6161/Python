import { useCallback, useEffect, useRef, useState } from 'react';
import { Beaker, Plus, Trash2, Sparkles, AlertTriangle } from 'lucide-react';
import type {
  Experiment,
  ExperimentMetric,
  ExperimentOutcome,
  ExperimentRunStatus,
} from '../../../../shared/contracts/experiment';
import type { ResearchQuestion } from '../../../../shared/contracts/question';
import type { WorkspaceRepositoryRef } from '../../../../shared/contracts/repository';
import type { Workspace } from '../../../../shared/contracts/workspace';
import type { ApiResult } from '../../../../shared/contracts/library';
export function WorkspaceExperimentPage({ workspace }: { readonly workspace: Workspace }) {
  const [items, setItems] = useState<readonly Experiment[]>([]),
    [current, setCurrent] = useState<Experiment | null>(null),
    [questions, setQuestions] = useState<readonly ResearchQuestion[]>([]),
    [repos, setRepos] = useState<readonly WorkspaceRepositoryRef[]>([]),
    [error, setError] = useState<string | null>(null),
    [create, setCreate] = useState(false);
  const load = useCallback(async () => {
    const [e, q, r] = await Promise.all([
      window.paperMind.experiment.list(workspace.id),
      window.paperMind.question.list(workspace.id),
      window.paperMind.repository.listForWorkspace(workspace.id),
    ]);
    if (e.ok) {
      setItems(e.value);
      setCurrent((c) => e.value.find((x) => x.id === c?.id) ?? e.value[0] ?? null);
    } else setError(e.error.message);
    if (q.ok) setQuestions(q.value);
    if (r.ok) setRepos(r.value);
  }, [workspace.id]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  const apply = (e: Experiment) => {
    setCurrent(e);
    setItems((v) => [e, ...v.filter((x) => x.id !== e.id)]);
  };
  return (
    <div className="experiment-page">
      <header>
        <div>
          <h2>
            <Beaker className="size-4" /> Experiments
          </h2>
          <p>{workspace.name} / external-run metadata only</p>
        </div>
        <button className="experiment-primary" onClick={() => setCreate(true)}>
          <Plus className="size-4" /> Experiment
        </button>
      </header>
      {error ? (
        <p className="experiment-error" role="alert">
          <AlertTriangle className="size-4" />
          {error}
        </p>
      ) : null}
      <div className="experiment-layout">
        <aside aria-label="Experiments list">
          {items.map((e) => (
            <button
              className={current?.id === e.id ? 'selected' : ''}
              key={e.id}
              onClick={() => setCurrent(e)}
            >
              <strong>{e.title}</strong>
              <span>
                {e.status} · {e.runs.length} runs
              </span>
            </button>
          ))}
          {!items.length ? <p>No Experiments yet.</p> : null}
        </aside>
        <main>
          {create ? (
            <CreateForm
              workspaceId={workspace.id}
              questions={questions}
              repos={repos}
              onCancel={() => setCreate(false)}
              onCreated={(e) => {
                apply(e);
                setCreate(false);
              }}
              onError={setError}
            />
          ) : current ? (
            <ExperimentDetail
              experiment={current}
              onApply={apply}
              onDelete={() =>
                void (async () => {
                  const r = await window.paperMind.experiment.delete({
                    workspaceId: workspace.id,
                    experimentId: current.id,
                    confirmation: 'DELETE_EXPERIMENT',
                  });
                  if (r.ok) {
                    setCurrent(null);
                    await load();
                  } else setError(r.error.message);
                })()
              }
              onError={setError}
            />
          ) : (
            <div className="experiment-empty">
              <Beaker className="size-8" />
              <strong>Record a bounded external experiment</strong>
              <p>
                Define a hypothesis, pin a code snapshot, then record an existing run and result.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
function CreateForm({
  workspaceId,
  questions,
  repos,
  onCancel,
  onCreated,
  onError,
}: {
  workspaceId: string;
  questions: readonly ResearchQuestion[];
  repos: readonly WorkspaceRepositoryRef[];
  onCancel: () => void;
  onCreated: (e: Experiment) => void;
  onError: (s: string) => void;
}) {
  const [title, setTitle] = useState(''),
    [hyp, setHyp] = useState(''),
    [questionId, setQuestion] = useState(''),
    [repoId, setRepo] = useState(''),
    [config, setConfig] = useState('');
  const repo = repos.find((r) => r.id === repoId);
  return (
    <section className="experiment-editor">
      <h3>New Experiment</h3>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Hypothesis
        <textarea value={hyp} onChange={(e) => setHyp(e.target.value)} />
      </label>
      <label>
        Research Question
        <select value={questionId} onChange={(e) => setQuestion(e.target.value)}>
          <option value="">None</option>
          {questions.map((q) => (
            <option key={q.id} value={q.id}>
              {q.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Repository snapshot
        <select value={repoId} onChange={(e) => setRepo(e.target.value)}>
          <option value="">None</option>
          {repos
            .filter((r) => r.headCommit)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.displayName} · {r.headCommit?.slice(0, 10)}
              </option>
            ))}
        </select>
      </label>
      <label>
        Configuration summary
        <textarea value={config} onChange={(e) => setConfig(e.target.value)} />
      </label>
      <footer>
        <button onClick={onCancel}>Cancel</button>
        <button
          className="experiment-primary"
          disabled={!title.trim() || !hyp.trim()}
          onClick={() =>
            void (async () => {
              const r = await window.paperMind.experiment.create({
                workspaceId,
                questionId: questionId || null,
                title,
                hypothesis: hyp,
                repositoryId: repoId || null,
                codeSnapshotIdentity: repo?.headCommit ?? null,
                configSummary: config,
              });
              if (r.ok) onCreated(r.value);
              else onError(r.error.message);
            })()
          }
        >
          Create
        </button>
      </footer>
    </section>
  );
}
function ExperimentDetail({
  experiment,
  onApply,
  onDelete,
  onError,
}: {
  experiment: Experiment;
  onApply: (e: Experiment) => void;
  onDelete: () => void;
  onError: (s: string) => void;
}) {
  const [runLabel, setRunLabel] = useState(''),
    [tool, setTool] = useState(''),
    [externalId, setExternalId] = useState(''),
    [result, setResult] = useState(''),
    [metricName, setMetricName] = useState(''),
    [metricValue, setMetricValue] = useState(''),
    [outcome, setOutcome] = useState<ExperimentOutcome>('inconclusive'),
    [conclusion, setConclusion] = useState('');
  const run = experiment.runs[0],
    pending = experiment.proposals.find((p) => p.status === 'pending');
  const proposalRef = useRef<HTMLTextAreaElement>(null);
  const op = async (p: Promise<ApiResult<Experiment>>) => {
    const r = await p;
    if (r.ok) onApply(r.value);
    else onError(r.error.message);
  };
  return (
    <section className="experiment-detail">
      <header>
        <div>
          <span className={`experiment-status is-${experiment.status}`}>{experiment.status}</span>
          <h3>{experiment.title}</h3>
        </div>
        <div>
          <select
            aria-label="Experiment status"
            value={experiment.status}
            onChange={(e) =>
              void op(
                window.paperMind.experiment.setStatus({
                  workspaceId: experiment.workspaceId,
                  experimentId: experiment.id,
                  status: e.target.value as Experiment['status'],
                  rowVersion: experiment.rowVersion,
                }),
              )
            }
          >
            <option value="planned">Planned</option>
            <option value="in_progress">In progress</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
          <button aria-label="Delete Experiment" onClick={onDelete}>
            <Trash2 className="size-4" />
          </button>
        </div>
      </header>
      <div className="experiment-summary">
        <article>
          <span>Hypothesis</span>
          <p>{experiment.hypothesis}</p>
        </article>
        <article>
          <span>Code snapshot</span>
          <p>{experiment.codeSnapshotIdentity ?? 'Not linked'}</p>
          <small>
            {experiment.availability.repository}
            {experiment.availability.reason ? ` · ${experiment.availability.reason}` : ''}
          </small>
        </article>
        <article>
          <span>Configuration</span>
          <p>{experiment.configSummary || 'No configuration recorded.'}</p>
        </article>
      </div>
      <div className="experiment-columns">
        <section>
          <h4>External runs</h4>
          {experiment.runs.map((r) => (
            <article className="experiment-run" key={r.id}>
              <strong>{r.label}</strong>
              <span>
                {r.toolName} · {r.externalRunId}
              </span>
              <select
                aria-label={`Run status ${r.label}`}
                value={r.status}
                onChange={(e) =>
                  void op(
                    window.paperMind.experiment.updateRun({
                      workspaceId: experiment.workspaceId,
                      experimentId: experiment.id,
                      runId: r.id,
                      label: r.label,
                      status: e.target.value as ExperimentRunStatus,
                      configSummary: r.configSummary,
                      startedAt: r.startedAt,
                      completedAt: e.target.value === 'running' ? null : new Date().toISOString(),
                      rowVersion: r.rowVersion,
                    }),
                  )
                }
              >
                <option value="pending">Pending</option>
                <option value="running">Running</option>
                <option value="succeeded">Succeeded</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              {r.result ? (
                <div>
                  <b>{r.result.outcome}</b>
                  <p>{r.result.summary}</p>
                  {r.result.metrics.map((m) => (
                    <small key={m.name}>
                      {m.name}: {m.value}
                      {m.unit ?? ''}
                    </small>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          <div className="experiment-inline">
            <input
              aria-label="Run label"
              placeholder="Run label"
              value={runLabel}
              onChange={(e) => setRunLabel(e.target.value)}
            />
            <input
              aria-label="Run tool"
              placeholder="Tool name"
              value={tool}
              onChange={(e) => setTool(e.target.value)}
            />
            <input
              aria-label="External run ID"
              placeholder="External run ID"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
            />
            <button
              disabled={!runLabel || !tool || !externalId}
              onClick={() =>
                void op(
                  window.paperMind.experiment.addRun({
                    workspaceId: experiment.workspaceId,
                    experimentId: experiment.id,
                    label: runLabel,
                    toolName: tool,
                    externalRunId: externalId,
                    configSummary: '',
                    startedAt: null,
                  }),
                )
              }
            >
              Add run
            </button>
          </div>
        </section>
        <section>
          <h4>Result & conclusion</h4>
          {run ? (
            <div className="experiment-inline">
              <textarea
                aria-label="Result summary"
                placeholder="Result summary"
                value={result}
                onChange={(e) => setResult(e.target.value)}
              />
              <select
                aria-label="Result outcome"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as ExperimentOutcome)}
              >
                <option value="supports">Supports</option>
                <option value="refutes">Refutes</option>
                <option value="inconclusive">Inconclusive</option>
              </select>
              <input
                aria-label="Metric name"
                placeholder="Metric"
                value={metricName}
                onChange={(e) => setMetricName(e.target.value)}
              />
              <input
                aria-label="Metric value"
                type="number"
                value={metricValue}
                onChange={(e) => setMetricValue(e.target.value)}
              />
              <button
                disabled={!result}
                onClick={() => {
                  const metrics: ExperimentMetric[] =
                    metricName && metricValue
                      ? [{ name: metricName, value: Number(metricValue), unit: null }]
                      : [];
                  void op(
                    window.paperMind.experiment.recordResult({
                      workspaceId: experiment.workspaceId,
                      experimentId: experiment.id,
                      runId: run.id,
                      summary: result,
                      outcome,
                      metrics,
                    }),
                  );
                }}
              >
                Save result
              </button>
            </div>
          ) : (
            <p>Add a run before recording a result.</p>
          )}
          {experiment.conclusions.map((c) => (
            <article className="experiment-conclusion" key={c.id}>
              <strong>{c.status} conclusion</strong>
              <p>{c.statement}</p>
              <small>{c.provenance}</small>
            </article>
          ))}
          {pending ? (
            <article className="experiment-proposal">
              <strong>Unconfirmed AI proposal</strong>
              <textarea
                ref={proposalRef}
                aria-label="Proposed conclusion"
                defaultValue={pending.statement}
              />
              <p>{pending.rationale}</p>
              <div>
                <button
                  onClick={() =>
                    void (async () => {
                      const r = await window.paperMind.experiment.rejectProposal({
                        workspaceId: experiment.workspaceId,
                        experimentId: experiment.id,
                        proposalId: pending.id,
                        rowVersion: pending.rowVersion,
                      });
                      if (r.ok)
                        onApply({
                          ...experiment,
                          proposals: experiment.proposals.map((p) =>
                            p.id === r.value.id ? r.value : p,
                          ),
                        });
                      else onError(r.error.message);
                    })()
                  }
                >
                  Reject
                </button>
                <button
                  className="experiment-primary"
                  onClick={() =>
                    void op(
                      window.paperMind.experiment.confirmProposal({
                        workspaceId: experiment.workspaceId,
                        experimentId: experiment.id,
                        proposalId: pending.id,
                        statement: proposalRef.current?.value ?? pending.statement,
                        rowVersion: pending.rowVersion,
                      }),
                    )
                  }
                >
                  Confirm conclusion
                </button>
              </div>
            </article>
          ) : (
            <div className="experiment-inline">
              <textarea
                aria-label="Conclusion statement"
                placeholder="Manual conclusion or AI instruction"
                value={conclusion}
                onChange={(e) => setConclusion(e.target.value)}
              />
              <button
                disabled={!conclusion}
                onClick={() =>
                  void op(
                    window.paperMind.experiment.createConclusion({
                      workspaceId: experiment.workspaceId,
                      experimentId: experiment.id,
                      resultId: run?.result?.id ?? null,
                      statement: conclusion,
                    }),
                  )
                }
              >
                Add manual
              </button>
              <button
                disabled={!conclusion}
                onClick={() =>
                  void (async () => {
                    const r = await window.paperMind.experiment.generateProposal({
                      workspaceId: experiment.workspaceId,
                      experimentId: experiment.id,
                      instruction: conclusion,
                    });
                    if (r.ok)
                      onApply({ ...experiment, proposals: [...experiment.proposals, r.value] });
                    else onError(r.error.message);
                  })()
                }
              >
                <Sparkles className="size-4" /> AI proposal
              </button>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
