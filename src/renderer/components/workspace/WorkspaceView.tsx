import { useState } from 'react';
import { FolderKanban, Plus, RefreshCw } from 'lucide-react';

import type { AppView } from '../Sidebar';
import { useWorkspaceController } from '../../workspace/use-workspace-controller';
import { WorkspaceCreateDialog } from './WorkspaceCreateDialog';
import { WorkspaceNavigator } from './WorkspaceNavigator';
import { WorkspaceOverview } from './WorkspaceOverview';

interface WorkspaceViewProps {
  readonly appVersion?: string;
  readonly onNavigateApp?: (view: AppView) => void;
}

export function WorkspaceView({
  appVersion = '0.12.0',
  onNavigateApp = () => undefined,
}: WorkspaceViewProps = {}) {
  const controller = useWorkspaceController();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <main className="workspace-root flex h-screen min-h-[680px] min-w-[1024px] flex-1 overflow-hidden bg-[#0b1017] text-zinc-200">
      <WorkspaceNavigator
        appVersion={appVersion}
        currentId={controller.current?.id ?? null}
        loading={controller.loading}
        workspaces={controller.workspaces}
        onCreate={() => setShowCreate(true)}
        onNavigateApp={onNavigateApp}
        onSelect={(workspace) => void controller.select(workspace)}
      />

      <section className="min-w-0 flex-1 overflow-hidden">
        {controller.feedback ? (
          <div
            className={`sticky top-0 z-10 border-b px-7 py-2 text-sm ${
              controller.feedback.kind === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
            role={controller.feedback.kind === 'error' ? 'alert' : 'status'}
          >
            {controller.feedback.message}
          </div>
        ) : null}

        {controller.loading ? (
          <div className="flex h-full min-h-96 items-center justify-center text-sm text-zinc-500">
            Loading Workspaces...
          </div>
        ) : controller.current ? (
          <WorkspaceOverview
            key={controller.current.id}
            busy={controller.busy}
            workspace={controller.current}
            onDelete={controller.deleteCurrent}
            onSetStatus={controller.setStatus}
            onUpdate={controller.update}
          />
        ) : (
          <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center px-8 py-16 text-center">
            <FolderKanban aria-hidden="true" className="size-10 text-zinc-400" />
            <h1 className="mt-5 text-xl font-semibold text-zinc-50">Create a research Workspace</h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-zinc-400">
              Start with a clear research goal, then add references from your Zotero library.
            </p>
            <button
              className="command-button mt-6"
              type="button"
              onClick={() => setShowCreate(true)}
            >
              <Plus aria-hidden="true" className="size-4" />
              Create Workspace
            </button>
            {controller.feedback?.kind === 'error' ? (
              <button
                className="text-button mt-3"
                type="button"
                onClick={() => void controller.reload()}
              >
                <RefreshCw aria-hidden="true" className="mr-1 inline size-4" />
                Retry
              </button>
            ) : null}
          </div>
        )}
      </section>

      {showCreate ? (
        <WorkspaceCreateDialog
          busy={controller.busy}
          onClose={() => setShowCreate(false)}
          onCreate={async (input) => {
            const created = await controller.create(input);
            if (created) setShowCreate(false);
          }}
        />
      ) : null}
    </main>
  );
}
