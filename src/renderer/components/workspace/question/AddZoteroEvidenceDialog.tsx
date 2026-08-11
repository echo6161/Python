import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { FileText, X } from 'lucide-react';

import type { ResearchQuestionDetails } from '../../../../shared/contracts/question';
import type { WorkspaceZoteroPaper } from '../../../../shared/contracts/workspace';

export function AddZoteroEvidenceDialog({
  workspaceId,
  questionId,
  onClose,
  onAdded,
}: {
  readonly workspaceId: string;
  readonly questionId: string;
  readonly onClose: () => void;
  readonly onAdded: (details: ResearchQuestionDetails) => void;
}) {
  const [papers, setPapers] = useState<readonly WorkspaceZoteroPaper[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    first.current?.focus();
    void window.paperMind.workspace
      .listPapers(workspaceId)
      .then((result) => {
        if (!result.ok) return setError(result.error.message);
        const available = result.value.filter(
          ({ availability, item }) => availability === 'available' && item,
        );
        setPapers(available);
        setSelected(available[0] ? paperKey(available[0]) : '');
      })
      .catch(() => setError('Workspace papers could not be loaded.'));
  }, [workspaceId]);

  const submit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const paper = papers.find((candidate) => paperKey(candidate) === selected);
    if (!paper) return;
    const form = new FormData(event.currentTarget);
    const page = formText(form, 'page').trim();
    const exact = formText(form, 'exact').trim();
    setBusy(true);
    try {
      const result = await window.paperMind.question.addZoteroEvidence({
        workspaceId,
        questionId,
        itemRef: paper.itemRef,
        note: formText(form, 'note'),
        ...(page ? { pageNumber: Number(page) } : {}),
        ...(exact ? { textAnchor: { exact, prefix: '', suffix: '' } } : {}),
      });
      if (result.ok) onAdded(result.value);
      else setError(result.error.message);
    } catch {
      setError('The Zotero Evidence could not be added.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <form
        className="w-full max-w-xl rounded border border-zinc-300 bg-white shadow-xl"
        onSubmit={(event) => void submit(event)}
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <FileText aria-hidden="true" className="size-4" />
            Add Zotero Evidence
          </h3>
          <button aria-label="Close" className="icon-button" type="button" onClick={onClose}>
            <X aria-hidden="true" className="size-4" />
          </button>
        </header>
        <div className="grid gap-4 px-5 py-4">
          {error ? (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          <label className="grid gap-1 text-xs font-medium text-zinc-700">
            Workspace paper
            <select
              ref={first}
              className="rounded border border-zinc-300 px-3 py-2 text-sm"
              required
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">Select a paper</option>
              {papers.map((paper) => (
                <option key={paperKey(paper)} value={paperKey(paper)}>
                  {paper.item?.title ?? paper.itemRef.itemKey}
                </option>
              ))}
            </select>
          </label>
          {papers.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Add an available Zotero paper to this Workspace first.
            </p>
          ) : null}
          <label className="grid gap-1 text-xs font-medium text-zinc-700">
            Page (optional)
            <input
              className="rounded border border-zinc-300 px-3 py-2 text-sm"
              max={100000}
              min={1}
              name="page"
              type="number"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-zinc-700">
            Text anchor (optional)
            <textarea
              className="min-h-16 rounded border border-zinc-300 px-3 py-2 text-sm"
              maxLength={2000}
              name="exact"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-zinc-700">
            Your Evidence note
            <textarea
              className="min-h-20 rounded border border-zinc-300 px-3 py-2 text-sm"
              maxLength={4000}
              name="note"
            />
          </label>
        </div>
        <footer className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3">
          <button className="text-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="command-button" disabled={busy || !selected} type="submit">
            Add Evidence
          </button>
        </footer>
      </form>
    </div>
  );
}

function paperKey(paper: WorkspaceZoteroPaper): string {
  return `${paper.itemRef.serverId}:${paper.itemRef.library.type}:${paper.itemRef.library.id}:${paper.itemRef.itemKey}`;
}

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}
