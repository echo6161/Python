import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { ChevronLeft, ChevronRight, FileText, RefreshCw, Search, X } from 'lucide-react';

import type {
  ZoteroCollection,
  ZoteroCollectionRef,
  ZoteroConnectionStatus,
  ZoteroItemPage,
  ZoteroItemSummary,
} from '../../../shared/contracts/zotero';
import { rendererLogger } from '../../logger';
import {
  formatZoteroItemType,
  zoteroCreatorNames,
  zoteroPdfLabel,
} from '../../workspace/zotero-display';
import { zoteroReferenceKey } from '../../workspace/zotero-reference';

const PAGE_SIZE = 20;

interface ZoteroPickerDialogProps {
  readonly existingRefs: ReadonlySet<string>;
  readonly workspaceId: string;
  readonly onAdded: () => void;
  readonly onClose: () => void;
}

export function ZoteroPickerDialog({
  existingRefs,
  workspaceId,
  onAdded,
  onClose,
}: ZoteroPickerDialogProps) {
  const [status, setStatus] = useState<ZoteroConnectionStatus | null>(null);
  const [collections, setCollections] = useState<readonly ZoteroCollection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<ZoteroCollectionRef | null>(null);
  const [collectionItems, setCollectionItems] = useState<readonly ZoteroItemSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [page, setPage] = useState<ZoteroItemPage | null>(null);
  const [collectionStart, setCollectionStart] = useState(0);
  const [selectedItems, setSelectedItems] = useState<ReadonlyMap<string, ZoteroItemSummary>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const activeRequestId = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const cancelActiveRequest = useCallback(async () => {
    const requestId = activeRequestId.current;
    if (!requestId) return;
    try {
      await window.paperMind.zotero.cancelRequest(requestId);
    } catch (caught) {
      rendererLogger.error('Unable to cancel Zotero picker request', caught);
    }
  }, []);

  const loadRemotePage = useCallback(async (start: number, requestedQuery: string) => {
    const requestId = crypto.randomUUID();
    activeRequestId.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const request = { requestId, start, limit: PAGE_SIZE };
      const result = requestedQuery
        ? await window.paperMind.zotero.searchItems({ ...request, query: requestedQuery })
        : await window.paperMind.zotero.listItems(request);
      if (activeRequestId.current !== requestId) return;
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setPage(result.value);
    } catch (caught) {
      if (activeRequestId.current !== requestId) return;
      rendererLogger.error('Unable to load Zotero picker page', caught);
      setError('Zotero results could not be loaded.');
    } finally {
      if (activeRequestId.current === requestId) {
        activeRequestId.current = null;
        setLoading(false);
      }
    }
  }, []);

  const initialize = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    setSelectedCollection(null);
    setCollectionItems(null);
    setCollectionStart(0);
    setPage(null);
    setQuery('');
    setActiveQuery('');
    try {
      const connectionResult = await window.paperMind.zotero.detectZotero();
      if (!connectionResult.ok) {
        setError(connectionResult.error.message);
        return;
      }
      setStatus(connectionResult.value);
      if (!connectionResult.value.available) {
        setError(connectionResult.value.error?.message ?? 'Zotero is unavailable.');
        return;
      }
      const collectionResult = await window.paperMind.zotero.listCollections();
      if (!collectionResult.ok) {
        setError(collectionResult.error.message);
        return;
      }
      setCollections(collectionResult.value);
      await loadRemotePage(0, '');
    } catch (caught) {
      rendererLogger.error('Unable to initialize Zotero picker', caught);
      setError('PaperMind could not connect to Zotero.');
    } finally {
      setLoading(false);
    }
  }, [loadRemotePage]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timer = window.setTimeout(() => {
      searchRef.current?.focus();
      void initialize();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      void cancelActiveRequest();
      opener?.focus();
    };
  }, [cancelActiveRequest, initialize]);

  const chooseCollection = async (value: string) => {
    setError(null);
    setNotice(null);
    setCollectionStart(0);
    if (!value) {
      setSelectedCollection(null);
      setCollectionItems(null);
      await loadRemotePage(0, activeQuery);
      return;
    }
    const collection = collections.find(({ ref }) => collectionKey(ref) === value);
    if (!collection) return;
    setSelectedCollection(collection.ref);
    setLoading(true);
    try {
      const result = await window.paperMind.zotero.listCollectionItems(collection.ref);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setCollectionItems(result.value);
    } catch (caught) {
      rendererLogger.error('Unable to load Zotero collection', caught);
      setError('The Zotero collection could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const collectionMatches = useMemo(() => {
    const normalized = activeQuery.toLocaleLowerCase();
    return (collectionItems ?? []).filter((item) => {
      if (!normalized) return true;
      return [item.title, zoteroCreatorNames(item), item.date ?? '', String(item.year ?? '')]
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [activeQuery, collectionItems]);

  const visibleItems = selectedCollection
    ? collectionMatches.slice(collectionStart, collectionStart + PAGE_SIZE)
    : (page?.items ?? []);
  const pageNumber = selectedCollection
    ? Math.floor(collectionStart / PAGE_SIZE) + 1
    : page
      ? Math.floor(page.start / page.limit) + 1
      : 1;
  const hasPrevious = selectedCollection ? collectionStart > 0 : Boolean(page && page.start > 0);
  const hasNext = selectedCollection
    ? collectionStart + PAGE_SIZE < collectionMatches.length
    : page?.hasNext === true;

  const search = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const normalized = query.trim();
    setActiveQuery(normalized);
    setCollectionStart(0);
    if (!selectedCollection) await loadRemotePage(0, normalized);
  };

  const toggle = (item: ZoteroItemSummary) => {
    const key = zoteroReferenceKey(item.ref);
    if (existingRefs.has(key)) return;
    setSelectedItems((values) => {
      const next = new Map(values);
      if (next.has(key)) next.delete(key);
      else next.set(key, item);
      return next;
    });
  };

  const addSelected = async () => {
    const pendingItems = [...selectedItems.values()];
    if (pendingItems.length === 0) return;
    setAdding(true);
    setError(null);
    setNotice(null);
    let added = 0;
    let duplicates = 0;
    let failed = 0;
    const completed = new Set<string>();
    for (const item of pendingItems) {
      try {
        const result = await window.paperMind.workspace.addPaper({
          workspaceId,
          itemRef: item.ref,
        });
        if (result.ok) {
          added += 1;
          completed.add(zoteroReferenceKey(item.ref));
        } else if (result.error.code === 'CONFLICT') {
          duplicates += 1;
          completed.add(zoteroReferenceKey(item.ref));
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
    }
    setSelectedItems((values) => new Map([...values].filter(([key]) => !completed.has(key))));
    setNotice(
      `${String(added)} added${duplicates ? `, ${String(duplicates)} already present` : ''}${failed ? `, ${String(failed)} failed` : ''}.`,
    );
    if (failed > 0) setError('Some selected papers could not be added. You can retry them.');
    if (added > 0 || duplicates > 0) onAdded();
    setAdding(false);
  };

  const connected = status?.available === true;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-6"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !adding) onClose();
      }}
    >
      <section
        aria-labelledby="zotero-picker-title"
        aria-modal="true"
        className="flex h-[min(760px,calc(100vh-48px))] w-full max-w-5xl flex-col rounded-md border border-zinc-300 bg-white shadow-xl"
        role="dialog"
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div>
            <h2 id="zotero-picker-title" className="text-base font-semibold text-zinc-950">
              Add from Zotero
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Select bibliography items to reference in this Workspace.
            </p>
          </div>
          <button
            aria-label="Close Zotero picker"
            className="icon-button"
            disabled={adding}
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </header>

        <form
          className="grid grid-cols-[minmax(0,1fr)_240px_auto] gap-2 border-b border-zinc-200 px-5 py-3"
          onSubmit={(event) => void search(event)}
        >
          <label className="relative">
            <span className="sr-only">Search Zotero papers</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400"
            />
            <input
              ref={searchRef}
              className="h-9 w-full rounded border border-zinc-300 pl-9 pr-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              maxLength={500}
              placeholder="Title, creator, or year"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">Filter by Zotero collection</span>
            <select
              aria-label="Filter by Zotero collection"
              className="h-9 w-full rounded border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-emerald-600"
              disabled={!connected || loading}
              value={selectedCollection ? collectionKey(selectedCollection) : ''}
              onChange={(event) => void chooseCollection(event.target.value)}
            >
              <option value="">All Zotero items</option>
              {collections.map((collection) => (
                <option key={collectionKey(collection.ref)} value={collectionKey(collection.ref)}>
                  {collection.name || 'Untitled collection'}
                </option>
              ))}
            </select>
          </label>
          <button className="command-button" disabled={!connected || loading} type="submit">
            <Search aria-hidden="true" className="size-4" />
            Search
          </button>
        </form>

        {error || notice ? (
          <div
            className={`border-b px-5 py-2 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}
            role={error ? 'alert' : 'status'}
          >
            {error ?? notice}
            {error ? (
              <button
                className="ml-3 font-semibold underline"
                type="button"
                onClick={() => void initialize()}
              >
                <RefreshCw aria-hidden="true" className="mr-1 inline size-4" />
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && visibleItems.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-zinc-500">Loading Zotero...</p>
          ) : null}
          {!loading && connected && visibleItems.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-zinc-500">
              No matching Zotero papers.
            </p>
          ) : null}
          {!loading && !connected ? (
            <p className="px-5 py-12 text-center text-sm text-zinc-500">
              Start Zotero, then retry.
            </p>
          ) : null}
          {visibleItems.length > 0 ? (
            <ul aria-label="Zotero picker results" className="divide-y divide-zinc-200">
              {visibleItems.map((item) => {
                const key = zoteroReferenceKey(item.ref);
                const exists = existingRefs.has(key);
                const checked = selectedItems.has(key);
                return (
                  <li key={key}>
                    <label
                      className={`grid min-h-20 grid-cols-[24px_minmax(0,1fr)_150px] items-center gap-3 px-5 py-3 ${exists ? 'bg-zinc-50 text-zinc-400' : 'hover:bg-emerald-50'}`}
                    >
                      <input
                        aria-label={`Select ${item.title || item.ref.itemKey}`}
                        checked={checked}
                        disabled={exists || adding}
                        type="checkbox"
                        onChange={() => toggle(item)}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-zinc-900">
                          {item.title || 'Untitled'}
                        </span>
                        <span className="mt-1 block truncate text-xs text-zinc-500">
                          {zoteroCreatorNames(item) || 'No creators'}
                        </span>
                        <span className="mt-1 block text-xs text-zinc-500">
                          {item.year ?? item.date ?? 'No date'} |{' '}
                          {formatZoteroItemType(item.itemType)}
                        </span>
                      </span>
                      <span className="justify-self-end text-right text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <FileText aria-hidden="true" className="size-4" />
                          {zoteroPdfLabel(item.pdf)}
                        </span>
                        {exists ? (
                          <span className="mt-1 block font-medium text-emerald-700">
                            Already added
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <footer className="flex min-h-14 items-center justify-between gap-4 border-t border-zinc-200 px-5 py-3">
          <div className="flex items-center gap-3">
            <button
              aria-label="Previous Zotero picker page"
              className="icon-button"
              disabled={!hasPrevious || loading}
              title="Previous page"
              type="button"
              onClick={() =>
                selectedCollection
                  ? setCollectionStart(Math.max(0, collectionStart - PAGE_SIZE))
                  : page && void loadRemotePage(Math.max(0, page.start - page.limit), activeQuery)
              }
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>
            <span className="text-xs text-zinc-500">Page {String(pageNumber)}</span>
            <button
              aria-label="Next Zotero picker page"
              className="icon-button"
              disabled={!hasNext || loading}
              title="Next page"
              type="button"
              onClick={() =>
                selectedCollection
                  ? setCollectionStart(collectionStart + PAGE_SIZE)
                  : page && void loadRemotePage(page.start + page.limit, activeQuery)
              }
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">{String(selectedItems.size)} selected</span>
            <button className="text-button" disabled={adding} type="button" onClick={onClose}>
              Close
            </button>
            <button
              className="command-button"
              disabled={adding || selectedItems.size === 0}
              type="button"
              onClick={() => void addSelected()}
            >
              {adding ? 'Adding...' : `Add selected (${String(selectedItems.size)})`}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function collectionKey(ref: ZoteroCollectionRef): string {
  return `${ref.serverId}:${ref.library.type}:${ref.library.id}:${ref.collectionKey}`;
}
