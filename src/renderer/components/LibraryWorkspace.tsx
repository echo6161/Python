import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { BookOpen, FilePenLine } from 'lucide-react';

import type {
  ApiResult,
  PaperDetails,
  PaperImportBatch,
  PaperListResult,
  PaperMetadataUpdate,
  PaperRemovalMode,
} from '../../shared/contracts/library';
import type {
  Annotation,
  AnnotationExportFormat,
  CreateAnnotationInput,
  UpdateAnnotationInput,
} from '../../shared/contracts/reader';
import { AnnotationSidebar } from './AnnotationSidebar';
import { DeletePaperDialog } from './DeletePaperDialog';
import { PaperDetailsPanel } from './PaperDetailsPanel';
import { PaperListPanel } from './PaperListPanel';
import { PDFReader } from './PDFReader';

function unwrap<T>(result: ApiResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

export function LibraryWorkspace() {
  const [library, setLibrary] = useState<PaperListResult>({ items: [], total: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPaper, setSelectedPaper] = useState<PaperDetails | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<PaperDetails | null>(null);
  const [annotations, setAnnotations] = useState<readonly Annotation[]>([]);
  const [workspaceMode, setWorkspaceMode] = useState<'reader' | 'details'>('reader');
  const [jumpRequest, setJumpRequest] = useState<{ pageNumber: number; nonce: number } | null>(
    null,
  );

  const reportError = useCallback((message: string) => setError(message), []);

  const loadPapers = useCallback(async (query: string, preferredId?: string) => {
    const result = unwrap(
      await window.paperMind.library.listPapers({ search: query, limit: 100, offset: 0 }),
    );
    setLibrary(result);
    setSelectedId((current) => {
      const candidate = preferredId ?? current;
      return candidate && result.items.some(({ id }) => id === candidate)
        ? candidate
        : (result.items[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadPapers(search).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'The paper list could not be loaded.');
      });
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [loadPapers, search]);

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
      const preferredId = imported[0]?.paper?.id ?? duplicates[0]?.paper?.id;

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
      await loadPapers(search, preferredId);
    },
    [loadPapers, search],
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
    void runImport(() => window.paperMind.library.importDroppedPdfs(files));
  };

  const saveMetadata = async (input: PaperMetadataUpdate) => {
    setIsBusy(true);
    setError(null);
    try {
      const paper = unwrap(await window.paperMind.library.updatePaperMetadata(input));
      setSelectedPaper(paper);
      setNotice('Paper details saved.');
      await loadPapers(search, paper.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The paper details could not be saved.');
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
      setSelectedPaper(null);
      setAnnotations([]);
      setNotice(
        mode === 'record-only' ? 'Paper record removed.' : 'Paper and managed copy removed.',
      );
      await loadPapers(search);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The paper could not be removed.');
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
        papers={library.items}
        search={search}
        selectedId={selectedId}
        total={library.total}
        onImport={() => void runImport(() => window.paperMind.library.chooseAndImportPdfs())}
        onSearch={setSearch}
        onSelect={setSelectedId}
      />

      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-zinc-100">
        <div className="flex h-10 shrink-0 items-center justify-center border-b border-zinc-200 bg-white">
          <div className="flex rounded border border-zinc-200 p-0.5">
            <button
              className={`flex h-7 items-center gap-1.5 rounded-sm px-3 text-xs font-medium ${workspaceMode === 'reader' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}
              type="button"
              onClick={() => setWorkspaceMode('reader')}
            >
              <BookOpen aria-hidden="true" className="size-3.5" />
              Reader
            </button>
            <button
              className={`flex h-7 items-center gap-1.5 rounded-sm px-3 text-xs font-medium ${workspaceMode === 'details' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}
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
              key={visiblePaper ? `${visiblePaper.id}:${String(visiblePaper.rowVersion)}` : 'empty'}
              isBusy={isBusy}
              paper={visiblePaper}
              onDelete={() => visiblePaper && setPendingDeletion(visiblePaper)}
              onSave={(input) => void saveMetadata(input)}
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
