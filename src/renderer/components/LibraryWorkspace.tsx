import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { BookOpen, FilePenLine } from 'lucide-react';

import type {
  ApiResult,
  Collection,
  LibraryOrganization,
  PaperDetails,
  PaperImportBatch,
  PaperListQuery,
  PaperListResult,
  ReadingStatus,
  PaperRemovalMode,
  Tag,
} from '../../shared/contracts/library';
import type {
  Annotation,
  AnnotationExportFormat,
  CreateAnnotationInput,
  UpdateAnnotationInput,
} from '../../shared/contracts/reader';
import { AnnotationSidebar } from './AnnotationSidebar';
import { DeletePaperDialog } from './DeletePaperDialog';
import { PaperDetailsPanel, type PaperDetailsSaveInput } from './PaperDetailsPanel';
import { PaperListPanel } from './PaperListPanel';
import { PDFReader } from './PDFReader';

function unwrap<T>(result: ApiResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

interface LibraryWorkspaceProps {
  readonly onDirtyChange?: (isDirty: boolean) => void;
}

export function LibraryWorkspace({ onDirtyChange }: LibraryWorkspaceProps) {
  const [library, setLibrary] = useState<PaperListResult>({ items: [], total: 0 });
  const [organization, setOrganization] = useState<LibraryOrganization>({
    tags: [],
    collections: [],
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<PaperDetails | null>(null);
  const [query, setQuery] = useState<PaperListQuery>({
    sortBy: 'updatedAt',
    sortDirection: 'desc',
    limit: 100,
    offset: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<PaperDetails | null>(null);
  const [annotations, setAnnotations] = useState<readonly Annotation[]>([]);
  const [workspaceMode, setWorkspaceMode] = useState<'reader' | 'details'>('reader');
  const [detailsResetNonce, setDetailsResetNonce] = useState(0);
  const [jumpRequest, setJumpRequest] = useState<{ pageNumber: number; nonce: number } | null>(
    null,
  );
  const detailsDirtyRef = useRef(false);
  const listRequestId = useRef(0);
  const preservedSelectionRef = useRef<string | null>(null);

  const reportError = useCallback((message: string) => setError(message), []);

  const setDetailsDirtyState = useCallback(
    (isDirty: boolean) => {
      detailsDirtyRef.current = isDirty;
      onDirtyChange?.(isDirty);
    },
    [onDirtyChange],
  );

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const loadPapers = useCallback(
    async (nextQuery: PaperListQuery, preferredId?: string, preservePreferredSelection = false) => {
      const requestId = ++listRequestId.current;
      const result = unwrap(await window.paperMind.library.listPapers(nextQuery));
      if (requestId !== listRequestId.current) return;
      setLibrary(result);
      const visibleIds = new Set(result.items.map(({ id }) => id));
      setSelectedIds((current) => current.filter((id) => visibleIds.has(id)));
      setSelectedId((current) => {
        const candidate = preferredId ?? current;
        if (detailsDirtyRef.current && current) return current;
        if (preservePreferredSelection && preferredId) return preferredId;
        return candidate && result.items.some(({ id }) => id === candidate)
          ? candidate
          : (result.items[0]?.id ?? null);
      });
    },
    [],
  );

  const loadOrganization = useCallback(async () => {
    setOrganization(unwrap(await window.paperMind.library.listOrganization()));
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const preservedId = preservedSelectionRef.current;
      void loadPapers(query, preservedId ?? undefined, preservedId !== null).catch(
        (reason: unknown) => {
          setError(
            reason instanceof Error ? reason.message : 'The paper list could not be loaded.',
          );
        },
      );
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [loadPapers, query]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadOrganization().catch((reason: unknown) => {
        setError(
          reason instanceof Error ? reason.message : 'Library organization could not be loaded.',
        );
      });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadOrganization]);

  const hasPendingExtraction =
    library.items.some(({ file }) => file.textExtractionStatus === 'pending') ||
    selectedPaper?.file.textExtractionStatus === 'pending';

  useEffect(() => {
    if (!hasPendingExtraction) return;
    let active = true;
    let timeout: number | null = null;
    const refresh = async (): Promise<void> => {
      try {
        const preservedId = preservedSelectionRef.current ?? selectedId;
        await loadPapers(query, preservedId ?? undefined, preservedId !== null);
        if (!selectedId) return;
        const paper = unwrap(await window.paperMind.library.getPaper(selectedId));
        if (active) {
          setSelectedPaper((current) => (current?.id === paper.id ? paper : current));
        }
      } catch {
        // Pending local extraction is retried until its persisted status changes.
      } finally {
        if (active) {
          timeout = window.setTimeout(() => void refresh(), 1500);
        }
      }
    };
    timeout = window.setTimeout(() => void refresh(), 1500);
    return () => {
      active = false;
      if (timeout !== null) window.clearTimeout(timeout);
    };
  }, [hasPendingExtraction, loadPapers, query, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    let active = true;
    void Promise.all([
      window.paperMind.library.getPaper(selectedId).then(unwrap),
      window.paperMind.reader.listAnnotations(selectedId).then(unwrap),
    ])
      .then(([paper, savedAnnotations]) => {
        if (active) {
          setSelectedPaper(paper);
          setAnnotations(savedAnnotations);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'The paper could not be loaded.');
        }
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const applyImportResult = useCallback(
    async (batch: PaperImportBatch) => {
      if (batch.cancelled) {
        return;
      }
      const imported = batch.items.filter(({ status }) => status === 'imported');
      const duplicates = batch.items.filter(({ status }) => status === 'duplicate');
      const failures = batch.items.filter(({ status }) => status === 'failed');
      const warnings = batch.items.filter(({ warning }) => warning !== null);
      const preferredId = imported[0]?.paper?.id ?? duplicates[0]?.paper?.id;
      if (preferredId) preservedSelectionRef.current = preferredId;

      if (failures.length > 0) {
        setError(
          failures
            .map(
              ({ originalFilename, error }) =>
                `${originalFilename}: ${error?.message ?? 'Import failed.'}`,
            )
            .join('\n'),
        );
      }
      if (imported.length > 0 || duplicates.length > 0) {
        const parts = [
          imported.length > 0 ? `${String(imported.length)} imported` : null,
          duplicates.length > 0 ? `${String(duplicates.length)} already in library` : null,
        ].filter(Boolean);
        setNotice(parts.join(', '));
      }
      if (warnings.length > 0) {
        setNotice(
          `${imported.length > 0 ? `${String(imported.length)} imported. ` : ''}${warnings
            .map(({ originalFilename, warning }) => `${originalFilename}: ${warning ?? ''}`)
            .join('\n')}`,
        );
      }
      if (imported.length > 0) setWorkspaceMode('details');
      try {
        await loadPapers(query, preferredId, preferredId !== undefined);
      } catch {
        setError(
          (current) => current ?? 'Import completed, but the library list could not refresh.',
        );
      }
    },
    [loadPapers, query],
  );

  const runImport = useCallback(
    async (operation: () => Promise<ApiResult<PaperImportBatch>>) => {
      setIsBusy(true);
      setError(null);
      setNotice(null);
      try {
        await applyImportResult(unwrap(await operation()));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'The PDFs could not be imported.');
      } finally {
        setIsBusy(false);
      }
    },
    [applyImportResult],
  );

  const discardDraftIfNeeded = useCallback(() => {
    if (!detailsDirtyRef.current) return true;
    if (!window.confirm('Discard unsaved paper detail changes?')) return false;
    setDetailsDirtyState(false);
    setDetailsResetNonce((current) => current + 1);
    return true;
  }, [setDetailsDirtyState]);

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const files = Array.from(event.dataTransfer.files).filter(
      (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'),
    );
    if (files.length === 0) {
      setError('Drop one or more PDF files to import them.');
      return;
    }
    if (!discardDraftIfNeeded()) return;
    void runImport(() => window.paperMind.library.importDroppedPdfs(files));
  };

  const savePaper = async (input: PaperDetailsSaveInput) => {
    setIsBusy(true);
    setError(null);
    try {
      let paper: PaperDetails;
      try {
        paper = unwrap(await window.paperMind.library.updatePaperDetails(input));
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : 'The paper details could not be saved.',
        );
        return;
      }
      setDetailsDirtyState(false);
      setSelectedPaper(paper);
      setNotice('Paper metadata confirmed and saved.');
      try {
        await loadPapers(query, paper.id, true);
      } catch {
        setError('Paper details were saved, but the library list could not refresh.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const removePaper = async (mode: PaperRemovalMode) => {
    if (!pendingDeletion) {
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      unwrap(
        await window.paperMind.library.removePaper({
          id: pendingDeletion.id,
          mode,
          confirmation: 'REMOVE_PAPER',
        }),
      );
      setPendingDeletion(null);
      if (preservedSelectionRef.current === pendingDeletion.id) {
        preservedSelectionRef.current = null;
      }
      setSelectedPaper(null);
      setAnnotations([]);
      setNotice(
        mode === 'record-only' ? 'Paper record removed.' : 'Paper and managed copy removed.',
      );
      setSelectedIds((current) => current.filter((id) => id !== pendingDeletion.id));
      await loadPapers(query);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The paper could not be removed.');
    } finally {
      setIsBusy(false);
    }
  };

  const createTag = async (name: string): Promise<Tag | null> => {
    setIsBusy(true);
    setError(null);
    try {
      let tag: Tag;
      try {
        tag = unwrap(await window.paperMind.library.createTag({ name, color: null }));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'The tag could not be created.');
        return null;
      }
      setOrganization((current) =>
        current.tags.some(({ id }) => id === tag.id)
          ? current
          : {
              ...current,
              tags: [...current.tags, tag].sort((a, b) => a.name.localeCompare(b.name)),
            },
      );
      setNotice(`Tag "${name}" is available.`);
      try {
        await loadOrganization();
      } catch {
        setError(`Tag "${name}" was created, but the organization list could not refresh.`);
      }
      return tag;
    } finally {
      setIsBusy(false);
    }
  };

  const createCollection = async (name: string): Promise<Collection | null> => {
    setIsBusy(true);
    setError(null);
    try {
      let collection: Collection;
      try {
        collection = unwrap(
          await window.paperMind.library.createCollection({ name, description: null }),
        );
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'The collection could not be created.');
        return null;
      }
      setOrganization((current) =>
        current.collections.some(({ id }) => id === collection.id)
          ? current
          : {
              ...current,
              collections: [...current.collections, collection].sort((a, b) =>
                a.name.localeCompare(b.name),
              ),
            },
      );
      setNotice(`Collection "${name}" is available.`);
      try {
        await loadOrganization();
      } catch {
        setError(`Collection "${name}" was created, but the organization list could not refresh.`);
      }
      return collection;
    } finally {
      setIsBusy(false);
    }
  };

  const deleteTag = async (tag: Tag): Promise<boolean> => {
    if (!window.confirm(`Delete tag "${tag.name}" from every paper?`)) return false;
    if (!discardDraftIfNeeded()) return false;
    setIsBusy(true);
    setError(null);
    try {
      try {
        unwrap(
          await window.paperMind.library.deleteTag({
            id: tag.id,
            confirmation: 'REMOVE_ORGANIZATION_ITEM',
          }),
        );
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'The tag could not be deleted.');
        return false;
      }
      setOrganization((current) => ({
        ...current,
        tags: current.tags.filter(({ id }) => id !== tag.id),
      }));
      const nextQuery = query.tagIds?.includes(tag.id)
        ? { ...query, tagIds: query.tagIds.filter((id) => id !== tag.id) }
        : query;
      setQuery(nextQuery);
      setNotice(`Tag "${tag.name}" deleted.`);
      let refreshError: string | null = null;
      if (selectedId) {
        try {
          setSelectedPaper(unwrap(await window.paperMind.library.getPaper(selectedId)));
        } catch {
          setSelectedPaper(null);
          refreshError = `Tag "${tag.name}" was deleted, but the paper details could not refresh.`;
        }
      }
      try {
        await loadPapers(nextQuery, selectedId ?? undefined, selectedId !== null);
      } catch {
        const listError = `Tag "${tag.name}" was deleted, but the library view could not refresh.`;
        refreshError = refreshError ? `${refreshError}\n${listError}` : listError;
      }
      if (refreshError) setError(refreshError);
      return true;
    } finally {
      setIsBusy(false);
    }
  };

  const deleteCollection = async (collection: Collection): Promise<boolean> => {
    if (!window.confirm(`Delete collection "${collection.name}" from every paper?`)) return false;
    if (!discardDraftIfNeeded()) return false;
    setIsBusy(true);
    setError(null);
    try {
      try {
        unwrap(
          await window.paperMind.library.deleteCollection({
            id: collection.id,
            confirmation: 'REMOVE_ORGANIZATION_ITEM',
          }),
        );
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'The collection could not be deleted.');
        return false;
      }
      setOrganization((current) => ({
        ...current,
        collections: current.collections.filter(({ id }) => id !== collection.id),
      }));
      const { collectionId, ...queryWithoutCollection } = query;
      const nextQuery = collectionId === collection.id ? queryWithoutCollection : query;
      setQuery(nextQuery);
      setNotice(`Collection "${collection.name}" deleted.`);
      let refreshError: string | null = null;
      if (selectedId) {
        try {
          setSelectedPaper(unwrap(await window.paperMind.library.getPaper(selectedId)));
        } catch {
          setSelectedPaper(null);
          refreshError = `Collection "${collection.name}" was deleted, but the paper details could not refresh.`;
        }
      }
      try {
        await loadPapers(nextQuery, selectedId ?? undefined, selectedId !== null);
      } catch {
        const listError = `Collection "${collection.name}" was deleted, but the library view could not refresh.`;
        refreshError = refreshError ? `${refreshError}\n${listError}` : listError;
      }
      if (refreshError) setError(refreshError);
      return true;
    } finally {
      setIsBusy(false);
    }
  };

  const applyBatchUpdate = async (input: {
    readonly addTagIds: readonly string[];
    readonly readingStatus?: ReadingStatus;
  }): Promise<boolean> => {
    if (!discardDraftIfNeeded()) return false;
    setIsBusy(true);
    setError(null);
    try {
      unwrap(
        await window.paperMind.library.batchUpdatePapers({
          ids: selectedIds,
          addTagIds: input.addTagIds,
          ...(input.readingStatus === undefined ? {} : { readingStatus: input.readingStatus }),
        }),
      );
      const count = selectedIds.length;
      setSelectedIds([]);
      setNotice(`${String(count)} papers updated.`);
      try {
        await loadPapers(query, selectedId ?? undefined, selectedId !== null);
        if (selectedId) {
          setSelectedPaper(unwrap(await window.paperMind.library.getPaper(selectedId)));
        }
      } catch {
        setError('The papers were updated, but the library view could not refresh.');
      }
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'The selected papers could not be updated.',
      );
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const visiblePaper = selectedPaper?.id === selectedId ? selectedPaper : null;

  const createAnnotation = async (input: CreateAnnotationInput) => {
    setIsBusy(true);
    setError(null);
    try {
      const annotation = unwrap(await window.paperMind.reader.createAnnotation(input));
      setAnnotations((current) =>
        [...current, annotation].sort((a, b) => a.pageNumber - b.pageNumber),
      );
      setNotice('Annotation saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The annotation could not be saved.');
    } finally {
      setIsBusy(false);
    }
  };

  const updateAnnotation = async (input: UpdateAnnotationInput) => {
    setIsBusy(true);
    setError(null);
    try {
      const updated = unwrap(await window.paperMind.reader.updateAnnotation(input));
      setAnnotations((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setNotice('Annotation updated.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The annotation could not be updated.');
    } finally {
      setIsBusy(false);
    }
  };

  const deleteAnnotation = async (annotation: Annotation) => {
    setIsBusy(true);
    setError(null);
    try {
      unwrap(
        await window.paperMind.reader.deleteAnnotation({
          id: annotation.id,
          rowVersion: annotation.rowVersion,
        }),
      );
      setAnnotations((current) => current.filter(({ id }) => id !== annotation.id));
      setNotice('Annotation deleted.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The annotation could not be deleted.');
    } finally {
      setIsBusy(false);
    }
  };

  const exportAnnotations = async (format: AnnotationExportFormat) => {
    if (!visiblePaper) return;
    setIsBusy(true);
    setError(null);
    try {
      const result = unwrap(
        await window.paperMind.reader.exportAnnotations({ paperId: visiblePaper.id, format }),
      );
      if (!result.cancelled)
        setNotice(
          `${String(result.annotationCount)} annotations exported to ${result.filename ?? format}.`,
        );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Annotations could not be exported.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section
      className="relative grid h-full min-h-0 min-w-0 flex-1 grid-cols-[minmax(250px,310px)_minmax(440px,1fr)_minmax(280px,320px)] grid-rows-[minmax(0,1fr)] overflow-hidden bg-white"
      data-testid="library-drop-zone"
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setIsDragging(false);
        }
      }}
      onDrop={handleDrop}
    >
      <PaperListPanel
        isBusy={isBusy}
        organization={organization}
        papers={library.items}
        query={query}
        selectedId={selectedId}
        selectedIds={selectedIds}
        total={library.total}
        onBatchApply={applyBatchUpdate}
        onClearSelection={() => setSelectedIds([])}
        onImport={() => {
          if (discardDraftIfNeeded()) {
            void runImport(() => window.paperMind.library.chooseAndImportPdfs());
          }
        }}
        onQueryChange={(nextQuery) => {
          preservedSelectionRef.current = null;
          setQuery(nextQuery);
        }}
        onSelect={(id) => {
          if (id === selectedId) return;
          if (discardDraftIfNeeded()) {
            preservedSelectionRef.current = null;
            setSelectedId(id);
          }
        }}
        onToggleSelected={(id) =>
          setSelectedIds((current) =>
            current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
          )
        }
      />

      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-zinc-100">
        <div className="flex h-10 shrink-0 items-center justify-center border-b border-zinc-200 bg-white">
          <div className="flex rounded border border-zinc-200 p-0.5">
            <button
              className={`flex h-7 items-center gap-1.5 rounded-sm px-3 text-xs font-medium ${workspaceMode === 'reader' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}
              disabled={isBusy}
              type="button"
              onClick={() => {
                if (workspaceMode === 'reader' || discardDraftIfNeeded()) {
                  setWorkspaceMode('reader');
                }
              }}
            >
              <BookOpen aria-hidden="true" className="size-3.5" />
              Reader
            </button>
            <button
              className={`flex h-7 items-center gap-1.5 rounded-sm px-3 text-xs font-medium ${workspaceMode === 'details' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}
              disabled={isBusy}
              type="button"
              onClick={() => setWorkspaceMode('details')}
            >
              <FilePenLine aria-hidden="true" className="size-3.5" />
              Details
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {workspaceMode === 'reader' ? (
            <PDFReader
              paper={visiblePaper}
              annotations={annotations}
              jumpRequest={jumpRequest}
              onCreateAnnotation={createAnnotation}
              onError={reportError}
            />
          ) : (
            <PaperDetailsPanel
              key={
                visiblePaper
                  ? `${visiblePaper.id}:${String(visiblePaper.rowVersion)}:${String(detailsResetNonce)}`
                  : 'empty'
              }
              isBusy={isBusy}
              organization={organization}
              paper={visiblePaper}
              onCreateCollection={createCollection}
              onCreateTag={createTag}
              onDeleteCollection={deleteCollection}
              onDirtyChange={setDetailsDirtyState}
              onDelete={() => visiblePaper && setPendingDeletion(visiblePaper)}
              onDeleteTag={deleteTag}
              onSave={(input) => void savePaper(input)}
            />
          )}
        </div>
      </div>

      <AnnotationSidebar
        key={visiblePaper?.id ?? 'no-paper'}
        paperTitle={visiblePaper?.title ?? null}
        annotations={annotations}
        isBusy={isBusy}
        onDelete={deleteAnnotation}
        onExport={exportAnnotations}
        onJump={(pageNumber) => {
          if (!discardDraftIfNeeded()) return;
          setWorkspaceMode('reader');
          setJumpRequest({ pageNumber, nonce: Date.now() });
        }}
        onUpdate={updateAnnotation}
      />

      {isDragging ? (
        <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center border-2 border-dashed border-emerald-600 bg-white/95 text-sm font-semibold text-emerald-800">
          Drop PDFs to import
        </div>
      ) : null}

      {error || notice ? (
        <div
          className={`absolute bottom-5 left-1/2 z-30 max-w-xl -translate-x-1/2 whitespace-pre-line rounded-md px-4 py-3 text-sm shadow-lg ${
            error ? 'bg-red-700 text-white' : 'bg-zinc-900 text-white'
          }`}
          role={error ? 'alert' : 'status'}
        >
          {error ?? notice}
          <button
            aria-label="Dismiss notification"
            className="ml-4 text-xs font-semibold underline"
            type="button"
            onClick={() => {
              setError(null);
              setNotice(null);
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {pendingDeletion ? (
        <DeletePaperDialog
          isBusy={isBusy}
          paper={pendingDeletion}
          onCancel={() => setPendingDeletion(null)}
          onConfirm={(mode) => void removePaper(mode)}
        />
      ) : null}
    </section>
  );
}
