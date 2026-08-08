import { useEffect, useState } from 'react';
import { FileText, FolderPlus, Plus, Save, Star, Trash2 } from 'lucide-react';

import type {
  Collection,
  LibraryOrganization,
  MetadataFieldName,
  PaperDetails,
  PaperMetadataUpdate,
  ReadingStatus,
  Tag,
} from '../../shared/contracts/library';

export interface PaperDetailsSaveInput {
  readonly metadata: PaperMetadataUpdate;
  readonly organization: {
    readonly readingStatus: ReadingStatus;
    readonly isFavorite: boolean;
    readonly tagIds: readonly string[];
    readonly collectionIds: readonly string[];
  };
}

interface PaperDetailsPanelProps {
  readonly isBusy: boolean;
  readonly paper: PaperDetails | null;
  readonly organization: LibraryOrganization;
  readonly onCreateCollection: (name: string) => Promise<Collection | null>;
  readonly onCreateTag: (name: string) => Promise<Tag | null>;
  readonly onDeleteCollection: (collection: Collection) => Promise<boolean>;
  readonly onDelete: () => void;
  readonly onDeleteTag: (tag: Tag) => Promise<boolean>;
  readonly onDirtyChange: (isDirty: boolean) => void;
  readonly onSave: (input: PaperDetailsSaveInput) => void;
}

interface Draft {
  readonly title: string;
  readonly authors: string;
  readonly abstract: string;
  readonly year: string;
  readonly doi: string;
  readonly venue: string;
  readonly language: string;
  readonly readingStatus: ReadingStatus;
  readonly isFavorite: boolean;
  readonly tagIds: readonly string[];
  readonly collectionIds: readonly string[];
}

const EMPTY_DRAFT: Draft = {
  title: '',
  authors: '',
  abstract: '',
  year: '',
  doi: '',
  venue: '',
  language: '',
  readingStatus: 'unread',
  isFavorite: false,
  tagIds: [],
  collectionIds: [],
};

const INPUT_CLASS =
  'mt-1.5 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-emerald-600';

const SOURCE_LABELS = {
  manual: 'Manual',
  pdf_metadata: 'PDF metadata',
  first_page: 'First page',
  filename: 'Filename fallback',
  legacy: 'Legacy value',
  none: 'Not found',
} as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseAuthors(value: string): readonly string[] {
  const seen = new Set<string>();
  return value
    .split(/[;\n]+/u)
    .map((author) => author.trim().replaceAll(/\s+/g, ' '))
    .filter(Boolean)
    .filter((author) => {
      const normalized = author.toLocaleLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

function nullableText(value: string): string | null {
  return value.trim() || null;
}

function sameOrderedValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameIdSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  );
}

function metadataFieldIsEdited(
  field: MetadataFieldName,
  draft: Draft,
  paper: PaperDetails,
): boolean {
  if (field === 'title') return draft.title.trim() !== paper.title;
  if (field === 'authors') return !sameOrderedValues(parseAuthors(draft.authors), paper.authors);
  if (field === 'abstract') return nullableText(draft.abstract) !== paper.abstract;
  if (field === 'year') return (draft.year ? Number(draft.year) : null) !== paper.year;
  return nullableText(draft.doi) !== paper.doi;
}

function draftIsDirty(
  draft: Draft,
  paper: PaperDetails | null,
  newTag: string,
  newCollection: string,
): boolean {
  if (!paper) return false;
  return (
    (['title', 'authors', 'abstract', 'year', 'doi'] as const).some((field) =>
      metadataFieldIsEdited(field, draft, paper),
    ) ||
    nullableText(draft.venue) !== paper.venue ||
    nullableText(draft.language) !== paper.language ||
    draft.readingStatus !== paper.readingStatus ||
    draft.isFavorite !== paper.isFavorite ||
    !sameIdSet(
      draft.tagIds,
      paper.tags.map(({ id }) => id),
    ) ||
    !sameIdSet(
      draft.collectionIds,
      paper.collections.map(({ id }) => id),
    ) ||
    newTag.trim().length > 0 ||
    newCollection.trim().length > 0
  );
}

function EvidenceBadge({
  field,
  isEdited,
  paper,
}: {
  readonly field: MetadataFieldName;
  readonly isEdited: boolean;
  readonly paper: PaperDetails;
}) {
  if (isEdited) {
    return (
      <span
        className="ml-2 inline-flex h-5 items-center rounded-sm border border-sky-200 bg-sky-50 px-1.5 text-[10px] font-medium text-sky-800"
        title="This field has an unsaved manual edit"
      >
        Manual edit: unsaved
      </span>
    );
  }
  const evidence = paper.metadataEvidence.find((item) => item.field === field);
  if (!evidence) return null;
  return (
    <span
      className={`ml-2 inline-flex h-5 items-center rounded-sm border px-1.5 text-[10px] font-medium ${
        evidence.confidence === 'confirmed'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-amber-200 bg-amber-50 text-amber-800'
      }`}
      title={`${SOURCE_LABELS[evidence.source]}, ${evidence.confidence} confidence`}
    >
      {SOURCE_LABELS[evidence.source]}: {evidence.confidence}
    </span>
  );
}

function toggleId(values: readonly string[], id: string): readonly string[] {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

export function PaperDetailsPanel({
  isBusy,
  paper,
  organization,
  onCreateCollection,
  onCreateTag,
  onDeleteCollection,
  onDelete,
  onDeleteTag,
  onDirtyChange,
  onSave,
}: PaperDetailsPanelProps) {
  const [draft, setDraft] = useState<Draft>(() =>
    paper
      ? {
          title: paper.title,
          authors: paper.authors.join('; '),
          abstract: paper.abstract ?? '',
          year: paper.year?.toString() ?? '',
          doi: paper.doi ?? '',
          venue: paper.venue ?? '',
          language: paper.language ?? '',
          readingStatus: paper.readingStatus,
          isFavorite: paper.isFavorite,
          tagIds: paper.tags.map(({ id }) => id),
          collectionIds: paper.collections.map(({ id }) => id),
        }
      : EMPTY_DRAFT,
  );
  const [newTag, setNewTag] = useState('');
  const [newCollection, setNewCollection] = useState('');
  const isDirty = draftIsDirty(draft, paper, newTag, newCollection);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(
    () => () => {
      onDirtyChange(false);
    },
    [onDirtyChange],
  );

  if (!paper) {
    return (
      <section aria-labelledby="details-heading" className="flex min-w-0 flex-col bg-zinc-100">
        <header className="flex h-14 items-center border-b border-zinc-200 bg-white px-5">
          <h2 id="details-heading" className="text-sm font-semibold text-zinc-900">
            Paper details
          </h2>
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center">
          <div>
            <FileText aria-hidden="true" className="mx-auto size-10 text-zinc-300" />
            <p className="mt-4 text-sm font-medium text-zinc-700">Select or import a paper</p>
          </div>
        </div>
      </section>
    );
  }

  const updateDraft = <K extends keyof Draft>(field: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const createTag = async () => {
    const name = newTag.trim();
    if (!name) return;
    try {
      const created = await onCreateTag(name);
      if (!created) return;
      setNewTag('');
      setDraft((current) => ({
        ...current,
        tagIds: current.tagIds.includes(created.id)
          ? current.tagIds
          : [...current.tagIds, created.id],
      }));
    } catch {
      // The parent reports the operation error; retain the input for retry.
    }
  };

  const createCollection = async () => {
    const name = newCollection.trim();
    if (!name) return;
    try {
      const created = await onCreateCollection(name);
      if (!created) return;
      setNewCollection('');
      setDraft((current) => ({
        ...current,
        collectionIds: current.collectionIds.includes(created.id)
          ? current.collectionIds
          : [...current.collectionIds, created.id],
      }));
    } catch {
      // The parent reports the operation error; retain the input for retry.
    }
  };

  const deleteTag = async (tag: Tag) => {
    if (!(await onDeleteTag(tag))) return;
    setDraft((current) => ({
      ...current,
      tagIds: current.tagIds.filter((id) => id !== tag.id),
    }));
  };

  const deleteCollection = async (collection: Collection) => {
    if (!(await onDeleteCollection(collection))) return;
    setDraft((current) => ({
      ...current,
      collectionIds: current.collectionIds.filter((id) => id !== collection.id),
    }));
  };

  const submit = async () => {
    let tagIds = draft.tagIds;
    let collectionIds = draft.collectionIds;

    const tagName = newTag.trim();
    if (tagName) {
      try {
        const created = await onCreateTag(tagName);
        if (!created) return;
        tagIds = tagIds.includes(created.id) ? tagIds : [...tagIds, created.id];
        setNewTag('');
        setDraft((current) => ({ ...current, tagIds }));
      } catch {
        return;
      }
    }

    const collectionName = newCollection.trim();
    if (collectionName) {
      try {
        const created = await onCreateCollection(collectionName);
        if (!created) return;
        collectionIds = collectionIds.includes(created.id)
          ? collectionIds
          : [...collectionIds, created.id];
        setNewCollection('');
        setDraft((current) => ({ ...current, collectionIds }));
      } catch {
        return;
      }
    }

    onSave({
      metadata: {
        id: paper.id,
        rowVersion: paper.rowVersion,
        title: draft.title.trim(),
        authors: parseAuthors(draft.authors),
        abstract: draft.abstract.trim() || null,
        year: draft.year ? Number(draft.year) : null,
        doi: draft.doi.trim() || null,
        venue: draft.venue.trim() || null,
        language: draft.language.trim() || null,
      },
      organization: {
        readingStatus: draft.readingStatus,
        isFavorite: draft.isFavorite,
        tagIds,
        collectionIds,
      },
    });
  };

  return (
    <section
      aria-labelledby="details-heading"
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-50"
    >
      <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-5">
        <div className="min-w-0">
          <h2 id="details-heading" className="text-sm font-semibold text-zinc-900">
            Paper details
          </h2>
          <p className="truncate text-xs text-zinc-500">{paper.file.originalFilename}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            aria-label="Remove paper"
            className="icon-button"
            disabled={isBusy}
            title="Remove paper"
            type="button"
            onClick={onDelete}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
          <button
            className="command-button"
            disabled={isBusy || draft.title.trim().length === 0}
            type="button"
            onClick={() => void submit()}
          >
            <Save aria-hidden="true" className="size-4" />
            {paper.metadataReviewStatus === 'pending' ? 'Confirm metadata' : 'Save'}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-3xl space-y-5">
          {paper.metadataReviewStatus === 'pending' ? (
            <div
              className="border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-900"
              role="status"
            >
              Metadata review required. Extracted values are local suggestions until you confirm
              them.
            </div>
          ) : null}

          <label className="block text-xs font-medium text-zinc-600">
            Title{' '}
            <EvidenceBadge
              field="title"
              isEdited={metadataFieldIsEdited('title', draft, paper)}
              paper={paper}
            />
            <input
              className={`h-10 ${INPUT_CLASS}`}
              disabled={isBusy}
              maxLength={500}
              value={draft.title}
              onChange={(event) => updateDraft('title', event.target.value)}
            />
          </label>

          <label className="block text-xs font-medium text-zinc-600">
            Authors{' '}
            <EvidenceBadge
              field="authors"
              isEdited={metadataFieldIsEdited('authors', draft, paper)}
              paper={paper}
            />
            <textarea
              className={`min-h-20 resize-y py-2 ${INPUT_CLASS}`}
              disabled={isBusy}
              maxLength={30_000}
              placeholder="Separate authors with semicolons or new lines"
              value={draft.authors}
              onChange={(event) => updateDraft('authors', event.target.value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block text-xs font-medium text-zinc-600">
              Year{' '}
              <EvidenceBadge
                field="year"
                isEdited={metadataFieldIsEdited('year', draft, paper)}
                paper={paper}
              />
              <input
                className={`h-9 ${INPUT_CLASS}`}
                disabled={isBusy}
                max="9999"
                min="1000"
                type="number"
                value={draft.year}
                onChange={(event) => updateDraft('year', event.target.value)}
              />
            </label>
            <label className="block text-xs font-medium text-zinc-600">
              Language
              <input
                className={`h-9 ${INPUT_CLASS}`}
                disabled={isBusy}
                maxLength={35}
                placeholder="e.g. en"
                value={draft.language}
                onChange={(event) => updateDraft('language', event.target.value)}
              />
            </label>
          </div>

          <label className="block text-xs font-medium text-zinc-600">
            DOI{' '}
            <EvidenceBadge
              field="doi"
              isEdited={metadataFieldIsEdited('doi', draft, paper)}
              paper={paper}
            />
            <input
              className={`h-9 ${INPUT_CLASS}`}
              disabled={isBusy}
              maxLength={300}
              placeholder="Pending confirmation"
              value={draft.doi}
              onChange={(event) => updateDraft('doi', event.target.value)}
            />
          </label>

          <label className="block text-xs font-medium text-zinc-600">
            Venue
            <input
              className={`h-9 ${INPUT_CLASS}`}
              disabled={isBusy}
              maxLength={500}
              value={draft.venue}
              onChange={(event) => updateDraft('venue', event.target.value)}
            />
          </label>

          <label className="block text-xs font-medium text-zinc-600">
            Abstract{' '}
            <EvidenceBadge
              field="abstract"
              isEdited={metadataFieldIsEdited('abstract', draft, paper)}
              paper={paper}
            />
            <textarea
              className={`min-h-32 resize-y py-2 leading-6 ${INPUT_CLASS}`}
              disabled={isBusy}
              maxLength={100_000}
              placeholder="Pending confirmation"
              value={draft.abstract}
              onChange={(event) => updateDraft('abstract', event.target.value)}
            />
          </label>

          <section aria-labelledby="organization-heading" className="border-t border-zinc-200 pt-5">
            <div className="flex items-center justify-between gap-3">
              <h3
                id="organization-heading"
                className="text-xs font-semibold uppercase text-zinc-500"
              >
                Organization
              </h3>
              <button
                aria-label={draft.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                aria-pressed={draft.isFavorite}
                className={`icon-button ${draft.isFavorite ? 'text-amber-600' : ''}`}
                disabled={isBusy}
                title={draft.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                type="button"
                onClick={() => updateDraft('isFavorite', !draft.isFavorite)}
              >
                <Star
                  aria-hidden="true"
                  className={`size-4 ${draft.isFavorite ? 'fill-current' : ''}`}
                />
              </button>
            </div>
            <label className="mt-3 block text-xs font-medium text-zinc-600">
              Reading status
              <select
                className={`h-9 ${INPUT_CLASS}`}
                disabled={isBusy}
                value={draft.readingStatus}
                onChange={(event) =>
                  updateDraft('readingStatus', event.target.value as ReadingStatus)
                }
              >
                <option value="unread">Unread</option>
                <option value="reading">Reading</option>
                <option value="completed">Completed</option>
                <option value="shelved">Shelved</option>
              </select>
            </label>

            <fieldset className="mt-4">
              <legend className="text-xs font-medium text-zinc-600">Tags</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {organization.tags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex h-7 items-center gap-1.5 rounded border border-zinc-200 bg-white px-2 text-xs text-zinc-700"
                  >
                    <label className="flex min-w-0 flex-1 items-center gap-1.5">
                      <input
                        checked={draft.tagIds.includes(tag.id)}
                        className="size-3.5 accent-emerald-700"
                        disabled={isBusy}
                        type="checkbox"
                        onChange={() => updateDraft('tagIds', toggleId(draft.tagIds, tag.id))}
                      />
                      <span
                        aria-hidden="true"
                        className="size-2 rounded-sm"
                        style={{ backgroundColor: tag.color ?? '#a1a1aa' }}
                      />
                      <span className="truncate">{tag.name}</span>
                    </label>
                    <button
                      aria-label={`Delete tag ${tag.name}`}
                      className="grid size-5 shrink-0 place-items-center rounded-sm text-zinc-400 hover:bg-red-50 hover:text-red-700"
                      disabled={isBusy}
                      title={`Delete tag ${tag.name}`}
                      type="button"
                      onClick={() => void deleteTag(tag)}
                    >
                      <Trash2 aria-hidden="true" className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  aria-label="New tag name"
                  className="h-8 min-w-0 flex-1 rounded border border-zinc-300 bg-white px-2 text-xs"
                  disabled={isBusy}
                  maxLength={100}
                  placeholder="New tag"
                  value={newTag}
                  onChange={(event) => setNewTag(event.target.value)}
                />
                <button
                  aria-label="Create tag"
                  className="icon-button"
                  disabled={!newTag.trim() || isBusy}
                  title="Create tag"
                  type="button"
                  onClick={() => void createTag()}
                >
                  <Plus aria-hidden="true" className="size-4" />
                </button>
              </div>
            </fieldset>

            <fieldset className="mt-4">
              <legend className="text-xs font-medium text-zinc-600">Collections</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {organization.collections.map((collection) => (
                  <div
                    key={collection.id}
                    className="flex h-8 min-w-0 items-center gap-2 rounded border border-zinc-200 bg-white px-2 text-xs text-zinc-700"
                  >
                    <label className="flex min-w-0 flex-1 items-center gap-2">
                      <input
                        checked={draft.collectionIds.includes(collection.id)}
                        className="size-3.5 accent-emerald-700"
                        disabled={isBusy}
                        type="checkbox"
                        onChange={() =>
                          updateDraft('collectionIds', toggleId(draft.collectionIds, collection.id))
                        }
                      />
                      <span className="truncate">{collection.name}</span>
                    </label>
                    <button
                      aria-label={`Delete collection ${collection.name}`}
                      className="grid size-5 shrink-0 place-items-center rounded-sm text-zinc-400 hover:bg-red-50 hover:text-red-700"
                      disabled={isBusy}
                      title={`Delete collection ${collection.name}`}
                      type="button"
                      onClick={() => void deleteCollection(collection)}
                    >
                      <Trash2 aria-hidden="true" className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  aria-label="New collection name"
                  className="h-8 min-w-0 flex-1 rounded border border-zinc-300 bg-white px-2 text-xs"
                  disabled={isBusy}
                  maxLength={200}
                  placeholder="New collection"
                  value={newCollection}
                  onChange={(event) => setNewCollection(event.target.value)}
                />
                <button
                  aria-label="Create collection"
                  className="icon-button"
                  disabled={!newCollection.trim() || isBusy}
                  title="Create collection"
                  type="button"
                  onClick={() => void createCollection()}
                >
                  <FolderPlus aria-hidden="true" className="size-4" />
                </button>
              </div>
            </fieldset>
          </section>

          <section aria-labelledby="managed-file-heading" className="border-t border-zinc-200 pt-5">
            <h3 id="managed-file-heading" className="text-xs font-semibold uppercase text-zinc-500">
              Managed PDF
            </h3>
            <dl className="mt-3 grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-xs">
              <dt className="text-zinc-500">Original name</dt>
              <dd className="min-w-0 truncate text-zinc-800">{paper.file.originalFilename}</dd>
              <dt className="text-zinc-500">Pages</dt>
              <dd className="text-zinc-800">{paper.file.pageCount ?? 'Unknown'}</dd>
              <dt className="text-zinc-500">Text index</dt>
              <dd className="capitalize text-zinc-800">{paper.file.textExtractionStatus}</dd>
              <dt className="text-zinc-500">Size</dt>
              <dd className="text-zinc-800">{formatBytes(paper.file.byteSize)}</dd>
              <dt className="text-zinc-500">SHA-256</dt>
              <dd className="min-w-0 truncate font-mono text-zinc-700" title={paper.file.sha256}>
                {paper.file.sha256}
              </dd>
            </dl>
          </section>
        </div>
      </div>
    </section>
  );
}
