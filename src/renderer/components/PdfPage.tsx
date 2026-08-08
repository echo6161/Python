import { useEffect, useRef, useState } from 'react';
import { TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';

import type { Annotation } from '../../shared/contracts/reader';
import { captureSelectionAnchor, type SelectionAnchor } from '../pdf/selection-anchor';

interface PdfPageProps {
  readonly document: PDFDocumentProxy;
  readonly pageNumber: number;
  readonly scale: number;
  readonly baseWidth: number;
  readonly baseHeight: number;
  readonly annotations: readonly Annotation[];
  readonly onSelection: (anchor: SelectionAnchor | null) => void;
}

const COLORS = {
  yellow: 'rgba(250, 204, 21, 0.38)',
  green: 'rgba(52, 211, 153, 0.34)',
  blue: 'rgba(96, 165, 250, 0.34)',
  pink: 'rgba(244, 114, 182, 0.34)',
} as const;

export function PdfPage({
  document,
  pageNumber,
  scale,
  baseWidth,
  baseHeight,
  annotations,
  onSelection,
}: PdfPageProps) {
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: baseWidth * scale, height: baseHeight * scale });

  useEffect(() => {
    let active = true;
    let renderTask: RenderTask | null = null;
    let textLayer: TextLayer | null = null;
    void document.getPage(pageNumber).then(async (page) => {
      if (!active) return;
      const viewport = page.getViewport({ scale });
      setSize({ width: viewport.width, height: viewport.height });
      const canvas = canvasRef.current;
      const textContainer = textLayerRef.current;
      const pageElement = pageRef.current;
      if (!canvas || !textContainer || !pageElement) return;

      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${String(viewport.width)}px`;
      canvas.style.height = `${String(viewport.height)}px`;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return;
      renderTask = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      });

      const textContent = await page.getTextContent();
      if (textLayerRef.current !== textContainer) return;
      textContainer.replaceChildren();
      const renderedTextLayer = new TextLayer({
        textContentSource: textContent,
        container: textContainer,
        viewport,
      });
      textLayer = renderedTextLayer;
      await Promise.all([renderTask.promise, renderedTextLayer.render()]);
      if (textLayerRef.current !== textContainer) return;
      let offset = 0;
      const pageTextParts: string[] = [];
      renderedTextLayer.textDivs.forEach((span, index) => {
        const value = renderedTextLayer.textContentItemsStr.at(index) ?? span.textContent;
        span.dataset.textStart = String(offset);
        pageTextParts.push(value);
        offset += value.length + 1;
      });
      pageElement.dataset.pageText = pageTextParts.join(' ');
    });
    return () => {
      active = false;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [baseHeight, baseWidth, document, pageNumber, scale]);

  return (
    <article
      ref={pageRef}
      aria-label={`Page ${String(pageNumber)}`}
      className="pdf-page relative mx-auto overflow-hidden bg-white shadow-sm"
      data-page-number={pageNumber}
      style={{ width: size.width, height: size.height }}
      onMouseUp={() => {
        const selection = window.getSelection();
        onSelection(
          selection && pageRef.current
            ? captureSelectionAnchor(selection, pageRef.current, pageNumber)
            : null,
        );
      }}
    >
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block" />
      <div ref={textLayerRef} className="textLayer" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10">
        {annotations.flatMap((annotation) =>
          annotation.boundingRects.map((rect, index) => (
            <span
              key={`${annotation.id}:${String(index)}`}
              className="absolute"
              data-annotation-id={annotation.id}
              style={{
                left: `${String(rect.x * 100)}%`,
                top: `${String(rect.y * 100)}%`,
                width: `${String(rect.width * 100)}%`,
                height: `${String(rect.height * 100)}%`,
                background:
                  annotation.annotationType === 'highlight'
                    ? COLORS[annotation.color]
                    : 'transparent',
                borderBottom:
                  annotation.annotationType === 'underline'
                    ? `2px solid ${COLORS[annotation.color].replace(/0\.\d+\)/, '0.9)')}`
                    : undefined,
              }}
            />
          )),
        )}
      </div>
      <span className="pointer-events-none absolute bottom-2 right-3 z-20 text-[10px] tabular-nums text-zinc-400">
        {pageNumber}
      </span>
    </article>
  );
}
