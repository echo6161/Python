import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { Archive, Code2, FileText, Trash2 } from 'lucide-react';

import type {
  ResearchQuestion,
  ResearchQuestionDetails,
  ResearchQuestionPriority,
  ResearchQuestionStatus,
} from '../../../../shared/contracts/question';
import type { Workspace } from '../../../../shared/contracts/workspace';
import { rendererLogger } from '../../../logger';
import { AddCodeEvidenceDialog } from './AddCodeEvidenceDialog';
import { AddZoteroEvidenceDialog } from './AddZoteroEvidenceDialog';
import { EvidenceList } from './EvidenceList';

export function QuestionDetail({
  question,
  workspace,
  onChanged,
  onDeleted,
}: {
  readonly question: ResearchQuestion;
  readonly workspace: Workspace;
  readonly onChanged: (id?: string) => Promise<void>;
  readonly onDeleted: () => Promise<void>;
}) {
  const [details, setDetails] = useState<ResearchQuestionDetails | null>(null);
  const [title, setTitle] = useState(question.title);
  const [description, setDescription] = useState(question.description);
  const [priority, setPriority] = useState<ResearchQuestionPriority>(question.priority);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<'code' | 'paper' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadDetails = useCallback(async () => {
    setError(null);
    try {
      const result = await window.paperMind.question.get({
        workspaceId: workspace.id,
        questionId: question.id,
      });
      if (!result.ok) return setError(result.error.message);
      setDetails(result.value);
    } catch (caught) {
      rendererLogger.error('Unable to load Question Evidence', caught);
      setError('Question Evidence could not be loaded.');
    }
  }, [question.id, workspace.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDetails(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDetails]);

  const mutate = async (
    operation: () => Promise<{
      readonly ok: boolean;
      readonly error?: { readonly message: string };
    }>,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const result = await operation();
      if (!result.ok)
        return setError(result.error?.message ?? 'The Question could not be changed.');
      await onChanged();
    } catch (caught) {
      rendererLogger.error('Unable to change Research Question', caught);
      setError('The Research Question could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  const save = (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    void mutate(() =>
      window.paperMind.question.update({
        id: question.id,
        workspaceId: workspace.id,
        title,
        description,
        priority,
        rowVersion: question.rowVersion,
      }),
    );
  };
  const archived = Boolean(question.archivedAt);
  const disabled = busy || archived || workspace.status === 'archived';

  return (
    <article className="min-w-0">
      {error ? (
        <p
          className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <form className="grid gap-3 border-b border-zinc-200 px-5 py-4" onSubmit={save}>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Question
          <input
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
            disabled={disabled}
            maxLength={300}
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-700">
          Description
          <textarea
            className="min-h-20 rounded border border-zinc-300 px-3 py-2 text-sm"
            disabled={disabled}
            maxLength={10000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-medium text-zinc-700">
            Status
            <select
              className="rounded border border-zinc-300 px-3 py-2 text-sm"
              disabled={disabled}
              value={question.status}
              onChange={(event) =>
                void mutate(() =>
                  window.paperMind.question.setStatus({
                    id: question.id,
                    workspaceId: workspace.id,
                    status: event.target.value as ResearchQuestionStatus,
                    rowVersion: question.rowVersion,
                  }),
                )
              }
            >
              {['unresolved', 'investigating', 'blocked', 'understood', 'closed'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-zinc-700">
            Priority
            <select
              className="rounded border border-zinc-300 px-3 py-2 text-sm"
              disabled={disabled}
              value={priority}
              onChange={(event) => setPriority(event.target.value as ResearchQuestionPriority)}
            >
              {['low', 'normal', 'high', 'critical'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button className="command-button" disabled={disabled} type="submit">
            Save
          </button>
          <button
            className="text-button inline-flex items-center gap-1"
            disabled={busy || workspace.status === 'archived'}
            type="button"
            onClick={() =>
              void mutate(() =>
                window.paperMind.question.archive({
                  id: question.id,
                  workspaceId: workspace.id,
                  archived: !archived,
                  rowVersion: question.rowVersion,
                }),
              )
            }
          >
            <Archive aria-hidden="true" className="size-4" />
            {archived ? 'Restore' : 'Archive'}
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          Created {formatDate(question.createdAt)} | Updated {formatDate(question.updatedAt)}
        </p>
      </form>

      <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
        <h3 className="text-sm font-semibold text-zinc-900">Evidence</h3>
        <div className="flex gap-2">
          <button
            className="text-button inline-flex items-center gap-1"
            disabled={disabled}
            type="button"
            onClick={() => setAdding('paper')}
          >
            <FileText aria-hidden="true" className="size-4" /> Add paper
          </button>
          <button
            className="text-button inline-flex items-center gap-1"
            disabled={disabled}
            type="button"
            onClick={() => setAdding('code')}
          >
            <Code2 aria-hidden="true" className="size-4" /> Add code
          </button>
        </div>
      </header>
      {details ? (
        <EvidenceList
          details={details}
          disabled={disabled}
          onChanged={(next) => setDetails(next)}
        />
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">Resolving Evidence...</p>
      )}

      <div className="border-t border-zinc-200 px-5 py-3 text-right">
        {confirmDelete ? (
          <span className="mr-3 text-xs text-red-700">
            Delete this Question and its PaperMind-owned Evidence only?
          </span>
        ) : null}
        <button
          className="text-button inline-flex items-center gap-1 text-red-700"
          disabled={busy || workspace.status === 'archived'}
          type="button"
          onClick={() => {
            if (!confirmDelete) return setConfirmDelete(true);
            void mutate(async () => {
              const result = await window.paperMind.question.delete({
                workspaceId: workspace.id,
                questionId: question.id,
                confirmation: 'DELETE_QUESTION',
              });
              if (result.ok) await onDeleted();
              return result;
            });
          }}
        >
          <Trash2 aria-hidden="true" className="size-4" />
          {confirmDelete ? 'Confirm delete' : 'Delete Question'}
        </button>
      </div>

      {adding === 'paper' ? (
        <AddZoteroEvidenceDialog
          questionId={question.id}
          workspaceId={workspace.id}
          onClose={() => setAdding(null)}
          onAdded={(next) => {
            setDetails(next);
            setAdding(null);
          }}
        />
      ) : null}
      {adding === 'code' ? (
        <AddCodeEvidenceDialog
          questionId={question.id}
          workspaceId={workspace.id}
          onClose={() => setAdding(null)}
          onAdded={(next) => {
            setDetails(next);
            setAdding(null);
          }}
        />
      ) : null}
    </article>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}
