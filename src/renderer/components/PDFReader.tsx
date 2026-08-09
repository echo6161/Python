import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import workerSource from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  Highlighter,
  Languages,
  Maximize2,
  MessageCircleQuestion,
  Search,
  Sparkles,
  StretchHorizontal,
  TextSearch,
  Underline,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import type {
  Annotation,
  AnnotationColor,
  AnnotationType,
  CreateAnnotationInput,
} from '../../shared/contracts/reader';
import type { AiSelectionScope, AiTaskKind } from '../../shared/contracts/ai';
import type { PaperDetails } from '../../shared/contracts/library';
import { buildPdfSearchIndex, searchPdfIndex, type IndexedPdfPage } from '../pdf/pdf-search';
import type { SelectionAnchor } from '../pdf/selection-anchor';
import { PdfPage } from './PdfPage';
import { PdfSearchPanel } from './PdfSearchPanel';

GlobalWorkerOptions.workerSrc = workerSource;

interface PDFReaderProps {
  readonly paper: PaperDetails | null;
  readonly annotations: readonly Annotation[];
  readonly jumpRequest: { readonly pageNumber: number; readonly nonce: number } | null;
  readonly onCreateAnnotation: (input: CreateAnnotationInput) => Promise<void>;
  readonly onAiAction: (
    kind: Extract<AiTaskKind, 'translate' | 'explain' | 'term' | 'follow_up'>,
    selection: AiSelectionScope,
  ) => void;
  readonly onError: (message: string) => void;
}

const COLOR_OPTIONS: readonly AnnotationColor[] = ['yellow', 'green', 'blue', 'pink'];
const COLOR_HEX = {
  yellow: '#facc15',
  green: '#34d399',
  blue: '#60a5fa',
  pink: '#f472b6',
} as const;

function unwrap<T>(
  result: Awaited<ReturnType<typeof window.paperMind.reader.getPdfAccess>> | { ok: true; value: T },
): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value as T;
}

export function PDFReader({
  paper,
  annotations,
  jumpRequest,
  onCreateAnnotation,
  onAiAction,
  onError,
}: PDFReaderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [baseSize, setBaseSize] = useState({ width: 612, height: 792 });
  const [scale, setScale] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [stateReady, setStateReady] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Select a paper to read');
  const [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor | null>(null);
  const [annotationColor, setAnnotationColor] = useState<AnnotationColor>('yellow');
  const [comment, setComment] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState<readonly IndexedPdfPage[]>([]);
  const [indexedPages, setIndexedPages] = useState(0);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);

  const pageCount = document?.numPages ?? 0;
  // TanStack Virtual intentionally exposes an imperative instance that React Compiler skips.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: pageCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => baseSize.height * scale + 24,
    overscan: 2,
    getItemKey: (index) => index + 1,
  });
  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    let active = true;
    let task: PDFDocumentLoadingTask | null = null;
    setDocument(null);
    setStateReady(false);
    setSearchIndex([]);
    setIndexedPages(0);
    setSelectionAnchor(null);
    if (!paper) {
      setLoadingMessage('Select or import a paper');
      return;
    }
    setLoadingMessage('Opening PDF...');
    void Promise.all([
      window.paperMind.reader.getPdfAccess(paper.id),
      window.paperMind.reader.getReadingState(paper.id),
    ])
      .then(async ([accessResult, stateResult]) => {
        const access = unwrap<{ readonly url: string }>(accessResult);
        const readingState = unwrap<{ readonly pageNumber: number; readonly scale: number } | null>(
          stateResult,
        );
        task = getDocument({ url: access.url, rangeChunkSize: 65_536 });
        const loaded = await task.promise;
        const firstPage = await loaded.getPage(1);
        const viewport = firstPage.getViewport({ scale: 1 });
        if (!active) {
          return;
        }
        const restoredScale = readingState?.scale ?? 1;
        const restoredPage = Math.min(readingState?.pageNumber ?? 1, loaded.numPages);
        setBaseSize({ width: viewport.width, height: viewport.height });
        setScale(restoredScale);
        setCurrentPage(restoredPage);
        setPageInput(String(restoredPage));
        setDocument(loaded);
        setStateReady(true);
        setLoadingMessage('');
        window.setTimeout(() => virtualizer.scrollToIndex(restoredPage - 1, { align: 'start' }), 0);
      })
      .catch((reason: unknown) => {
        if (active) {
          const message = reason instanceof Error ? reason.message : 'The PDF could not be opened.';
          setLoadingMessage(message);
          onError(message);
        }
      });
    return () => {
      active = false;
      if (task) void task.destroy();
    };
  }, [onError, paper, virtualizer]);

  useEffect(() => {
    virtualizer.measure();
  }, [scale, virtualizer]);

  useEffect(() => {
    if (!jumpRequest || !document) return;
    const page = Math.min(Math.max(1, jumpRequest.pageNumber), document.numPages);
    virtualizer.scrollToIndex(page - 1, { align: 'start' });
    setCurrentPage(page);
    setPageInput(String(page));
  }, [document, jumpRequest, virtualizer]);

  useEffect(() => {
    if (!paper || !stateReady || !document) return;
    const timeout = window.setTimeout(() => {
      void window.paperMind.reader
        .saveReadingState({ paperId: paper.id, pageNumber: currentPage, scale })
        .then((result) => {
          if (!result.ok) onError(result.error.message);
        });
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [currentPage, document, onError, paper, scale, stateReady]);

  useEffect(() => {
    if (!searchOpen || !document || searchIndex.length > 0) return;
    const controller = new AbortController();
    void buildPdfSearchIndex(document, (completed) => setIndexedPages(completed), controller.signal)
      .then(setSearchIndex)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
          onError(reason instanceof Error ? reason.message : 'PDF search indexing failed.');
        }
      });
    return () => controller.abort();
  }, [document, onError, searchIndex.length, searchOpen]);

  useEffect(() => {
    if (virtualItems.length === 0 || !scrollRef.current) return;
    const scrollElement = scrollRef.current;
    const atBottom =
      scrollElement.scrollTop + scrollElement.clientHeight >= scrollElement.scrollHeight - 2;
    const marker = scrollElement.scrollTop + 40;
    const visible =
      [...virtualItems].reverse().find((item) => item.start <= marker) ?? virtualItems[0];
    const next = atBottom ? pageCount : (visible?.index ?? 0) + 1;
    setCurrentPage((current) => (current === next ? current : next));
    setPageInput((current) =>
      window.document.activeElement?.getAttribute('aria-label') === 'Current page'
        ? current
        : String(next),
    );
  }, [pageCount, virtualItems]);

  const searchResults = useMemo(
    () => searchPdfIndex(searchIndex, searchQuery),
    [searchIndex, searchQuery],
  );
  const annotationsByPage = useMemo(() => {
    const grouped = new Map<number, Annotation[]>();
    for (const annotation of annotations) {
      const values = grouped.get(annotation.pageNumber) ?? [];
      values.push(annotation);
      grouped.set(annotation.pageNumber, values);
    }
    return grouped;
  }, [annotations]);

  const jumpToPage = (requested: number) => {
    if (!document) return;
    const page = Math.min(Math.max(1, requested), document.numPages);
    virtualizer.scrollToIndex(page - 1, { align: 'start' });
    setCurrentPage(page);
    setPageInput(String(page));
  };

  const fit = (mode: 'width' | 'page') => {
    const container = scrollRef.current;
    if (!container) return;
    const widthScale = (container.clientWidth - 48) / baseSize.width;
    const pageScale = Math.min(widthScale, (container.clientHeight - 48) / baseSize.height);
    setScale(Math.min(5, Math.max(0.25, mode === 'width' ? widthScale : pageScale)));
  };

  const createAnnotation = async (annotationType: AnnotationType) => {
    if (!paper || !selectionAnchor) return;
    await onCreateAnnotation({
      paperId: paper.id,
      ...selectionAnchor,
      annotationType,
      color: annotationColor,
      comment: comment.trim() || null,
    });
    setSelectionAnchor(null);
    setComment('');
    window.getSelection()?.removeAllRanges();
  };

  const startAiAction = (
    kind: Extract<AiTaskKind, 'translate' | 'explain' | 'term' | 'follow_up'>,
  ) => {
    if (!paper || !selectionAnchor) return;
    onAiAction(kind, {
      paperId: paper.id,
      paperTitle: paper.title,
      pageNumber: selectionAnchor.pageNumber,
      selectedText: selectionAnchor.selectedText,
      textStart: selectionAnchor.textStart,
      textEnd: selectionAnchor.textEnd,
    });
    setAiMenuOpen(false);
  };

  return (
    <section
      aria-labelledby="reader-heading"
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-100"
    >
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-3">
        <div className="min-w-0">
          <h2 id="reader-heading" className="truncate text-sm font-semibold text-zinc-900">
            {paper?.title ?? 'PDF reader'}
          </h2>
          <p className="truncate text-xs text-zinc-500">
            {paper?.file.originalFilename ?? 'No active paper'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            aria-label="Search PDF"
            className="icon-button"
            disabled={!document}
            title="Search PDF"
            type="button"
            onClick={() => setSearchOpen((open) => !open)}
          >
            <Search aria-hidden="true" className="size-4" />
          </button>
          <span className="mx-1 h-5 w-px bg-zinc-200" />
          <button
            aria-label="Zoom out"
            className="icon-button"
            disabled={!document || scale <= 0.25}
            title="Zoom out"
            type="button"
            onClick={() => setScale((value) => Math.max(0.25, Number((value - 0.1).toFixed(2))))}
          >
            <ZoomOut aria-hidden="true" className="size-4" />
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-zinc-600">
            {Math.round(scale * 100)}%
          </span>
          <button
            aria-label="Zoom in"
            className="icon-button"
            disabled={!document || scale >= 5}
            title="Zoom in"
            type="button"
            onClick={() => setScale((value) => Math.min(5, Number((value + 0.1).toFixed(2))))}
          >
            <ZoomIn aria-hidden="true" className="size-4" />
          </button>
          <button
            aria-label="Fit width"
            className="icon-button"
            disabled={!document}
            title="Fit width"
            type="button"
            onClick={() => fit('width')}
          >
            <StretchHorizontal aria-hidden="true" className="size-4" />
          </button>
          <button
            aria-label="Fit page"
            className="icon-button"
            disabled={!document}
            title="Fit page"
            type="button"
            onClick={() => fit('page')}
          >
            <Maximize2 aria-hidden="true" className="size-4" />
          </button>
          <span className="mx-1 h-5 w-px bg-zinc-200" />
          <input
            aria-label="Current page"
            className="h-8 w-12 rounded border border-zinc-200 px-1 text-center text-xs tabular-nums outline-none focus:border-emerald-600"
            inputMode="numeric"
            value={pageInput}
            onChange={(event) => setPageInput(event.target.value)}
            onBlur={() => jumpToPage(Number(pageInput))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') jumpToPage(Number(pageInput));
            }}
          />
          <span className="text-xs tabular-nums text-zinc-500">/ {pageCount || '-'}</span>
        </div>
      </header>

      {selectionAnchor ? (
        <div
          className="flex min-h-12 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-3"
          role="toolbar"
          aria-label="Annotation tools"
        >
          <span
            className="max-w-40 truncate text-xs text-zinc-500"
            title={selectionAnchor.selectedText}
          >
            {selectionAnchor.selectedText}
          </span>
          {COLOR_OPTIONS.map((color) => (
            <button
              key={color}
              aria-label={`${color} annotation`}
              className={`size-5 rounded-full border ${annotationColor === color ? 'ring-2 ring-zinc-500 ring-offset-1' : 'border-zinc-300'}`}
              style={{ backgroundColor: COLOR_HEX[color] }}
              title={`${color} annotation`}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setAnnotationColor(color)}
            />
          ))}
          <input
            aria-label="Annotation comment"
            className="h-8 min-w-0 flex-1 rounded border border-zinc-200 px-2 text-xs outline-none focus:border-emerald-600"
            maxLength={20_000}
            placeholder="Optional comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
          <button
            className="command-button"
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void createAnnotation('highlight')}
          >
            <Highlighter aria-hidden="true" className="size-4" />
            Highlight
          </button>
          <button
            className="command-button"
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void createAnnotation('underline')}
          >
            <Underline aria-hidden="true" className="size-4" />
            Underline
          </button>
          <div className="relative">
            <button
              aria-expanded={aiMenuOpen}
              aria-haspopup="menu"
              aria-label="AI actions"
              className="icon-button border-zinc-200"
              title="AI actions"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setAiMenuOpen((open) => !open)}
            >
              <Sparkles aria-hidden="true" className="size-4" />
            </button>
            {aiMenuOpen ? (
              <div
                className="absolute right-0 top-9 z-30 w-52 border border-zinc-200 bg-white py-1 shadow-lg"
                role="menu"
              >
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50"
                  role="menuitem"
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => startAiAction('translate')}
                >
                  <Languages aria-hidden="true" className="size-4" />
                  Translate to Chinese
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50"
                  role="menuitem"
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => startAiAction('explain')}
                >
                  <TextSearch aria-hidden="true" className="size-4" />
                  Explain selection
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50"
                  role="menuitem"
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => startAiAction('term')}
                >
                  <Sparkles aria-hidden="true" className="size-4" />
                  Explain term
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50"
                  role="menuitem"
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => startAiAction('follow_up')}
                >
                  <MessageCircleQuestion aria-hidden="true" className="size-4" />
                  Ask about selection
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1">
        {searchOpen && document ? (
          <PdfSearchPanel
            query={searchQuery}
            results={searchResults}
            indexedPages={indexedPages}
            totalPages={document.numPages}
            onClose={() => setSearchOpen(false)}
            onQuery={setSearchQuery}
            onResult={jumpToPage}
          />
        ) : null}
        <div ref={scrollRef} className="h-full overflow-auto" data-testid="pdf-scroll-container">
          {document ? (
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualItems.map((item) => (
                <div
                  key={item.key}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 top-0 w-full py-3"
                  data-index={item.index}
                  style={{ transform: `translateY(${String(item.start)}px)` }}
                >
                  <PdfPage
                    document={document}
                    pageNumber={item.index + 1}
                    scale={scale}
                    baseWidth={baseSize.width}
                    baseHeight={baseSize.height}
                    annotations={annotationsByPage.get(item.index + 1) ?? []}
                    onSelection={setSelectionAnchor}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div
              className="flex h-full items-center justify-center p-8 text-center text-sm text-zinc-500"
              role="status"
            >
              {loadingMessage}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
