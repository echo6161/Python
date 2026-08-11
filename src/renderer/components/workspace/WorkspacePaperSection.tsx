import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileText, Plus, Trash2 } from 'lucide-react';

import type { Workspace, WorkspaceZoteroPaper } from '../../../shared/contracts/workspace';
import type { PaperCodeLink } from '../../../shared/contracts/paper-code-link';
import { rendererLogger } from '../../logger';
import {
  formatZoteroItemType,
  zoteroCreatorNames,
  zoteroPdfLabel,
} from '../../workspace/zotero-display';
import { zoteroReferenceKey } from '../../workspace/zotero-reference';
import { ZoteroPickerDialog } from './ZoteroPickerDialog';

interface WorkspacePaperSectionProps {
  readonly workspace: Workspace;
}

export function WorkspacePaperSection({ workspace }: WorkspacePaperSectionProps) {
  const [papers, setPapers] = useState<readonly WorkspaceZoteroPaper[] | null>(null);
  const [links, setLinks] = useState<readonly PaperCodeLink[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await window.paperMind.workspace.listPapers(workspace.id);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setPapers(result.value);
      try {
        const linkResult = await window.paperMind.paperCodeLink.listForWorkspace(workspace.id);
        if (linkResult.ok) setLinks(linkResult.value);
        else setError(linkResult.error.message);
      } catch (caught) {
        rendererLogger.error('Unable to load related code links', caught);
        setError('Related code links could not be loaded.');
      }
    } catch (caught) {
      rendererLogger.error('Unable to load Workspace papers', caught);
      setError('Workspace papers could not be loaded.');
    }
  }, [workspace.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const remove = async (paper: WorkspaceZoteroPaper) => {
    const key = zoteroReferenceKey(paper.itemRef);
    setRemovingKey(key);
    setError(null);
    setNotice(null);
    try {
      const result = await window.paperMind.workspace.removePaper({
        workspaceId: workspace.id,
        itemRef: paper.itemRef,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setPapers((items) => items?.filter((item) => zoteroReferenceKey(item.itemRef) !== key) ?? []);
      setNotice('Paper removed from this Workspace. Zotero was not changed.');
    } catch (caught) {
      rendererLogger.error('Unable to remove Workspace paper', caught);
      setError('The paper could not be removed from this Workspace.');
    } finally {
      setRemovingKey(null);
    }
  };

  const existingRefs = useMemo(
    () => new Set((papers ?? []).map(({ itemRef }) => zoteroReferenceKey(itemRef))),
    [papers],
  );

  const openRelatedCode = async (link: PaperCodeLink) => {
    setError(null);
    setNotice(null);
    const result = await window.paperMind.paperCodeLink.openCode({
      workspaceId: link.workspaceId,
      id: link.id,
    });
    if (!result.ok) setError(result.error.message);
    else if (!result.value.opened)
      setError(result.value.reason ?? 'The linked code is unavailable.');
  };

  return (
    <section
      aria-labelledby="workspace-papers-heading"
      className="border-y border-zinc-200 bg-white"
    >
      <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
        <div>
          <h2 id="workspace-papers-heading" className="text-sm font-semibold text-zinc-900">
            Zotero Papers
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Referenced from Zotero; metadata is not copied into PaperMind.
          </p>
        </div>
        <button
          className="command-button"
          disabled={workspace.status === 'archived'}
          type="button"
          onClick={() => setShowPicker(true)}
        >
          <Plus aria-hidden="true" className="size-4" />
          Add from Zotero
        </button>
      </header>

      {error || notice ? (
        <div
          className={`border-b px-5 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}
          role={error ? 'alert' : 'status'}
        >
          {error ?? notice}
          {error ? (
            <button
              className="ml-3 font-semibold underline"
              type="button"
              onClick={() => void load()}
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {papers === null ? (
        <p className="px-5 py-8 text-sm text-zinc-500">Loading Zotero references...</p>
      ) : papers.length === 0 ? (
        <div className="px-5 py-8">
          <p className="text-sm font-medium text-zinc-800">No Zotero papers in this Workspace.</p>
          <p className="mt-1 text-sm text-zinc-500">
            Define the research goal, then add relevant papers from Zotero.
          </p>
          <button
            className="command-button mt-4"
            disabled={workspace.status === 'archived'}
            type="button"
            onClick={() => setShowPicker(true)}
          >
            <Plus aria-hidden="true" className="size-4" />
            Add from Zotero
          </button>
        </div>
      ) : (
        <ul aria-label="Workspace Zotero papers" className="divide-y divide-zinc-200">
          {papers.map((paper) => (
            <WorkspacePaperRow
              key={zoteroReferenceKey(paper.itemRef)}
              disabled={
                workspace.status === 'archived' || removingKey === zoteroReferenceKey(paper.itemRef)
              }
              paper={paper}
              relatedLinks={links.filter((link) => sameZoteroItem(link, paper))}
              onOpenCode={(link) => void openRelatedCode(link)}
              onRemove={() => void remove(paper)}
            />
          ))}
        </ul>
      )}

      {papers && papers.length > 0 ? <RecentPaperActivity papers={papers} /> : null}

      {showPicker ? (
        <ZoteroPickerDialog
          existingRefs={existingRefs}
          workspaceId={workspace.id}
          onAdded={() => void load()}
          onClose={() => setShowPicker(false)}
        />
      ) : null}
    </section>
  );
}

function WorkspacePaperRow({
  paper,
  disabled,
  onRemove,
  relatedLinks,
  onOpenCode,
}: {
  readonly paper: WorkspaceZoteroPaper;
  readonly disabled: boolean;
  readonly onRemove: () => void;
  readonly relatedLinks: readonly PaperCodeLink[];
  readonly onOpenCode: (link: PaperCodeLink) => void;
}) {
  const item = paper.item;
  const unavailable = paper.availability !== 'available';
  const title = workspacePaperTitle(paper);
  const creators = item ? zoteroCreatorNames(item) : '';
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_150px_40px] items-center gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-zinc-950">{title}</p>
        <p className="mt-1 truncate text-xs text-zinc-500">
          {item ? (creators ? creators : 'No creators') : externalStateLabel(paper.availability)}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {item
            ? `${String(item.year ?? item.date ?? 'No date')} | ${formatZoteroItemType(item.itemType)}`
            : `${paper.itemRef.library.type} library ${paper.itemRef.library.id}`}
        </p>
        {relatedLinks.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2" aria-label={`Related code for ${title}`}>
            {relatedLinks.map((link) => (
              <button
                className="text-button font-mono text-xs"
                key={link.id}
                type="button"
                onClick={() => onOpenCode(link)}
              >
                {link.relativePath}:{String(link.startLine)}
                {link.codeAvailability === 'available' ? '' : ` (${link.codeAvailability})`}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="justify-self-end text-right text-xs">
        {item ? (
          <span className="inline-flex items-center gap-1 text-zinc-600">
            <FileText aria-hidden="true" className="size-4" />
            {zoteroPdfLabel(item.pdf)}
          </span>
        ) : null}
        {unavailable ? (
          <span className="mt-1 flex items-center justify-end gap-1 font-medium text-amber-700">
            <AlertTriangle aria-hidden="true" className="size-3.5" />
            {externalStateLabel(paper.availability)}
          </span>
        ) : null}
      </div>
      <button
        aria-label={`Remove ${title} from Workspace`}
        className="icon-button text-red-700"
        disabled={disabled}
        title="Remove from Workspace"
        type="button"
        onClick={onRemove}
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </button>
    </li>
  );
}

function sameZoteroItem(link: PaperCodeLink, paper: WorkspaceZoteroPaper): boolean {
  return (
    link.itemRef.serverId === paper.itemRef.serverId &&
    link.itemRef.library.type === paper.itemRef.library.type &&
    link.itemRef.library.id === paper.itemRef.library.id &&
    link.itemRef.itemKey === paper.itemRef.itemKey
  );
}

function RecentPaperActivity({ papers }: { readonly papers: readonly WorkspaceZoteroPaper[] }) {
  const recent = [...papers]
    .sort((left, right) => right.addedAt.localeCompare(left.addedAt))
    .slice(0, 3);
  return (
    <div className="border-t border-zinc-200 bg-zinc-50 px-5 py-4">
      <h3 className="text-xs font-semibold uppercase text-zinc-500">Recent Activity</h3>
      <ul className="mt-2 space-y-1 text-xs text-zinc-600">
        {recent.map((paper) => (
          <li key={zoteroReferenceKey(paper.itemRef)}>
            Added {workspacePaperTitle(paper)} on {new Date(paper.addedAt).toLocaleDateString()}
          </li>
        ))}
      </ul>
    </div>
  );
}

function externalStateLabel(state: WorkspaceZoteroPaper['availability']): string {
  if (state === 'missing') return 'Missing in Zotero';
  if (state === 'stale_identity') return 'Different Zotero profile';
  if (state === 'unavailable') return 'Zotero unavailable';
  return 'Available';
}

function workspacePaperTitle(paper: WorkspaceZoteroPaper): string {
  const title = paper.item?.title.trim();
  if (title) return title;
  return `Zotero item ${paper.itemRef.itemKey}`;
}
