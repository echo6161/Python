import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { CircleHelp, Plus, RefreshCw } from 'lucide-react';

import type { ResearchQuestion } from '../../../../shared/contracts/question';
import type { Workspace } from '../../../../shared/contracts/workspace';
import { rendererLogger } from '../../../logger';
import { QuestionDetail } from './QuestionDetail';

export function WorkspaceQuestionSection({ workspace }: { readonly workspace: Workspace }) {
  const [questions, setQuestions] = useState<readonly ResearchQuestion[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await window.paperMind.question.list(workspace.id);
      if (!result.ok) return setError(result.error.message);
      setQuestions(result.value);
      setSelectedId((current) =>
        current && result.value.some(({ id }) => id === current)
          ? current
          : (result.value.find(({ archivedAt }) => !archivedAt)?.id ?? result.value[0]?.id ?? null),
      );
    } catch (caught) {
      rendererLogger.error('Unable to load Research Questions', caught);
      setError('Research Questions could not be loaded.');
    }
  }, [workspace.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuestions(null);
      setSelectedId(null);
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const create = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const result = await window.paperMind.question.create({
        workspaceId: workspace.id,
        title: formText(form, 'title'),
        description: formText(form, 'description'),
        priority: 'normal',
      });
      if (!result.ok) return setError(result.error.message);
      setCreating(false);
      await load();
      setSelectedId(result.value.id);
    } catch (caught) {
      rendererLogger.error('Unable to create Research Question', caught);
      setError('The Research Question could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const selected = questions?.find(({ id }) => id === selectedId) ?? null;
  return (
    <section
      aria-labelledby="workspace-questions-heading"
      className="border-y border-zinc-200 bg-white"
    >
      <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
        <div>
          <h2 id="workspace-questions-heading" className="text-sm font-semibold text-zinc-900">
            Research Questions
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Workspace-owned questions with traceable paper and code Evidence.
          </p>
        </div>
        <button
          className="command-button"
          disabled={workspace.status === 'archived'}
          type="button"
          onClick={() => setCreating(true)}
        >
          <Plus aria-hidden="true" className="size-4" /> New Question
        </button>
      </header>

      {error ? (
        <div
          className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
          <button
            className="ml-3 font-semibold underline"
            type="button"
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      ) : null}

      {creating ? (
        <form
          className="grid gap-3 border-b border-zinc-200 bg-zinc-50 px-5 py-4"
          onSubmit={(event) => void create(event)}
        >
          <label className="grid gap-1 text-xs font-medium text-zinc-700">
            Question title
            <input
              autoFocus
              className="rounded border border-zinc-300 px-3 py-2 text-sm"
              maxLength={300}
              name="title"
              required
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-zinc-700">
            Description
            <textarea
              className="min-h-20 rounded border border-zinc-300 px-3 py-2 text-sm"
              maxLength={10000}
              name="description"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              className="text-button"
              disabled={busy}
              type="button"
              onClick={() => setCreating(false)}
            >
              Cancel
            </button>
            <button className="command-button" disabled={busy} type="submit">
              Create
            </button>
          </div>
        </form>
      ) : null}

      {questions === null ? (
        <p className="px-5 py-8 text-sm text-zinc-500">Loading Research Questions...</p>
      ) : questions.length === 0 ? (
        <div className="px-5 py-8">
          <CircleHelp aria-hidden="true" className="size-6 text-zinc-400" />
          <p className="mt-3 text-sm font-medium text-zinc-800">No Research Questions yet.</p>
          <p className="mt-1 text-sm text-zinc-500">
            Turn the Workspace goal into a question, then attach relevant Evidence.
          </p>
        </div>
      ) : (
        <div className="grid min-h-80 grid-cols-[260px_minmax(0,1fr)] divide-x divide-zinc-200">
          <nav aria-label="Research Questions" className="divide-y divide-zinc-200">
            {questions.map((question) => (
              <button
                aria-current={selectedId === question.id ? 'page' : undefined}
                className={`block w-full px-4 py-3 text-left ${selectedId === question.id ? 'bg-zinc-100' : 'bg-white hover:bg-zinc-50'}`}
                key={question.id}
                type="button"
                onClick={() => setSelectedId(question.id)}
              >
                <span className="block line-clamp-2 text-sm font-medium text-zinc-900">
                  {question.title}
                </span>
                <span className="mt-1 block text-xs capitalize text-zinc-500">
                  {question.status} | {question.priority}
                  {question.archivedAt ? ' | archived' : ''}
                </span>
              </button>
            ))}
          </nav>
          {selected ? (
            <QuestionDetail
              key={selected.id}
              question={selected}
              workspace={workspace}
              onChanged={async (nextId = selected.id) => {
                await load();
                setSelectedId(nextId);
              }}
              onDeleted={async () => {
                await load();
                setSelectedId(null);
              }}
            />
          ) : (
            <div className="flex items-center justify-center text-sm text-zinc-500">
              <RefreshCw aria-hidden="true" className="mr-2 size-4" /> Select a question.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}
