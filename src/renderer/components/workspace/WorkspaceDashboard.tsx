import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BookOpen,
  CircleHelp,
  FileCode2,
  FileText,
  GitBranch,
  Link2,
  ListChecks,
  NotebookPen,
  RefreshCw,
  SquareTerminal,
  TestTube2,
} from 'lucide-react';

import type { Experiment } from '../../../shared/contracts/experiment';
import type { PaperCodeLink } from '../../../shared/contracts/paper-code-link';
import type { ResearchQuestion } from '../../../shared/contracts/question';
import type { WorkspaceRepositoryRef } from '../../../shared/contracts/repository';
import type { ResearchContentSummary } from '../../../shared/contracts/research-memory';
import type { ResearchPlan } from '../../../shared/contracts/research-plan';
import type {
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceZoteroPaper,
} from '../../../shared/contracts/workspace';
import { rendererLogger } from '../../logger';
import { zoteroCreatorNames, zoteroPdfLabel } from '../../workspace/zotero-display';
import { OverviewAssistantPanel } from './OverviewAssistantPanel';
import { WorkspaceDetailsEditor } from './WorkspaceDetailsEditor';
import { WorkspaceResearchGraphPage } from './research-graph/WorkspaceResearchGraphPage';
import { RepositoryBrowser } from './repository/RepositoryBrowser';

export type WorkspaceTab =
  | 'agent'
  | 'chat'
  | 'code'
  | 'knowledge'
  | 'links'
  | 'notes'
  | 'overview'
  | 'papers'
  | 'plan'
  | 'questions'
  | 'experiments'
  | 'graph';

interface WorkspaceDashboardProps {
  readonly busy: boolean;
  readonly workspace: Workspace;
  readonly onNavigate: (tab: WorkspaceTab) => void;
  readonly onUpdate: (input: UpdateWorkspaceInput) => Promise<boolean>;
}

interface DashboardData {
  readonly experiments: readonly Experiment[];
  readonly links: readonly PaperCodeLink[];
  readonly notes: readonly ResearchContentSummary[];
  readonly papers: readonly WorkspaceZoteroPaper[];
  readonly questions: readonly ResearchQuestion[];
  readonly repositories: readonly WorkspaceRepositoryRef[];
  readonly plan: ResearchPlan | null;
}

const emptyData: DashboardData = {
  experiments: [],
  links: [],
  notes: [],
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
  const [selectedPaperKey, setSelectedPaperKey] = useState<string | null>(null);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [papers, repositories, questions, links, plan, notes, experiments] = await Promise.all([
        window.paperMind.workspace.listPapers(workspace.id),
        window.paperMind.repository.listForWorkspace(workspace.id),
        window.paperMind.question.list(workspace.id),
        window.paperMind.paperCodeLink.listForWorkspace(workspace.id),
        window.paperMind.researchPlan.getActive(workspace.id),
        window.paperMind.researchMemory.list({ workspaceId: workspace.id, types: ['note'] }),
        window.paperMind.experiment.list(workspace.id),
      ]);
      const failed = [papers, repositories, questions, links, plan, notes, experiments].find(
        (result) => !result.ok,
      );
      if (failed) {
        setData(emptyData);
        setError(failed.error.message);
        return;
      }
      if (
        !papers.ok ||
        !repositories.ok ||
        !questions.ok ||
        !links.ok ||
        !plan.ok ||
        !notes.ok ||
        !experiments.ok
      )
        return;
      setData({
        experiments: experiments.value,
        links: links.value,
        notes: notes.value,
        papers: papers.value,
        questions: questions.value,
        repositories: repositories.value,
        plan: plan.value,
      });
      setSelectedPaperKey((current) =>
        papers.value.some((paper) => paperKey(paper) === current)
          ? current
          : papers.value[0]
            ? paperKey(papers.value[0])
            : null,
      );
      setSelectedRepositoryId((current) =>
        repositories.value.some(({ id }) => id === current)
          ? current
          : (repositories.value[0]?.id ?? null),
      );
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

  const papers = data?.papers ?? null;
  const repositories = data?.repositories ?? null;
  const selectedPaper = papers?.find((paper) => paperKey(paper) === selectedPaperKey) ?? null;
  const selectedRepository = repositories?.find(({ id }) => id === selectedRepositoryId) ?? null;

  return (
    <div className="workspace-dashboard workspace-dashboard-integrated">
      {error ? (
        <div className="overview-alert" role="alert">
          <span>{error}</span>
          <button className="overview-text-action" type="button" onClick={() => void load()}>
            <RefreshCw aria-hidden="true" className="size-3.5" /> Retry
          </button>
        </div>
      ) : null}

      <div className="overview-integrated-grid">
        <main className="overview-central-workspace">
          <section className="overview-summary-strip" aria-label="Research summary">
            <WorkspaceDetailsEditor busy={busy} workspace={workspace} onUpdate={onUpdate} />
            <SummaryPanel
              action="View all"
              icon={CircleHelp}
              meta={countLabel(activeQuestions(data?.questions), 'active')}
              title="Research Questions"
              onAction={() => onNavigate('questions')}
            >
              <QuestionSummary
                questions={data?.questions ?? null}
                onAction={() => onNavigate('questions')}
              />
            </SummaryPanel>
            <SummaryPanel
              action="Open plan"
              icon={ListChecks}
              meta={data?.plan ? `${String(data.plan.progress.percent)}%` : undefined}
              title="Reading Plan"
              onAction={() => onNavigate('plan')}
            >
              <PlanSummary plan={data?.plan ?? null} onAction={() => onNavigate('plan')} />
            </SummaryPanel>
          </section>

          <section className="overview-research-workbench" aria-label="Paper and code workspace">
            <PaperWorkbench
              papers={papers}
              selected={selectedPaper}
              selectedKey={selectedPaperKey}
              onNavigate={() => onNavigate('papers')}
              onSelect={setSelectedPaperKey}
            />
            <CodeWorkbench
              repositories={repositories}
              selected={selectedRepository}
              selectedId={selectedRepositoryId}
              workspaceId={workspace.id}
              onNavigate={() => onNavigate('code')}
              onSelect={setSelectedRepositoryId}
            />
          </section>

          <section className="overview-graph-panel" aria-label="Overview Research Graph">
            <WorkspaceResearchGraphPage embedded workspace={workspace} />
          </section>
        </main>

        <aside className="overview-information-rail" aria-label="Workspace information rail">
          <RailPanel
            action="View all"
            icon={Link2}
            meta={countLabel(data?.links.length, 'link')}
            title="Paper-Code Links"
            onAction={() => onNavigate('links')}
          >
            <LinkSummary links={data?.links ?? null} onAction={() => onNavigate('links')} />
          </RailPanel>
          <RailPanel
            action="View all"
            icon={NotebookPen}
            meta={countLabel(data?.notes.length, 'note')}
            title="Recent Notes"
            onAction={() => onNavigate('notes')}
          >
            <NoteSummary notes={data?.notes ?? null} onAction={() => onNavigate('notes')} />
          </RailPanel>
          <RailPanel
            action="View all"
            icon={TestTube2}
            meta={countLabel(data?.experiments.length, 'experiment')}
            title="Experiments"
            onAction={() => onNavigate('experiments')}
          >
            <ExperimentSummary
              experiments={data?.experiments ?? null}
              onAction={() => onNavigate('experiments')}
            />
          </RailPanel>
          <OverviewAssistantPanel workspace={workspace} onOpen={() => onNavigate('chat')} />
        </aside>
      </div>
    </div>
  );
}

function SummaryPanel({ action, children, icon: Icon, meta, onAction, title }: PanelProps) {
  const headingId = `dashboard-${title.replaceAll(' ', '-').toLowerCase()}`;
  return (
    <section className="workspace-panel overview-panel" aria-labelledby={headingId}>
      <header className="overview-panel-header">
        <div className="overview-panel-title-group">
          <Icon aria-hidden="true" className="overview-panel-icon" />
          <h2 id={headingId}>{title}</h2>
          {meta ? <span className="overview-panel-meta">{meta}</span> : null}
        </div>
        <button className="overview-text-action" type="button" onClick={onAction}>
          {action} <ArrowRight aria-hidden="true" className="size-3.5" />
        </button>
      </header>
      <div className="overview-panel-body">{children}</div>
    </section>
  );
}

function RailPanel({ action, children, icon: Icon, meta, onAction, title }: PanelProps) {
  const headingId = `overview-rail-${title.replaceAll(' ', '-').toLowerCase()}`;
  return (
    <section className="overview-rail-panel" aria-labelledby={headingId}>
      <header className="overview-rail-header">
        <div>
          <Icon aria-hidden="true" className="size-3.5" />
          <h2 id={headingId}>{title}</h2>
          {meta ? <span>{meta}</span> : null}
        </div>
        <button type="button" onClick={onAction}>
          {action} <ArrowRight aria-hidden="true" className="size-3.5" />
        </button>
      </header>
      <div className="overview-rail-body">{children}</div>
    </section>
  );
}

interface PanelProps {
  readonly action: string;
  readonly children: ReactNode;
  readonly icon: typeof FileText;
  readonly meta?: string | undefined;
  readonly onAction: () => void;
  readonly title: string;
}

function QuestionSummary({
  onAction,
  questions,
}: {
  readonly onAction: () => void;
  readonly questions: readonly ResearchQuestion[] | null;
}) {
  if (questions === null) return <Loading label="Loading questions..." />;
  const active = questions.filter(({ archivedAt }) => !archivedAt).slice(0, 4);
  if (!active.length)
    return (
      <Empty action="Add question" onAction={onAction}>
        Record the first question this Workspace needs to resolve.
      </Empty>
    );
  return (
    <ol className="overview-question-list">
      {active.map((question, index) => (
        <li key={question.id}>
          <span>{`Q${String(index + 1)}`}</span>
          <strong title={question.title}>{question.title}</strong>
          <StatusPill value={question.status} />
        </li>
      ))}
    </ol>
  );
}

function PlanSummary({
  onAction,
  plan,
}: {
  readonly onAction: () => void;
  readonly plan: ResearchPlan | null;
}) {
  if (!plan)
    return (
      <Empty action="Create plan" onAction={onAction}>
        Turn the goal into a short sequence of verifiable actions.
      </Empty>
    );
  return (
    <div className="overview-reading-plan">
      <ol>
        {plan.tasks.slice(0, 3).map((task, index) => (
          <li key={task.id}>
            <span>{String(index + 1)}</span>
            <strong title={task.title}>{task.title}</strong>
            <small>{task.status.replaceAll('_', ' ')}</small>
          </li>
        ))}
      </ol>
      <div className="overview-reading-progress">
        <span>{plan.progress.percent}%</span>
        <div
          role="progressbar"
          aria-valuenow={plan.progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <i style={{ width: `${String(plan.progress.percent)}%` }} />
        </div>
        <small>{plan.progress.blocked} blocked</small>
      </div>
    </div>
  );
}

function PaperWorkbench({
  onNavigate,
  onSelect,
  papers,
  selected,
  selectedKey,
}: {
  readonly onNavigate: () => void;
  readonly onSelect: (key: string) => void;
  readonly papers: readonly WorkspaceZoteroPaper[] | null;
  readonly selected: WorkspaceZoteroPaper | null;
  readonly selectedKey: string | null;
}) {
  return (
    <section className="overview-workbench-panel overview-paper-workbench">
      <header className="overview-workbench-header">
        <div>
          <BookOpen aria-hidden="true" className="size-3.5" />
          <h2>Papers</h2>
        </div>
        {papers?.length ? (
          <select
            aria-label="Select Overview paper"
            value={selectedKey ?? ''}
            onChange={(event) => onSelect(event.target.value)}
          >
            {papers.map((paper) => (
              <option key={paperKey(paper)} value={paperKey(paper)}>
                {paperTitle(paper)}
              </option>
            ))}
          </select>
        ) : null}
        <button type="button" onClick={onNavigate}>
          Open papers <ArrowRight aria-hidden="true" className="size-3.5" />
        </button>
      </header>
      <div className="overview-paper-stage">
        {papers === null ? (
          <Loading label="Loading Workspace papers..." />
        ) : selected ? (
          <article>
            <FileText aria-hidden="true" className="overview-paper-document-icon" />
            <span className="overview-paper-kicker">
              {selected.item?.itemType ?? 'Zotero reference'} ·{' '}
              {selected.item?.year ?? selected.item?.date ?? 'No date'}
            </span>
            <h3>{paperTitle(selected)}</h3>
            <p>
              {selected.item
                ? zoteroCreatorNames(selected.item) || 'No creators listed'
                : availabilityLabel(selected.availability)}
            </p>
            <div className="overview-paper-availability">
              <StatusPill value={selected.item ? selected.item.pdf.state : selected.availability} />
              <span>
                {selected.item
                  ? zoteroPdfLabel(selected.item.pdf)
                  : availabilityLabel(selected.availability)}
              </span>
            </div>
            <small>
              Open the paper workspace for source details and available reading actions.
            </small>
          </article>
        ) : (
          <Empty action="Add from Zotero" onAction={onNavigate}>
            No Zotero papers are linked to this Workspace.
          </Empty>
        )}
      </div>
    </section>
  );
}

function CodeWorkbench({
  onNavigate,
  onSelect,
  repositories,
  selected,
  selectedId,
  workspaceId,
}: {
  readonly onNavigate: () => void;
  readonly onSelect: (id: string) => void;
  readonly repositories: readonly WorkspaceRepositoryRef[] | null;
  readonly selected: WorkspaceRepositoryRef | null;
  readonly selectedId: string | null;
  readonly workspaceId: string;
}) {
  return (
    <section className="overview-workbench-panel overview-code-workbench">
      <header className="overview-workbench-header">
        <div>
          <FileCode2 aria-hidden="true" className="size-3.5" />
          <h2>Code</h2>
        </div>
        {repositories?.length ? (
          <select
            aria-label="Select Overview repository"
            value={selectedId ?? ''}
            onChange={(event) => onSelect(event.target.value)}
          >
            {repositories.map((repository) => (
              <option key={repository.id} value={repository.id}>
                {repository.displayName} · {repository.currentBranch ?? repository.kind}
              </option>
            ))}
          </select>
        ) : null}
        <button type="button" onClick={onNavigate}>
          Open code <ArrowRight aria-hidden="true" className="size-3.5" />
        </button>
      </header>
      <div className="overview-code-stage">
        {repositories === null ? (
          <Loading label="Loading repositories..." />
        ) : selected?.availability === 'available' ? (
          <RepositoryBrowser repository={selected} workspaceId={workspaceId} />
        ) : selected ? (
          <div className="overview-code-empty">
            <GitBranch aria-hidden="true" className="size-6" />
            <strong>{selected.displayName}</strong>
            <p>{availabilityLabel(selected.availability)}</p>
            <small>
              {selected.currentBranch ?? selected.kind} ·{' '}
              {selected.headCommit?.slice(0, 10) ?? 'No observed commit'}
            </small>
          </div>
        ) : (
          <Empty action="Add repository" onAction={onNavigate}>
            No repository or source folder is linked to this Workspace.
          </Empty>
        )}
      </div>
      <details className="overview-console-panel">
        <summary>
          <SquareTerminal aria-hidden="true" className="size-3.5" /> Console
          <span>Execution remains in VS Code</span>
        </summary>
        <p>PaperMind keeps repository inspection read-only and does not execute project code.</p>
      </details>
    </section>
  );
}

function LinkSummary({
  links,
  onAction,
}: {
  readonly links: readonly PaperCodeLink[] | null;
  readonly onAction: () => void;
}) {
  if (links === null) return <Loading label="Loading links..." />;
  if (!links.length)
    return (
      <Empty action="Create link" onAction={onAction}>
        No paper-code links yet.
      </Empty>
    );
  return (
    <ul className="overview-rail-list">
      {links.slice(0, 4).map((link) => (
        <li key={link.id}>
          <strong title={linkTitle(link)}>{linkTitle(link)}</strong>
          <span title={`${link.relativePath}:${String(link.startLine)}-${String(link.endLine)}`}>
            {link.relativePath}:{link.startLine}-{link.endLine}
          </span>
          <small>{link.relationType.replaceAll('_', ' ')}</small>
        </li>
      ))}
    </ul>
  );
}

function NoteSummary({
  notes,
  onAction,
}: {
  readonly notes: readonly ResearchContentSummary[] | null;
  readonly onAction: () => void;
}) {
  if (notes === null) return <Loading label="Loading notes..." />;
  if (!notes.length)
    return (
      <Empty action="Create note" onAction={onAction}>
        No Workspace notes yet.
      </Empty>
    );
  return (
    <ul className="overview-rail-list overview-note-list">
      {notes.slice(0, 4).map((note) => (
        <li key={note.id}>
          <strong title={note.title}>{note.title}</strong>
          <span>{relativeTime(note.updatedAt)}</span>
          <small>{note.status}</small>
        </li>
      ))}
    </ul>
  );
}

function ExperimentSummary({
  experiments,
  onAction,
}: {
  readonly experiments: readonly Experiment[] | null;
  readonly onAction: () => void;
}) {
  if (experiments === null) return <Loading label="Loading experiments..." />;
  if (!experiments.length)
    return (
      <Empty action="Record experiment" onAction={onAction}>
        No external experiment metadata yet.
      </Empty>
    );
  return (
    <ul className="overview-rail-list overview-experiment-list">
      {experiments.slice(0, 3).map((experiment) => {
        const result = experiment.runs.find(({ result: value }) => value)?.result;
        return (
          <li key={experiment.id}>
            <strong title={experiment.title}>{experiment.title}</strong>
            <span>
              {experiment.status.replaceAll('_', ' ')} · {experiment.runs.length} runs
            </span>
            {result?.metrics.length ? (
              <small>
                {result.metrics
                  .slice(0, 2)
                  .map(({ name, unit, value }) => `${name}: ${String(value)}${unit ?? ''}`)
                  .join(' · ')}
              </small>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function StatusPill({ value }: { readonly value: string }) {
  const positive = [
    'active',
    'available',
    'closed',
    'completed',
    'confirmed',
    'done',
    'succeeded',
    'understood',
  ].includes(value);
  const warning = ['blocked', 'missing', 'stale_identity', 'unavailable'].includes(value);
  return (
    <span
      className="overview-status-pill"
      data-tone={positive ? 'positive' : warning ? 'warning' : 'neutral'}
    >
      {value.replaceAll('_', ' ')}
    </span>
  );
}

function Loading({ label }: { readonly label: string }) {
  return (
    <p className="overview-loading" role="status">
      {label}
    </p>
  );
}

function Empty({
  action,
  children,
  onAction,
}: {
  readonly action: string;
  readonly children: ReactNode;
  readonly onAction: () => void;
}) {
  return (
    <div className="overview-empty">
      <p>{children}</p>
      <button className="overview-inline-action" type="button" onClick={onAction}>
        {action} <ArrowRight aria-hidden="true" className="size-3.5" />
      </button>
    </div>
  );
}

function activeQuestions(questions: readonly ResearchQuestion[] | undefined): number | undefined {
  return questions?.filter(({ archivedAt }) => !archivedAt).length;
}

function countLabel(count: number | undefined, noun: string): string | undefined {
  if (count === undefined) return undefined;
  return `${String(count)} ${noun}${count === 1 || noun === 'active' ? '' : 's'}`;
}

function paperKey(paper: WorkspaceZoteroPaper): string {
  return `${paper.itemRef.serverId}:${paper.itemRef.library.type}:${paper.itemRef.library.id}:${paper.itemRef.itemKey}`;
}

function paperTitle(paper: WorkspaceZoteroPaper): string {
  return nonEmpty(paper.item?.title) ?? `Zotero item ${paper.itemRef.itemKey}`;
}

function linkTitle(link: PaperCodeLink): string {
  return (
    nonEmpty(link.label) ?? nonEmpty(link.item?.title) ?? `Zotero item ${link.itemRef.itemKey}`
  );
}

function availabilityLabel(value: string): string {
  if (value === 'missing') return 'Source unavailable';
  if (value === 'stale_identity') return 'Different Zotero profile';
  if (value === 'permission_denied') return 'Permission denied';
  if (value === 'unavailable') return 'Source unavailable';
  return value.replaceAll('_', ' ');
}

function relativeTime(value: string): string {
  const milliseconds = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return `${String(days)}d ago`;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed?.length ? trimmed : undefined;
}
