import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { Edit3, Save, Target, X } from 'lucide-react';

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
      <section aria-labelledby="research-goal-heading" className="workspace-panel overview-panel">
        <header className="overview-panel-header">
          <div className="overview-panel-title-group">
            <Target aria-hidden="true" className="overview-panel-icon" />
            <h2 id="research-goal-heading">Research Goal</h2>
            <span className="overview-panel-meta">Primary context</span>
          </div>
          <button
            className="overview-text-action"
            disabled={workspace.status === 'archived'}
            type="button"
            onClick={() => setEditing(true)}
          >
            <Edit3 aria-hidden="true" className="size-4" />
            Edit
          </button>
        </header>
        <div className="overview-goal-body">
          {workspace.researchGoal ? (
            <p className="overview-goal-text">{workspace.researchGoal}</p>
          ) : (
            <div className="overview-goal-empty">
              <div>
                <p>Define what this research should answer.</p>
                <span>A focused goal makes the next paper choices easier.</span>
              </div>
              <button
                className="overview-primary-action"
                type="button"
                onClick={() => setEditing(true)}
              >
                <Edit3 aria-hidden="true" className="size-4" />
                Define goal
              </button>
            </div>
          )}
          {workspace.description ? (
            <p className="overview-goal-description">{workspace.description}</p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="research-goal-heading" className="workspace-panel overview-panel">
      <header className="overview-panel-header">
        <div className="overview-panel-title-group">
          <Target aria-hidden="true" className="overview-panel-icon" />
          <h2 id="research-goal-heading">Edit Workspace</h2>
        </div>
      </header>
      <form className="overview-goal-form" onSubmit={(event) => void save(event)}>
        <Field label="Workspace name" name="workspace-edit-name">
          <input
            autoFocus
            id="workspace-edit-name"
            className="overview-form-control"
            maxLength={200}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Research Goal" name="workspace-edit-goal">
          <textarea
            id="workspace-edit-goal"
            className="overview-form-control overview-goal-input"
            maxLength={10_000}
            value={researchGoal}
            onChange={(event) => setResearchGoal(event.target.value)}
          />
        </Field>
        <Field label="Description" name="workspace-edit-description">
          <textarea
            id="workspace-edit-description"
            className="overview-form-control overview-description-input"
            maxLength={4_000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <div className="overview-form-actions">
          <button
            className="overview-secondary-action"
            disabled={busy}
            type="button"
            onClick={cancel}
          >
            <X aria-hidden="true" className="size-4" />
            Cancel
          </button>
          <button className="overview-primary-action" disabled={busy || !name.trim()} type="submit">
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
    <div className="overview-field">
      <label htmlFor={name}>{label}</label>
      {children}
    </div>
  );
}
