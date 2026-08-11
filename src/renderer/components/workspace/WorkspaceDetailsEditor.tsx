import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { Edit3, Save, X } from 'lucide-react';

import type { UpdateWorkspaceInput, Workspace } from '../../../shared/contracts/workspace';

interface WorkspaceDetailsEditorProps {
  readonly busy: boolean;
  readonly workspace: Workspace;
  readonly onUpdate: (input: UpdateWorkspaceInput) => Promise<boolean>;
}

export function WorkspaceDetailsEditor({ busy, workspace, onUpdate }: WorkspaceDetailsEditorProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description);
  const [researchGoal, setResearchGoal] = useState(workspace.researchGoal);

  const cancel = () => {
    setName(workspace.name);
    setDescription(workspace.description);
    setResearchGoal(workspace.researchGoal);
    setEditing(false);
  };

  const save = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const saved = await onUpdate({
      id: workspace.id,
      rowVersion: workspace.rowVersion,
      name,
      description,
      researchGoal,
    });
    if (saved) setEditing(false);
  };

  if (!editing) {
    return (
      <section
        aria-labelledby="research-goal-heading"
        className="border-y border-zinc-200 bg-white"
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
          <h2 id="research-goal-heading" className="text-sm font-semibold text-zinc-900">
            Research Goal
          </h2>
          <button
            className="text-button inline-flex items-center gap-1"
            disabled={workspace.status === 'archived'}
            type="button"
            onClick={() => setEditing(true)}
          >
            <Edit3 aria-hidden="true" className="size-4" />
            Edit
          </button>
        </header>
        <div className="px-5 py-5">
          {workspace.researchGoal ? (
            <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-800">
              {workspace.researchGoal}
            </p>
          ) : (
            <div>
              <p className="text-sm font-medium text-zinc-800">
                Define what this research should answer.
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                A focused goal makes the next paper choices easier.
              </p>
              <button
                className="command-button mt-4"
                type="button"
                onClick={() => setEditing(true)}
              >
                <Edit3 aria-hidden="true" className="size-4" />
                Define goal
              </button>
            </div>
          )}
          {workspace.description ? (
            <p className="mt-4 border-t border-zinc-100 pt-4 text-sm text-zinc-500">
              {workspace.description}
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="research-goal-heading" className="border-y border-zinc-200 bg-white">
      <header className="border-b border-zinc-200 px-5 py-3">
        <h2 id="research-goal-heading" className="text-sm font-semibold text-zinc-900">
          Edit Workspace
        </h2>
      </header>
      <form className="space-y-4 px-5 py-5" onSubmit={(event) => void save(event)}>
        <Field label="Workspace name" name="workspace-edit-name">
          <input
            autoFocus
            id="workspace-edit-name"
            className="h-10 w-full rounded border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            maxLength={200}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Research Goal" name="workspace-edit-goal">
          <textarea
            id="workspace-edit-goal"
            className="min-h-32 w-full resize-y rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            maxLength={10_000}
            value={researchGoal}
            onChange={(event) => setResearchGoal(event.target.value)}
          />
        </Field>
        <Field label="Description" name="workspace-edit-description">
          <textarea
            id="workspace-edit-description"
            className="min-h-20 w-full resize-y rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            maxLength={4_000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4">
          <button
            className="text-button inline-flex items-center gap-1"
            disabled={busy}
            type="button"
            onClick={cancel}
          >
            <X aria-hidden="true" className="size-4" />
            Cancel
          </button>
          <button className="command-button" disabled={busy || !name.trim()} type="submit">
            <Save aria-hidden="true" className="size-4" />
            {busy ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </section>
  );
}

function Field({
  label,
  name,
  children,
}: {
  readonly label: string;
  readonly name: string;
  readonly children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-zinc-700" htmlFor={name}>
        {label}
      </label>
      {children}
    </div>
  );
}
