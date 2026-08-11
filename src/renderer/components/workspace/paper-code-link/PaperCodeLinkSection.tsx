import { useCallback, useEffect, useState } from 'react';
import { Code2, ExternalLink, FileText, Link2, Pencil, Plus, Trash2 } from 'lucide-react';

import type {
  PaperCodeLink,
  PaperCodeRelationType,
} from '../../../../shared/contracts/paper-code-link';
import type { Workspace } from '../../../../shared/contracts/workspace';
import { rendererLogger } from '../../../logger';
import { CreatePaperCodeLinkDialog } from './CreatePaperCodeLinkDialog';

export function PaperCodeLinkSection({ workspace }: { readonly workspace: Workspace }) {
  const [links, setLinks] = useState<readonly PaperCodeLink[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await window.paperMind.paperCodeLink.listForWorkspace(workspace.id);
      if (!result.ok) setError(result.error.message);
      else setLinks(result.value);
    } catch (caught) {
      rendererLogger.error('Unable to load Paper-Code Links', caught);
      setError('Paper-Code Links could not be loaded.');
    }
  }, [workspace.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const open = async (link: PaperCodeLink, target: 'code' | 'paper') => {
    setError(null);
    setNotice(null);
    const result =
      target === 'code'
        ? await window.paperMind.paperCodeLink.openCode({ workspaceId: workspace.id, id: link.id })
        : await window.paperMind.paperCodeLink.openPaper({
            workspaceId: workspace.id,
            id: link.id,
          });
    if (!result.ok) setError(result.error.message);
    else if (!result.value.opened)
      setError(result.value.reason ?? 'The linked source is unavailable.');
    else if (result.value.reason) setNotice(result.value.reason);
  };

  const remove = async (link: PaperCodeLink) => {
    if (
      !window.confirm(
        'Delete this Paper-Code Link? Zotero, PDFs, repositories, and source files will not be changed.',
      )
    )
      return;
    setError(null);
    setNotice(null);
    const result = await window.paperMind.paperCodeLink.delete({
      workspaceId: workspace.id,
      id: link.id,
      confirmation: 'DELETE_LINK',
    });
    if (!result.ok) setError(result.error.message);
    else {
      setLinks((current) => current?.filter(({ id }) => id !== link.id) ?? []);
      setNotice('Link deleted. External sources were not changed.');
    }
  };

  const update = async (
    link: PaperCodeLink,
    relationType: PaperCodeRelationType,
    label: string,
    description: string,
  ) => {
    setError(null);
    setNotice(null);
    const result = await window.paperMind.paperCodeLink.update({
      id: link.id,
      workspaceId: workspace.id,
      relationType,
      label,
      description,
      rowVersion: link.rowVersion,
    });
    if (!result.ok) setError(result.error.message);
    else
      setLinks(
        (current) => current?.map((item) => (item.id === link.id ? result.value : item)) ?? [],
      );
  };

  return (
    <section
      aria-labelledby="paper-code-links-heading"
      className="border-y border-zinc-200 bg-white"
    >
      <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
        <div>
          <h2
            id="paper-code-links-heading"
            className="flex items-center gap-2 text-sm font-semibold text-zinc-900"
          >
            <Link2 aria-hidden="true" className="size-4" />
            Paper-Code Links
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            User-confirmed relationships pinned to Zotero and code snapshot identities.
          </p>
        </div>
        <button
          className="command-button"
          disabled={workspace.status === 'archived'}
          type="button"
          onClick={() => setShowCreate(true)}
        >
          <Plus aria-hidden="true" className="size-4" />
          Link to Code
        </button>
      </header>
      {error || notice ? (
        <p
          className={`border-b px-5 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}
          role={error ? 'alert' : 'status'}
        >
          {error ?? notice}
        </p>
      ) : null}
      {links === null ? (
        <p className="px-5 py-8 text-sm text-zinc-500">Loading Paper-Code Links...</p>
      ) : links.length === 0 ? (
        <div className="px-5 py-8">
          <p className="text-sm font-medium text-zinc-800">No confirmed Paper-Code Links.</p>
          <p className="mt-1 text-sm text-zinc-500">
            Choose a paper location and a trusted indexed code location to create one.
          </p>
        </div>
      ) : (
        <ul aria-label="Paper-Code Links" className="divide-y divide-zinc-200">
          {links.map((link) => (
            <PaperCodeLinkRow
              archived={workspace.status === 'archived'}
              key={link.id}
              link={link}
              onDelete={() => void remove(link)}
              onOpenCode={() => void open(link, 'code')}
              onOpenPaper={() => void open(link, 'paper')}
              onUpdate={(relation, label, description) =>
                void update(link, relation, label, description)
              }
            />
          ))}
        </ul>
      )}
      {showCreate ? (
        <CreatePaperCodeLinkDialog
          workspace={workspace}
          onClose={() => setShowCreate(false)}
          onCreated={(created) => {
            setLinks((current) => [created, ...(current ?? [])]);
            setShowCreate(false);
            setNotice('Paper-Code Link saved.');
          }}
        />
      ) : null}
    </section>
  );
}

function PaperCodeLinkRow({
  link,
  archived,
  onOpenPaper,
  onOpenCode,
  onDelete,
  onUpdate,
}: {
  readonly link: PaperCodeLink;
  readonly archived: boolean;
  readonly onOpenPaper: () => void;
  readonly onOpenCode: () => void;
  readonly onDelete: () => void;
  readonly onUpdate: (relation: PaperCodeRelationType, label: string, description: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [relation, setRelation] = useState(link.relationType);
  const [label, setLabel] = useState(link.label);
  const [description, setDescription] = useState(link.description);
  return (
    <li className="px-5 py-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_36px_minmax(0,1fr)_auto]">
        <button className="min-w-0 text-left" type="button" onClick={onOpenPaper}>
          <span className="flex items-center gap-1 text-xs font-semibold uppercase text-zinc-500">
            <FileText aria-hidden="true" className="size-3.5" />
            Related paper
          </span>
          <span className="mt-1 block truncate text-sm font-medium text-zinc-950">
            {link.item?.title ?? `Zotero item ${link.itemRef.itemKey}`}
          </span>
          <span className="mt-1 block text-xs text-zinc-500">{paperLocation(link)}</span>
          {link.paperAvailability !== 'available' ? (
            <span className="mt-1 block text-xs font-medium text-amber-700">
              {link.paperAvailability}: {link.paperAvailabilityReason}
            </span>
          ) : null}
        </button>
        <span className="self-center justify-self-center text-zinc-400" aria-hidden="true">
          ↔
        </span>
        <button className="min-w-0 text-left" type="button" onClick={onOpenCode}>
          <span className="flex items-center gap-1 text-xs font-semibold uppercase text-zinc-500">
            <Code2 aria-hidden="true" className="size-3.5" />
            Related code
          </span>
          <span className="mt-1 block truncate font-mono text-sm text-zinc-950">
            {link.relativePath}:{String(link.startLine)}-{String(link.endLine)}
          </span>
          <span className="mt-1 block text-xs text-zinc-500">
            {link.repositoryName ?? 'Repository unavailable'} | {relationLabel(link.relationType)}
          </span>
          {link.codeAvailability !== 'available' ? (
            <span className="mt-1 block text-xs font-medium text-amber-700">
              {link.codeAvailability}: {link.codeAvailabilityReason}
            </span>
          ) : null}
        </button>
        <div className="flex items-start gap-1">
          <button
            aria-label="Open paper source"
            className="icon-button"
            title="Open paper source"
            type="button"
            onClick={onOpenPaper}
          >
            <FileText aria-hidden="true" className="size-4" />
          </button>
          <button
            aria-label="Open code source"
            className="icon-button"
            title="Open code source"
            type="button"
            onClick={onOpenCode}
          >
            <ExternalLink aria-hidden="true" className="size-4" />
          </button>
          <button
            aria-label="Edit link"
            className="icon-button"
            disabled={archived}
            title="Edit link"
            type="button"
            onClick={() => setEditing((value) => !value)}
          >
            <Pencil aria-hidden="true" className="size-4" />
          </button>
          <button
            aria-label="Delete link"
            className="icon-button text-red-700"
            disabled={archived}
            title="Delete link"
            type="button"
            onClick={onDelete}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
      {link.label || link.description ? (
        <div className="mt-3 border-l-2 border-zinc-200 pl-3 text-xs text-zinc-600">
          <strong className="text-zinc-800">
            {link.label || relationLabel(link.relationType)}
          </strong>
          {link.description ? <p className="mt-1">{link.description}</p> : null}
        </div>
      ) : null}
      {editing ? (
        <div className="mt-4 grid gap-3 border-t border-zinc-200 pt-4 md:grid-cols-3">
          <label className="text-xs font-medium text-zinc-700">
            Relation
            <select
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5"
              value={relation}
              onChange={(event) => setRelation(event.target.value as PaperCodeRelationType)}
            >
              <option value="implements">Implements</option>
              <option value="corresponds_to">Corresponds to</option>
              <option value="extends">Extends</option>
              <option value="uses">Uses</option>
            </select>
          </label>
          <label className="text-xs font-medium text-zinc-700">
            Label
            <input
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5"
              maxLength={300}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <label className="text-xs font-medium text-zinc-700">
            Description
            <textarea
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5"
              maxLength={4000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="md:col-span-3 flex justify-end gap-2">
            <button className="text-button" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              className="command-button"
              type="button"
              onClick={() => {
                onUpdate(relation, label.trim(), description.trim());
                setEditing(false);
              }}
            >
              Save changes
            </button>
          </div>
        </div>
      ) : null}
      <p className="mt-3 text-[11px] text-zinc-400">
        {link.provenance === 'manual' ? 'Manually confirmed' : 'AI-proposed and user-confirmed'} |
        created {new Date(link.createdAt).toLocaleString()}
      </p>
    </li>
  );
}

function paperLocation(link: PaperCodeLink): string {
  return (
    [link.pageNumber ? `p.${String(link.pageNumber)}` : '', link.locationLabel]
      .filter(Boolean)
      .join(' / ') || 'Item level'
  );
}
function relationLabel(value: PaperCodeRelationType): string {
  return value.replaceAll('_', ' ');
}
