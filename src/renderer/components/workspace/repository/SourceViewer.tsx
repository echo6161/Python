import { useEffect, useRef } from 'react';
import { ExternalLink } from 'lucide-react';

import type { RepositorySourceFile } from '../../../../shared/contracts/repository';
import { highlightSourceLine } from './source-highlighting';

interface SourceViewerProps {
  readonly source: RepositorySourceFile | null;
  readonly targetLine: number | null;
  readonly onOpenInVscode: (line?: number) => void;
}

export function SourceViewer({ source, targetLine, onOpenInVscode }: SourceViewerProps) {
  const targetRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (typeof targetRef.current?.scrollIntoView === 'function') {
      targetRef.current.scrollIntoView({ block: 'center' });
    }
    targetRef.current?.focus({ preventScroll: true });
  }, [source?.relativePath, targetLine]);
  if (!source) {
    return (
      <div className="flex min-h-72 items-center justify-center text-sm text-zinc-500">
        Select a source file to inspect.
      </div>
    );
  }
  const lines = source.content.split(/\r?\n/u);
  return (
    <section aria-labelledby="source-viewer-heading" className="min-w-0">
      <header className="flex min-h-12 items-center justify-between gap-4 border-b border-zinc-200 px-4 py-2">
        <div className="min-w-0">
          <h3 id="source-viewer-heading" className="truncate text-xs font-semibold text-zinc-900">
            {source.relativePath}
          </h3>
          <p className="text-xs text-zinc-500">
            {source.language} | {source.encoding} | {String(source.lineCount)} lines
          </p>
        </div>
        <button
          className="text-button inline-flex items-center gap-1"
          type="button"
          onClick={() => onOpenInVscode()}
        >
          <ExternalLink aria-hidden="true" className="size-4" />
          Open file
        </button>
      </header>
      <div className="max-h-[560px] overflow-auto bg-zinc-950 py-2 font-mono text-xs leading-5">
        {lines.map((line, index) => {
          const lineNumber = index + 1;
          return (
            <button
              aria-label={`Open line ${String(lineNumber)} in VS Code`}
              className={`grid min-h-5 w-full grid-cols-[56px_minmax(max-content,1fr)] text-left hover:bg-zinc-800 focus-visible:outline-none ${targetLine === lineNumber ? 'bg-emerald-950 ring-1 ring-inset ring-emerald-500' : 'focus-visible:bg-zinc-800'}`}
              key={lineNumber}
              ref={targetLine === lineNumber ? targetRef : undefined}
              type="button"
              onClick={() => onOpenInVscode(lineNumber)}
            >
              <span
                aria-hidden="true"
                className="select-none border-r border-zinc-800 pr-3 text-right text-zinc-500"
              >
                {lineNumber}
              </span>
              <code className="whitespace-pre px-3 text-zinc-200">
                {highlightSourceLine(line, source.language)}
              </code>
            </button>
          );
        })}
      </div>
    </section>
  );
}
