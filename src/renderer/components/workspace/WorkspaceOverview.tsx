import { useState } from 'react';
import { Archive, Pause, Play, Trash2 } from 'lucide-react';

import type {
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceStatus,
} from '../../../shared/contracts/workspace';
import { ComingLaterSections } from './ComingLaterSections';
import { WorkspaceDetailsEditor } from './WorkspaceDetailsEditor';
import { WorkspaceLifecycleDialog } from './WorkspaceLifecycleDialog';
import { WorkspacePaperSection } from './WorkspacePaperSection';

interface WorkspaceOverviewProps {
  readonly busy: boolean;
  readonly workspace: Workspace;
  readonly onDelete: () => Promise<boolean>;
  readonly onSetStatus: (status: WorkspaceStatus) => Promise<boolean>;
  readonly onUpdate: (input: UpdateWorkspaceInput) => Promise<boolean>;
}

export function WorkspaceOverview({
  busy,
  workspace,
  onDelete,
  onSetStatus,
  onUpdate,
}: WorkspaceOverviewProps) {
  const [confirmation, setConfirmation] = useState<'archive' | 'delete' | null>(null);
  const archived = workspace.status === 'archived';
  const paused = workspace.status === 'paused';

  return (
    <div className="mx-auto max-w-6xl px-7 py-7">
      <header className="mb-7 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-2xl font-semibold text-zinc-950">{workspace.name}</h1>
            <span
              className={`rounded px-2 py-1 text-xs font-semibold capitalize ${statusClass(workspace.status)}`}
            >
              {workspace.status}
            </span>
          </div>
          <p className="mt-2 text-sm text-zinc-500">Research Workspace</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!archived ? (
            <button
              className="text-button inline-flex items-center gap-1 border border-zinc-300"
              disabled={busy}
              type="button"
              onClick={() => void onSetStatus(paused ? 'active' : 'paused')}
            >
              {paused ? (
                <Play aria-hidden="true" className="size-4" />
              ) : (
                <Pause aria-hidden="true" className="size-4" />
              )}
              {paused ? 'Resume' : 'Pause'}
            </button>
          ) : null}
          {!archived ? (
            <button
              className="text-button inline-flex items-center gap-1 border border-zinc-300"
              disabled={busy}
              type="button"
              onClick={() => setConfirmation('archive')}
            >
              <Archive aria-hidden="true" className="size-4" />
              Archive
            </button>
          ) : null}
          <button
            className="text-button inline-flex items-center gap-1 text-red-700"
            disabled={busy}
            type="button"
            onClick={() => setConfirmation('delete')}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Delete
          </button>
        </div>
      </header>

      <div className="space-y-7">
        <WorkspaceDetailsEditor busy={busy} workspace={workspace} onUpdate={onUpdate} />
        <WorkspacePaperSection workspace={workspace} />
        <ComingLaterSections />
      </div>

      {confirmation ? (
        <WorkspaceLifecycleDialog
          action={confirmation}
          busy={busy}
          workspaceName={workspace.name}
          onCancel={() => setConfirmation(null)}
          onConfirm={async () => {
            const completed =
              confirmation === 'archive' ? await onSetStatus('archived') : await onDelete();
            if (completed) setConfirmation(null);
          }}
        />
      ) : null}
    </div>
  );
}

function statusClass(status: WorkspaceStatus): string {
  if (status === 'active') return 'bg-emerald-100 text-emerald-800';
  if (status === 'paused') return 'bg-amber-100 text-amber-800';
  return 'bg-zinc-200 text-zinc-700';
}
