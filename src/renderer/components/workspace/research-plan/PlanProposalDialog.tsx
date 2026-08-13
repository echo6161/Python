import { AlertTriangle, Check, X } from 'lucide-react';
import { useState } from 'react';

import type { ResearchPlanProposal } from '../../../../shared/contracts/research-plan';

export function PlanProposalDialog({
  proposal,
  busy,
  onConfirm,
  onReject,
}: {
  readonly proposal: ResearchPlanProposal;
  readonly busy: boolean;
  readonly onConfirm: (draft: ResearchPlanProposal) => void;
  readonly onReject: () => void;
}) {
  const [draft, setDraft] = useState(proposal);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="presentation">
      <section
        aria-labelledby="plan-proposal-title"
        aria-modal="true"
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden border border-zinc-700 bg-[#0d131c] shadow-2xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-zinc-800 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase text-sky-400">
              AI {proposal.mode} proposal
            </p>
            <h2 className="mt-1 text-lg font-semibold" id="plan-proposal-title">
              Review changes before writing the Plan
            </h2>
            <input
              aria-label="Proposal rationale"
              className="form-input mt-2 h-9 w-full"
              maxLength={4000}
              value={draft.rationale}
              onChange={(event) =>
                setDraft((current) => ({ ...current, rationale: event.target.value }))
              }
            />
          </div>
          <button
            aria-label="Reject and close proposal"
            className="icon-button"
            disabled={busy}
            type="button"
            onClick={onReject}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto p-4">
          <div className="mb-4 border border-zinc-800 bg-zinc-950/60 p-3">
            <span className="text-xs uppercase text-zinc-500">Proposed goal</span>
            <input
              aria-label="Proposed goal"
              className="form-input mt-1 h-9 w-full"
              maxLength={4000}
              value={draft.goal}
              onChange={(event) =>
                setDraft((current) => ({ ...current, goal: event.target.value }))
              }
            />
          </div>
          <ul className="divide-y divide-zinc-800 border border-zinc-800">
            {draft.changes.map((change, index) => (
              <li className="grid gap-2 p-3 sm:grid-cols-[90px_minmax(0,1fr)]" key={change.id}>
                <span
                  className={`text-xs font-semibold uppercase ${change.kind === 'conflict' ? 'text-amber-400' : change.kind === 'add' ? 'text-emerald-400' : 'text-sky-400'}`}
                >
                  {change.kind}
                </span>
                <div>
                  <input
                    aria-label={`Change ${String(index + 1)} title`}
                    className="form-input h-9 w-full text-sm font-semibold"
                    maxLength={300}
                    value={change.title}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        changes: current.changes.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, title: event.target.value } : item,
                        ),
                      }))
                    }
                  />
                  <textarea
                    aria-label={`Change ${String(index + 1)} description`}
                    className="form-input mt-2 min-h-16 w-full resize-none text-sm"
                    maxLength={10000}
                    value={change.description}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        changes: current.changes.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, description: event.target.value } : item,
                        ),
                      }))
                    }
                  />
                  <p className="mt-2 text-xs text-zinc-500">{change.rationale}</p>
                  {change.kind === 'conflict' ? (
                    <p className="mt-2 inline-flex items-center gap-1 text-xs text-amber-300">
                      <AlertTriangle aria-hidden="true" className="size-3" /> Conflict is preserved
                      and will not be applied.
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <footer className="flex items-center justify-between gap-4 border-t border-zinc-800 p-4">
          <p className="text-xs text-zinc-500">
            Completed and retired tasks are never overwritten.
          </p>
          <div className="flex gap-2">
            <button className="secondary-button" disabled={busy} type="button" onClick={onReject}>
              Reject
            </button>
            <button
              className="primary-button inline-flex items-center gap-2"
              disabled={
                busy || !draft.goal.trim() || draft.changes.some(({ title }) => !title.trim())
              }
              type="button"
              onClick={() => onConfirm(draft)}
            >
              <Check aria-hidden="true" className="size-4" /> Confirm changes
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
