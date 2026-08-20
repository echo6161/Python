import { useState } from 'react';
import {
  Archive,
  CircleHelp,
  FileCode2,
  FileText,
  LayoutDashboard,
  Link2,
  Search,
  Network,
  NotebookPen,
  Pause,
  Play,
  TestTube2,
  Trash2,
  MessageSquareText,
  ListChecks,
  Bot,
} from 'lucide-react';

import type {
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceStatus,
} from '../../../shared/contracts/workspace';
import { PaperCodeLinkSection } from './paper-code-link/PaperCodeLinkSection';
import { WorkspaceRepositorySection } from './repository/WorkspaceRepositorySection';
import { WorkspaceDashboard, type WorkspaceTab } from './WorkspaceDashboard';
import { WorkspaceLifecycleDialog } from './WorkspaceLifecycleDialog';
import { WorkspacePaperSection } from './WorkspacePaperSection';
import { WorkspaceQuestionSection } from './question/WorkspaceQuestionSection';
import { WorkspaceKnowledgePage } from './knowledge/WorkspaceKnowledgePage';
import { WorkspaceResearchChatPage } from './research-chat/WorkspaceResearchChatPage';
import { WorkspaceResearchMemoryPage } from './research-memory/WorkspaceResearchMemoryPage';
import { WorkspaceResearchPlanPage } from './research-plan/WorkspaceResearchPlanPage';
import { WorkspaceResearchAgentPage } from './research-agent/WorkspaceResearchAgentPage';
import { WorkspaceExperimentPage } from './experiment/WorkspaceExperimentPage';
import { WorkspaceResearchGraphPage } from './research-graph/WorkspaceResearchGraphPage';

interface WorkspaceOverviewProps {
  readonly busy: boolean;
  readonly workspace: Workspace;
  readonly onDelete: () => Promise<boolean>;
  readonly onSetStatus: (status: WorkspaceStatus) => Promise<boolean>;
  readonly onUpdate: (input: UpdateWorkspaceInput) => Promise<boolean>;
}

const activeTabs = [
  { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
  { id: 'papers', icon: FileText, label: 'Papers' },
  { id: 'code', icon: FileCode2, label: 'Code' },
  { id: 'questions', icon: CircleHelp, label: 'Questions' },
  { id: 'links', icon: Link2, label: 'Links' },
  { id: 'knowledge', icon: Search, label: 'Knowledge' },
  { id: 'chat', icon: MessageSquareText, label: 'Chat' },
  { id: 'notes', icon: NotebookPen, label: 'Notes' },
  { id: 'plan', icon: ListChecks, label: 'Plan' },
  { id: 'agent', icon: Bot, label: 'Agent' },
  { id: 'experiments', icon: TestTube2, label: 'Experiments' },
  { id: 'graph', icon: Network, label: 'Graph' },
] as const;

const futureTabs: readonly { readonly icon: typeof Network; readonly label: string }[] = [];

export function WorkspaceOverview({
  busy,
  workspace,
  onDelete,
  onSetStatus,
  onUpdate,
}: WorkspaceOverviewProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [confirmation, setConfirmation] = useState<'archive' | 'delete' | null>(null);
  const archived = workspace.status === 'archived';
  const paused = workspace.status === 'paused';

  return (
    <div className="workspace-shell flex h-full min-w-0 flex-col bg-[#0b1017] text-zinc-200">
      <header className="flex min-h-16 items-center justify-between gap-5 border-b border-zinc-800 bg-[#0d131c] px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="truncate text-lg font-semibold text-zinc-50">{workspace.name}</h1>
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold capitalize ${statusClass(workspace.status)}`}
            >
              {workspace.status}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-zinc-500">
            {workspace.researchGoal || 'Research goal not defined'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!archived ? (
            <button
              aria-label={paused ? 'Resume Workspace' : 'Pause Workspace'}
              className="icon-button"
              disabled={busy}
              title={paused ? 'Resume Workspace' : 'Pause Workspace'}
              type="button"
              onClick={() => void onSetStatus(paused ? 'active' : 'paused')}
            >
              {paused ? (
                <Play aria-hidden="true" className="size-4" />
              ) : (
                <Pause aria-hidden="true" className="size-4" />
              )}
            </button>
          ) : null}
          {!archived ? (
            <button
              aria-label="Archive"
              className="icon-button"
              disabled={busy}
              title="Archive Workspace"
              type="button"
              onClick={() => setConfirmation('archive')}
            >
              <Archive aria-hidden="true" className="size-4" />
            </button>
          ) : null}
          <button
            aria-label="Delete"
            className="icon-button text-red-400"
            disabled={busy}
            title="Delete Workspace"
            type="button"
            onClick={() => setConfirmation('delete')}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        </div>
      </header>

      <nav
        aria-label="Workspace sections"
        className="workspace-tabs flex h-11 shrink-0 items-stretch gap-1 overflow-x-auto border-b border-zinc-800 bg-[#0d131c] px-4"
        role="tablist"
      >
        {activeTabs.map(({ id, icon: Icon, label }) => (
          <button
            aria-controls={`workspace-panel-${id}`}
            aria-selected={activeTab === id}
            className="workspace-tab"
            id={`workspace-tab-${id}`}
            key={id}
            role="tab"
            type="button"
            onClick={() => setActiveTab(id)}
          >
            <Icon aria-hidden="true" className="size-3.5" /> {label}
          </button>
        ))}
        <span aria-hidden="true" className="my-2 ml-1 w-px shrink-0 bg-zinc-800" />
        {futureTabs.map(({ icon: Icon, label }) => (
          <button
            aria-label={`${label}: Coming later`}
            className="workspace-tab"
            disabled
            key={label}
            title={`${label} - Coming later`}
            type="button"
          >
            <Icon aria-hidden="true" className="size-3.5" /> {label}
          </button>
        ))}
      </nav>

      <section
        aria-labelledby={`workspace-tab-${activeTab}`}
        className="min-h-0 flex-1 overflow-y-auto"
        id={`workspace-panel-${activeTab}`}
        role="tabpanel"
      >
        {activeTab === 'overview' ? (
          <WorkspaceDashboard
            busy={busy}
            workspace={workspace}
            onNavigate={setActiveTab}
            onUpdate={onUpdate}
          />
        ) : (
          <div
            className={
              activeTab === 'knowledge' ||
              activeTab === 'chat' ||
              activeTab === 'notes' ||
              activeTab === 'plan' ||
              activeTab === 'agent' ||
              activeTab === 'experiments' ||
              activeTab === 'graph'
                ? 'h-full'
                : 'mx-auto w-full max-w-[1600px] p-4 xl:p-5'
            }
          >
            {activeTab === 'papers' ? <WorkspacePaperSection workspace={workspace} /> : null}
            {activeTab === 'code' ? <WorkspaceRepositorySection workspace={workspace} /> : null}
            {activeTab === 'questions' ? <WorkspaceQuestionSection workspace={workspace} /> : null}
            {activeTab === 'links' ? <PaperCodeLinkSection workspace={workspace} /> : null}
            {activeTab === 'knowledge' ? (
              <WorkspaceKnowledgePage workspace={workspace} onNavigate={setActiveTab} />
            ) : null}
            {activeTab === 'chat' ? <WorkspaceResearchChatPage workspace={workspace} /> : null}
            {activeTab === 'notes' ? (
              <WorkspaceResearchMemoryPage workspace={workspace} onNavigate={setActiveTab} />
            ) : null}
            {activeTab === 'plan' ? <WorkspaceResearchPlanPage workspace={workspace} /> : null}
            {activeTab === 'agent' ? <WorkspaceResearchAgentPage workspace={workspace} /> : null}
            {activeTab === 'experiments' ? <WorkspaceExperimentPage workspace={workspace} /> : null}
            {activeTab === 'graph' ? <WorkspaceResearchGraphPage workspace={workspace} /> : null}
          </div>
        )}
      </section>

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
  if (status === 'active') return 'bg-emerald-950 text-emerald-300';
  if (status === 'paused') return 'bg-amber-950 text-amber-300';
  return 'bg-zinc-800 text-zinc-400';
}
