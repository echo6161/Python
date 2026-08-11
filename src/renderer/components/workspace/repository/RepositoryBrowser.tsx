import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';

import type { RepositoryRef, RepositorySourceFile } from '../../../../shared/contracts/repository';
import { rendererLogger } from '../../../logger';
import { RepositoryTree } from './RepositoryTree';
import { SourceViewer } from './SourceViewer';
import { CodeSearchPanel } from './CodeSearchPanel';

export function RepositoryBrowser({ repository }: { readonly repository: RepositoryRef }) {
  const [source, setSource] = useState<RepositorySourceFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [targetLine, setTargetLine] = useState<number | null>(null);
  const activeRequest = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (activeRequest.current)
        void window.paperMind.repository.cancelRequest(activeRequest.current);
    };
  }, []);

  const readSource = async (relativePath: string, line?: number) => {
    const requestId = crypto.randomUUID();
    activeRequest.current = requestId;
    setError(null);
    setLoading(true);
    try {
      const result = await window.paperMind.repository.readSource({
        repositoryId: repository.id,
        requestId,
        relativePath,
      });
      if (activeRequest.current !== requestId) return;
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setSource(result.value);
      setTargetLine(line ?? null);
    } catch (caught) {
      rendererLogger.error('Unable to read repository source', caught);
      setError('The source file could not be opened.');
    } finally {
      if (activeRequest.current === requestId) activeRequest.current = null;
      setLoading(false);
    }
  };

  const openIndexedLocation = async (relativePath: string, line: number) => {
    setError(null);
    try {
      const result = await window.paperMind.repository.openInVscode({
        repositoryId: repository.id,
        relativePath,
        line,
      });
      if (!result.ok) setError(result.error.message);
    } catch (caught) {
      rendererLogger.error('Unable to open indexed location in VS Code', caught);
      setError('VS Code could not open the indexed source location.');
    }
  };

  const openInVscode = async (line?: number) => {
    setError(null);
    try {
      const result = await window.paperMind.repository.openInVscode({
        repositoryId: repository.id,
        ...(source ? { relativePath: source.relativePath } : {}),
        ...(line === undefined ? {} : { line }),
      });
      if (!result.ok) setError(result.error.message);
    } catch (caught) {
      rendererLogger.error('Unable to open authorized source in VS Code', caught);
      setError('VS Code could not open the authorized source location.');
    }
  };

  return (
    <div className="border-t border-zinc-200">
      <header className="flex min-h-12 items-center justify-between gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-2">
        <p className="truncate font-mono text-xs text-zinc-500" title={repository.canonicalRoot}>
          {repository.canonicalRoot}
        </p>
        <button
          className="text-button inline-flex shrink-0 items-center gap-1"
          type="button"
          onClick={() => void openInVscode()}
        >
          <ExternalLink aria-hidden="true" className="size-4" /> Open repository
        </button>
      </header>
      {error ? (
        <div
          className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      {loading ? (
        <p
          className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-600"
          role="status"
        >
          Loading source file...
        </p>
      ) : null}
      <CodeSearchPanel
        repository={repository}
        onNavigate={(relativePath, line) => void readSource(relativePath, line)}
        onOpenInVscode={(relativePath, line) => void openIndexedLocation(relativePath, line)}
      />
      <div className="grid min-h-72 grid-cols-[280px_minmax(0,1fr)]">
        <RepositoryTree
          repository={repository}
          onOpenFile={(relativePath) => void readSource(relativePath)}
        />
        <SourceViewer
          source={source}
          targetLine={targetLine}
          onOpenInVscode={(line) => void openInVscode(line)}
        />
      </div>
    </div>
  );
}
