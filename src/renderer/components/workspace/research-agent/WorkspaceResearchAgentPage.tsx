import { useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleSlash2,
  Clock3,
  ExternalLink,
  LoaderCircle,
  PanelRightOpen,
  ShieldCheck,
  Square,
  X,
} from 'lucide-react';

import type {
  ResearchAgentProposal,
  ResearchAgentRun,
  ResearchAgentRunStatus,
} from '../../../../shared/contracts/research-agent';
import type { Workspace } from '../../../../shared/contracts/workspace';
import { useResearchAgentController } from './use-research-agent-controller';

export function WorkspaceResearchAgentPage({ workspace }: { readonly workspace: Workspace }) {
  const controller = useResearchAgentController(workspace.id);
  const [goal, setGoal] = useState(workspace.researchGoal);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [proposal, setProposal] = useState<ResearchAgentProposal | null>(null);
  const running = controller.run?.status === 'running';

  return (
    <div className="research-agent-page flex h-full min-w-0 flex-col overflow-hidden">
      <header className="research-agent-toolbar">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Bot aria-hidden="true" className="size-4 text-cyan-400" /> Research Agent
          </h2>
          <p className="truncate text-[11px] text-zinc-500">
            {workspace.name} / read-only bounded orchestration
          </p>
        </div>
        <select
          aria-label="Agent run history"
          className="form-input h-9 min-w-0 max-w-80"
          disabled={running}
          value={controller.run?.id ?? ''}
          onChange={(event) => void controller.selectRun(event.target.value)}
        >
          <option value="">New run</option>
          {controller.runs.map((run) => (
            <option key={run.id} value={run.id}>
              {run.status}: {run.goal.slice(0, 55)}
            </option>
          ))}
        </select>
        <button
          className="agent-secondary-button"
          type="button"
          onClick={() => setInspectorOpen(true)}
        >
          <PanelRightOpen aria-hidden="true" className="size-4" /> Inspector
        </button>
      </header>

      <div className="research-agent-work-area min-h-0 flex-1">
        <main className="research-agent-main">
          <section className="research-agent-goal" aria-label="Agent goal">
            <label className="min-w-0 flex-1">
              <span className="text-[11px] font-semibold uppercase text-zinc-500">
                Research goal
              </span>
              <textarea
                aria-label="Research Agent goal"
                className="mt-1 min-h-20 w-full resize-none border border-zinc-700 bg-[#0b1017] px-3 py-2 text-sm text-zinc-100"
                disabled={running}
                maxLength={4000}
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
              />
            </label>
            {running ? (
              <button
                className="agent-danger-button"
                type="button"
                onClick={() => void controller.cancel()}
              >
                <Square aria-hidden="true" className="size-3.5 fill-current" /> Cancel run
              </button>
            ) : (
              <button
                className="agent-primary-button"
                disabled={!goal.trim()}
                type="button"
                onClick={() => void controller.start(goal.trim())}
              >
                <Bot aria-hidden="true" className="size-4" /> Run Agent
              </button>
            )}
          </section>

          {controller.error ? (
            <div className="agent-error" role="alert">
              <AlertTriangle aria-hidden="true" className="size-4" /> {controller.error}
            </div>
          ) : null}

          <section className="min-h-0 flex-1 overflow-y-auto px-5 py-4" aria-label="Agent answer">
            {controller.loading ? (
              <div className="agent-empty">
                <LoaderCircle className="size-7 animate-spin" /> Loading runs...
              </div>
            ) : controller.run ? (
              <RunAnswer
                run={controller.run}
                onCitation={(alias) => void controller.openCitation(alias)}
              />
            ) : (
              <div className="agent-empty">
                <ShieldCheck aria-hidden="true" className="size-8 text-zinc-700" />
                <h3>Start a bounded, read-only investigation</h3>
                <p>
                  The Agent can inspect approved Workspace sources. It cannot execute code or
                  persist domain changes.
                </p>
              </div>
            )}
          </section>
        </main>

        <RunInspector
          open={inspectorOpen}
          run={controller.run}
          onClose={() => setInspectorOpen(false)}
          onOpenCitation={(alias) => void controller.openCitation(alias)}
          onOpenProposal={setProposal}
        />
      </div>

      {proposal && controller.run ? (
        <ProposalDialog
          proposal={proposal}
          onClose={() => setProposal(null)}
          onReview={(action) =>
            void controller.reviewProposal(proposal, action).then((ok) => {
              if (ok) setProposal(null);
            })
          }
        />
      ) : null}
    </div>
  );
}

function RunAnswer({
  run,
  onCitation,
}: {
  readonly run: ResearchAgentRun;
  readonly onCitation: (alias: string) => void;
}) {
  const supported = new Set(run.citations.map(({ alias }) => alias));
  const unsupported = [
    ...new Set(
      [...run.answerMarkdown.matchAll(/\[(S\d{1,3})\]/gu)].flatMap((match) =>
        match[1] && !supported.has(match[1]) ? [match[1]] : [],
      ),
    ),
  ];
  return (
    <article className="mx-auto max-w-4xl">
      <header className="mb-4 flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-3">
        <StatusIcon status={run.status} />
        <strong className="text-sm text-zinc-100">{statusLabel(run.status)}</strong>
        <span className="text-xs text-zinc-500">
          Step {String(run.usage.steps)}/{String(run.budget.maximumSteps)}
        </span>
        {run.terminationReason ? (
          <span className="agent-status-chip">{run.terminationReason.replaceAll('_', ' ')}</span>
        ) : null}
      </header>
      {run.status === 'running' && !run.answerMarkdown ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          {run.trace.at(-1)?.outputSummary ?? 'Preparing bounded tools...'}
        </div>
      ) : null}
      {run.answerMarkdown ? (
        <div className="whitespace-pre-wrap text-sm leading-7 text-zinc-200">
          {run.answerMarkdown}
        </div>
      ) : null}
      {run.citations.length ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {run.citations.map((citation) => (
            <button
              className="agent-citation"
              key={citation.alias}
              type="button"
              onClick={() => onCitation(citation.alias)}
            >
              {citation.alias} · {citation.sourceType}{' '}
              <ExternalLink aria-hidden="true" className="size-3" />
            </button>
          ))}
        </div>
      ) : null}
      {unsupported.length ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-300" role="status">
          <AlertTriangle aria-hidden="true" className="size-3.5" /> Unsupported citation:{' '}
          {unsupported.join(', ')}
        </p>
      ) : null}
      {run.uncertainty ? (
        <aside className="mt-5 border-l-2 border-amber-600 bg-amber-950/20 px-3 py-2 text-xs leading-5 text-amber-200">
          <strong>Uncertainty:</strong> {run.uncertainty}
        </aside>
      ) : null}
      {run.error ? <p className="mt-4 text-sm text-red-300">{run.error.message}</p> : null}
    </article>
  );
}

function RunInspector({
  open,
  run,
  onClose,
  onOpenCitation,
  onOpenProposal,
}: {
  readonly open: boolean;
  readonly run: ResearchAgentRun | null;
  readonly onClose: () => void;
  readonly onOpenCitation: (alias: string) => void;
  readonly onOpenProposal: (proposal: ResearchAgentProposal) => void;
}) {
  return (
    <aside
      className={`research-agent-inspector ${open ? 'is-open' : ''}`}
      aria-label="Agent run inspector"
    >
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Run inspector</h3>
          <p className="text-[11px] text-zinc-500">Audited summaries, not raw source logs</p>
        </div>
        <button
          aria-label="Close Agent inspector"
          className="icon-button agent-inspector-close"
          type="button"
          onClick={onClose}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </header>
      {!run ? (
        <p className="p-4 text-xs text-zinc-500">No run selected.</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <section className="agent-inspector-section">
            <h4>Limits and usage</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Metric
                label="Steps"
                value={`${String(run.usage.steps)} / ${String(run.budget.maximumSteps)}`}
              />
              <Metric
                label="Tools"
                value={`${String(run.usage.toolCalls)} / ${String(run.budget.maximumToolCalls)}`}
              />
              <Metric
                label="Context"
                value={`${String(run.usage.contextCharacters)} / ${String(run.budget.maximumContextCharacters)}`}
              />
              <Metric label="Timeout" value={`${String(run.budget.timeoutMs / 1000)}s`} />
            </div>
          </section>
          <section className="agent-inspector-section">
            <h4>Tool summary</h4>
            <ol className="agent-trace">
              {run.trace.map((step) => (
                <li key={step.id}>
                  <span>{String(step.ordinal + 1)}</span>
                  <div>
                    <strong>{step.toolName.replaceAll('_', ' ')}</strong>
                    <p>{step.outputSummary}</p>
                  </div>
                  <small>{step.status}</small>
                </li>
              ))}
            </ol>
          </section>
          <section className="agent-inspector-section">
            <h4>Sources · {String(run.citations.length)}</h4>
            <div className="space-y-2">
              {run.citations.map((citation) => (
                <button
                  className="agent-source"
                  key={citation.alias}
                  type="button"
                  onClick={() => onOpenCitation(citation.alias)}
                >
                  <span>
                    {citation.alias} · {citation.sourceType}
                  </span>
                  <strong>{citation.title}</strong>
                  <small>{citation.citation}</small>
                </button>
              ))}
            </div>
          </section>
          <section className="agent-inspector-section">
            <h4>
              Pending proposals ·{' '}
              {String(run.proposals.filter(({ status }) => status === 'pending').length)}
            </h4>
            {run.proposals.map((proposal) => (
              <button
                className="agent-proposal"
                key={proposal.id}
                type="button"
                onClick={() => onOpenProposal(proposal)}
              >
                <strong>{proposal.title}</strong>
                <span>{proposal.status} · not canonical Memory</span>
              </button>
            ))}
          </section>
        </div>
      )}
    </aside>
  );
}

function ProposalDialog({
  proposal,
  onClose,
  onReview,
}: {
  readonly proposal: ResearchAgentProposal;
  readonly onClose: () => void;
  readonly onReview: (action: 'accept' | 'reject') => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <section
        aria-modal="true"
        className="agent-proposal-dialog"
        role="dialog"
        aria-labelledby="agent-proposal-title"
      >
        <header>
          <div>
            <p>Unconfirmed Agent proposal</p>
            <h2 id="agent-proposal-title">{proposal.title}</h2>
          </div>
          <button
            aria-label="Close proposal"
            className="icon-button"
            type="button"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto p-5">
          <p className="text-xs text-amber-300">
            This is not confirmed Memory and has not modified any domain record.
          </p>
          <h3 className="mt-4 text-xs font-semibold uppercase text-zinc-500">Reason</h3>
          <p className="mt-1 text-sm text-zinc-300">{proposal.reason}</p>
          <h3 className="mt-4 text-xs font-semibold uppercase text-zinc-500">Preview</h3>
          <pre className="mt-1 whitespace-pre-wrap border border-zinc-800 bg-[#0b1017] p-3 text-sm text-zinc-200">
            {proposal.bodyMarkdown}
          </pre>
        </div>
        {proposal.status === 'pending' ? (
          <footer>
            <button
              className="agent-secondary-button"
              type="button"
              onClick={() => onReview('reject')}
            >
              Reject
            </button>
            <button
              className="agent-primary-button"
              type="button"
              onClick={() => onReview('accept')}
            >
              Send to Memory review
            </button>
          </footer>
        ) : (
          <footer>
            <span className="text-xs text-zinc-400">
              Proposal {proposal.status}; canonical Memory still requires confirmation in Notes.
            </span>
          </footer>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="border border-zinc-800 p-2">
      <span className="block text-zinc-500">{label}</span>
      <strong className="text-zinc-200">{value}</strong>
    </div>
  );
}
function StatusIcon({ status }: { readonly status: ResearchAgentRunStatus }) {
  if (status === 'running') return <LoaderCircle className="size-4 animate-spin text-sky-400" />;
  if (status === 'succeeded') return <CheckCircle2 className="size-4 text-emerald-400" />;
  if (status === 'cancelled') return <CircleSlash2 className="size-4 text-zinc-400" />;
  if (status === 'timeout') return <Clock3 className="size-4 text-amber-400" />;
  return <AlertTriangle className="size-4 text-red-400" />;
}
function statusLabel(status: ResearchAgentRunStatus) {
  if (status === 'succeeded') return 'Completed';
  if (status === 'partial') return 'Partial result';
  if (status === 'running') return 'Running';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'timeout') return 'Timeout';
  return 'Failed';
}
