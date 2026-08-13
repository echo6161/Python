import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  CircleHelp,
  FileCode2,
  FileText,
  GitBranch,
  Link2,
  LockKeyhole,
  RefreshCw,
  ListChecks,
} from 'lucide-react';

import type { PaperCodeLink } from '../../../shared/contracts/paper-code-link';
import type { ResearchQuestion } from '../../../shared/contracts/question';
import type { WorkspaceRepositoryRef } from '../../../shared/contracts/repository';
import type { ResearchPlan } from '../../../shared/contracts/research-plan';
import type {
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceZoteroPaper,
} from '../../../shared/contracts/workspace';
import { rendererLogger } from '../../logger';
import { zoteroCreatorNames, zoteroPdfLabel } from '../../workspace/zotero-display';
import { WorkspaceDetailsEditor } from './WorkspaceDetailsEditor';

export type WorkspaceTab =
  'chat' | 'code' | 'knowledge' | 'links' | 'notes' | 'overview' | 'papers' | 'plan' | 'questions';

interface WorkspaceDashboardProps {
  readonly busy: boolean;
  readonly workspace: Workspace;
  readonly onNavigate: (tab: WorkspaceTab) => void;
  readonly onUpdate: (input: UpdateWorkspaceInput) => Promise<boolean>;
}

interface DashboardData {
  readonly links: readonly PaperCodeLink[];
  readonly papers: readonly WorkspaceZoteroPaper[];
  readonly questions: readonly ResearchQuestion[];
  readonly repositories: readonly WorkspaceRepositoryRef[];
  readonly plan: ResearchPlan | null;
}

const emptyData: DashboardData = {
  links: [],
  papers: [],
  questions: [],
  repositories: [],
  plan: null,
};

export function WorkspaceDashboard({
  busy,
  workspace,
  onNavigate,
  onUpdate,
}: WorkspaceDashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [papers, repositories, questions, links, plan] = await Promise.all([
        window.paperMind.workspace.listPapers(workspace.id),
        window.paperMind.repository.listForWorkspace(workspace.id),
        window.paperMind.question.list(workspace.id),
        window.paperMind.paperCodeLink.listForWorkspace(workspace.id),
        window.paperMind.researchPlan.getActive(workspace.id),
      ]);
      const failed = [papers, repositories, questions, links, plan].find((result) => !result.ok);
      if (failed) {
        setData(emptyData);
        setError(failed.error.message);
        return;
      }
      if (!papers.ok || !repositories.ok || !questions.ok || !links.ok || !plan.ok) return;
      setData({
        links: links.value,
        papers: papers.value,
        questions: questions.value,
        repositories: repositories.value,
        plan: plan.value,
      });
    } catch (caught) {
      rendererLogger.error('Unable to load Workspace dashboard', caught);
      setData(emptyData);
      setError('Workspace overview could not be loaded.');
    }
  }, [workspace.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <div className="workspace-dashboard mx-auto w-full max-w-[1600px] p-4 xl:p-5">
      {error ? (
        <div
          className="mb-4 flex items-center justify-between border border-red-900/70 bg-red-950/40 px-4 py-3 text-sm text-red-200"
          role="alert"
        >
          <span>{error}</span>
          <button
            className="text-button inline-flex items-center gap-1"
            type="button"
            onClick={() => void load()}
          >
            <RefreshCw aria-hidden="true" className="size-4" /> Retry
          </button>
        </div>
      ) : null}

      <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <div className="workspace-panel min-w-0">
            <WorkspaceDetailsEditor busy={busy} workspace={workspace} onUpdate={onUpdate} />
          </div>
          <SummaryPanel
            action="Open Questions"
            icon={CircleHelp}
            title="Research Questions"
            onAction={() => onNavigate('questions')}
          >
            <QuestionSummary questions={data?.questions ?? null} />
          </SummaryPanel>
          <SummaryPanel
            action="Open Plan"
            icon={ListChecks}
            title="Research Plan"
            onAction={() => onNavigate('plan')}
          >
            <PlanSummary plan={data?.plan ?? null} />
          </SummaryPanel>

          <SummaryPanel
            action="Open Papers"
            icon={FileText}
            title="Zotero Papers"
            onAction={() => onNavigate('papers')}
          >
            <PaperSummary papers={data?.papers ?? null} />
          </SummaryPanel>
          <SummaryPanel
            action="Open Code"
            icon={FileCode2}
            title="Repositories"
            onAction={() => onNavigate('code')}
          >
            <RepositorySummary repositories={data?.repositories ?? null} />
          </SummaryPanel>
        </div>

        <aside aria-label="Workspace context" className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-1">
          <SummaryPanel
            action="View Links"
            icon={Link2}
            title="Paper-Code Links"
            onAction={() => onNavigate('links')}
          >
            <LinkSummary links={data?.links ?? null} />
          </SummaryPanel>
          <FutureTools />
        </aside>
      </div>
    </div>
  );
}

function SummaryPanel({
  action,
  children,
  icon: Icon,
  onAction,
  title,
}: {
  readonly action: string;
  readonly children: React.ReactNode;
  readonly icon: typeof FileText;
  readonly onAction: () => void;
  readonly title: string;
}) {
  return (
    <section
      className="workspace-panel min-h-52 overflow-hidden"
      aria-labelledby={`dashboard-${title.replaceAll(' ', '-').toLowerCase()}`}
    >
      <header className="flex h-11 items-center justify-between border-b border-zinc-800 px-4">
        <h2
          className="flex items-center gap-2 text-sm font-semibold text-zinc-100"
          id={`dashboard-${title.replaceAll(' ', '-').toLowerCase()}`}
        >
          <Icon aria-hidden="true" className="size-4 text-sky-400" />
          {title}
        </h2>
        <button
          className="text-button inline-flex items-center gap-1"
          type="button"
          onClick={onAction}
        >
          {action} <ArrowRight aria-hidden="true" className="size-3.5" />
        </button>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function QuestionSummary({
  questions,
}: {
  readonly questions: readonly ResearchQuestion[] | null;
}) {
  if (questions === null) return <Loading label="Loading questions..." />;
  const active = questions.filter(({ archivedAt }) => !archivedAt).slice(0, 4);
  if (active.length === 0) return <Empty>No Research Questions yet.</Empty>;
  return (
    <ul className="space-y-2">
      {active.map((question) => (
        <li className="flex items-start justify-between gap-3 text-sm" key={question.id}>
          <span className="line-clamp-2 text-zinc-200">{question.title}</span>
          <StatusPill value={question.status} />
        </li>
      ))}
    </ul>
  );
}

function PlanSummary({ plan }: { readonly plan: ResearchPlan | null }) {
  if (!plan) return <Empty>No active Research Plan yet.</Empty>;
  const next = plan.tasks.find(({ id }) => id === plan.progress.nextTaskId);
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold tabular-nums text-zinc-100">
            {plan.progress.percent}%
          </p>
          <p className="text-xs text-zinc-500">
            {plan.progress.completed}/{plan.progress.eligible} tasks completed
          </p>
        </div>
        <span className="text-xs text-amber-400">{plan.progress.blocked} blocked</span>
      </div>
      <div
        className="mt-3 h-1.5 bg-zinc-800"
        role="progressbar"
        aria-valuenow={plan.progress.percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full bg-sky-500" style={{ width: `${String(plan.progress.percent)}%` }} />
      </div>
      <p className="mt-4 text-xs uppercase text-zinc-500">Next action</p>
      <p className="mt-1 line-clamp-2 text-sm font-medium text-zinc-200">
        {next?.title ?? 'No unblocked task is ready.'}
      </p>
      <p className="mt-2 text-[11px] text-zinc-600">Task completion only, not research validity.</p>
    </div>
  );
}

function PaperSummary({ papers }: { readonly papers: readonly WorkspaceZoteroPaper[] | null }) {
  if (papers === null) return <Loading label="Loading Zotero papers..." />;
  if (papers.length === 0)
    return (
      <Empty>
        No Zotero papers in this Workspace.
        <span className="mt-1 block">
          Define the research goal, then add relevant papers from Zotero.
        </span>
      </Empty>
    );
  return (
    <ul className="space-y-3">
      {papers.slice(0, 4).map((paper) => (
        <li
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"
          key={`${paper.itemRef.serverId}:${paper.itemRef.library.type}:${paper.itemRef.library.id}:${paper.itemRef.itemKey}`}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-100">{paperTitle(paper)}</p>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {paper.item
                ? zoteroCreatorNames(paper.item) || 'No creators'
                : paperAvailabilityLabel(paper.availability)}
            </p>
          </div>
          <span
            className={
              paper.availability === 'available'
                ? 'text-xs text-emerald-400'
                : 'text-xs text-amber-400'
            }
          >
            {paper.item
              ? zoteroPdfLabel(paper.item.pdf)
              : paperAvailabilityLabel(paper.availability)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RepositorySummary({
  repositories,
}: {
  readonly repositories: readonly WorkspaceRepositoryRef[] | null;
}) {
  if (repositories === null) return <Loading label="Loading repositories..." />;
  if (repositories.length === 0) return <Empty>No repositories in this Workspace.</Empty>;
  return (
    <ul className="space-y-3">
      {repositories.slice(0, 4).map((repository) => (
        <li className="flex items-center justify-between gap-3" key={repository.id}>
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-sm font-medium text-zinc-100">
              <GitBranch aria-hidden="true" className="size-3.5 shrink-0 text-emerald-400" />
              <span className="truncate">{repository.displayName}</span>
            </p>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {repository.currentBranch ?? repository.kind.replace('_', ' ')}
              {repository.headCommit ? ` | ${repository.headCommit.slice(0, 10)}` : ''}
            </p>
          </div>
          <StatusPill value={repository.availability} />
        </li>
      ))}
    </ul>
  );
}

function LinkSummary({ links }: { readonly links: readonly PaperCodeLink[] | null }) {
  if (links === null) return <Loading label="Loading links..." />;
  if (links.length === 0) return <Empty>No paper-code links yet.</Empty>;
  return (
    <ul className="space-y-3">
      {links.slice(0, 4).map((link) => (
        <li key={link.id}>
          <p className="truncate text-sm font-medium text-zinc-100">{linkTitle(link)}</p>
          <p className="mt-0.5 truncate font-mono text-xs text-zinc-500">
            {link.relativePath}:{link.startLine}-{link.endLine}
          </p>
          <span className="mt-1 inline-block text-xs text-sky-400">
            {link.relationType.replaceAll('_', ' ')}
          </span>
        </li>
      ))}
    </ul>
  );
}

function FutureTools() {
  const items = ['Experiments', 'Graph'] as const;
  return (
    <section aria-labelledby="future-tools-heading" className="workspace-panel overflow-hidden">
      <header className="flex h-11 items-center border-b border-zinc-800 px-4">
        <h2 id="future-tools-heading" className="text-sm font-semibold text-zinc-100">
          Research tools
        </h2>
      </header>
      <ul className="divide-y divide-zinc-800">
        {items.map((item) => (
          <li
            className="flex h-10 items-center justify-between px-4 text-sm text-zinc-500"
            key={item}
          >
            <span>{item}</span>
            <span
              aria-label={`${item}: Coming later`}
              className="inline-flex items-center gap-1 text-xs"
            >
              <LockKeyhole aria-hidden="true" className="size-3" /> Coming later
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusPill({ value }: { readonly value: string }) {
  const positive =
    value === 'active' || value === 'available' || value === 'understood' || value === 'closed';
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-xs capitalize ${positive ? 'bg-emerald-950 text-emerald-300' : 'bg-zinc-800 text-zinc-400'}`}
    >
      {value.replaceAll('_', ' ')}
    </span>
  );
}

function Loading({ label }: { readonly label: string }) {
  return <p className="text-sm text-zinc-500">{label}</p>;
}

function Empty({ children }: { readonly children: React.ReactNode }) {
  return <p className="text-sm text-zinc-500">{children}</p>;
}

function paperAvailabilityLabel(value: WorkspaceZoteroPaper['availability']): string {
  if (value === 'missing') return 'Missing in Zotero';
  if (value === 'stale_identity') return 'Different Zotero profile';
  if (value === 'unavailable') return 'Zotero unavailable';
  return 'Available';
}

function paperTitle(paper: WorkspaceZoteroPaper): string {
  return nonEmpty(paper.item?.title) ?? `Zotero item ${paper.itemRef.itemKey}`;
}

function linkTitle(link: PaperCodeLink): string {
  return (
    nonEmpty(link.label) ?? nonEmpty(link.item?.title) ?? `Zotero item ${link.itemRef.itemKey}`
  );
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed?.length ? trimmed : undefined;
}
