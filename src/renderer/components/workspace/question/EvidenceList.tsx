import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Code2,
  ExternalLink,
  FileText,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';

import type {
  EvidenceReference,
  ResearchQuestionDetails,
} from '../../../../shared/contracts/question';

export function EvidenceList({
  details,
  disabled,
  onChanged,
}: {
  readonly details: ResearchQuestionDetails;
  readonly disabled: boolean;
  readonly onChanged: (details: ResearchQuestionDetails) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const identity = (evidenceId: string) => ({
    workspaceId: details.question.workspaceId,
    questionId: details.question.id,
    evidenceId,
  });

  const reorder = async (index: number, direction: -1 | 1) => {
    const ids = details.evidence.map(({ id }) => id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    const currentId = ids[index];
    const targetId = ids[target];
    if (!currentId || !targetId) return;
    ids[index] = targetId;
    ids[target] = currentId;
    setError(null);
    try {
      const result = await window.paperMind.question.reorderEvidence({
        workspaceId: details.question.workspaceId,
        questionId: details.question.id,
        evidenceIds: ids,
      });
      if (result.ok) onChanged(result.value);
      else setError(result.error.message);
    } catch {
      setError('Evidence order could not be saved.');
    }
  };

  if (details.evidence.length === 0) {
    return <p className="px-5 py-6 text-sm text-zinc-500">No Evidence has been attached.</p>;
  }
  return (
    <>
      {error ? (
        <p
          className="border-b border-red-200 bg-red-50 px-5 py-2 text-xs text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <ul aria-label="Question Evidence" className="divide-y divide-zinc-200">
        {details.evidence.map((evidence, index) => (
          <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-5 py-4" key={evidence.id}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {evidence.kind === 'code' ? (
                  <Code2 aria-hidden="true" className="size-4 text-sky-700" />
                ) : (
                  <FileText aria-hidden="true" className="size-4 text-emerald-700" />
                )}
                <span className="text-xs font-semibold uppercase text-zinc-500">
                  {evidence.kind === 'code' ? 'Code Evidence' : 'Zotero Evidence'}
                </span>
                {evidence.availability !== 'available' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                    <AlertTriangle aria-hidden="true" className="size-3.5" />
                    {evidence.availability}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 truncate text-sm font-medium text-zinc-900">
                {evidenceTitle(evidence)}
              </p>
              <p className="mt-1 break-all font-mono text-xs text-zinc-500">
                {evidenceLocation(evidence)}
              </p>
              {evidence.note ? <p className="mt-2 text-sm text-zinc-700">{evidence.note}</p> : null}
              {evidence.availabilityReason ? (
                <p className="mt-1 text-xs text-amber-700">{evidence.availabilityReason}</p>
              ) : null}
              <p className="mt-2 text-xs text-zinc-400">
                Recorded {new Date(evidence.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="flex items-start gap-1">
              <button
                aria-label="Move Evidence up"
                className="icon-button"
                disabled={disabled || index === 0}
                title="Move up"
                type="button"
                onClick={() => void reorder(index, -1)}
              >
                <ArrowUp aria-hidden="true" className="size-4" />
              </button>
              <button
                aria-label="Move Evidence down"
                className="icon-button"
                disabled={disabled || index === details.evidence.length - 1}
                title="Move down"
                type="button"
                onClick={() => void reorder(index, 1)}
              >
                <ArrowDown aria-hidden="true" className="size-4" />
              </button>
              <button
                aria-label="Open Evidence source"
                className="icon-button"
                title="Open source"
                type="button"
                onClick={() =>
                  void (async () => {
                    setError(null);
                    try {
                      const result = await window.paperMind.question.openEvidence(
                        identity(evidence.id),
                      );
                      if (!result.ok) return setError(result.error.message);
                      if (!result.value.opened || result.value.reason)
                        window.alert(
                          result.value.reason ?? 'The Evidence source could not be opened.',
                        );
                    } catch {
                      setError('The Evidence source could not be opened.');
                    }
                  })()
                }
              >
                <ExternalLink aria-hidden="true" className="size-4" />
              </button>
              <button
                aria-label="Remove Evidence"
                className="icon-button text-red-700"
                disabled={disabled}
                title="Remove Evidence"
                type="button"
                onClick={() =>
                  void (async () => {
                    setError(null);
                    try {
                      const result = await window.paperMind.question.removeEvidence(
                        identity(evidence.id),
                      );
                      if (result.ok) onChanged(result.value);
                      else setError(result.error.message);
                    } catch {
                      setError('The Evidence could not be removed.');
                    }
                  })()
                }
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function evidenceTitle(evidence: EvidenceReference): string {
  if (evidence.kind === 'code') return evidence.symbolName ?? evidence.relativePath;
  return evidence.item?.title ?? `Zotero item ${evidence.itemRef.itemKey}`;
}

function evidenceLocation(evidence: EvidenceReference): string {
  if (evidence.kind === 'code')
    return `${evidence.repositoryName ?? evidence.repositoryId}/${evidence.relativePath}:${String(evidence.startLine)}-${String(evidence.endLine)}`;
  return evidence.pageNumber
    ? `Zotero ${evidence.itemRef.itemKey}, page ${String(evidence.pageNumber)}`
    : `Zotero ${evidence.itemRef.itemKey}`;
}
