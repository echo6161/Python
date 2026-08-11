import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { ChevronLeft, ChevronRight, FileText, RefreshCw, Search, X } from 'lucide-react';

import type {
  ZoteroAttachment,
  ZoteroConnectionStatus,
  ZoteroItemDetails,
  ZoteroItemPage,
  ZoteroItemSummary,
  ZoteroPdfAvailability,
} from '../../shared/contracts/zotero';
import { rendererLogger } from '../logger';

const PAGE_SIZE = 20;

export function ZoteroIntegration() {
  const [status, setStatus] = useState<ZoteroConnectionStatus | null>(null);
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [page, setPage] = useState<ZoteroItemPage | null>(null);
  const [selected, setSelected] = useState<ZoteroItemDetails | null>(null);
  const [attachments, setAttachments] = useState<readonly ZoteroAttachment[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRequestId = useRef<string | null>(null);

  const cancelActiveRequest = useCallback(async () => {
    const requestId = activeRequestId.current;
    if (!requestId) return;
    try {
      await window.paperMind.zotero.cancelRequest(requestId);
    } catch (caught) {
      rendererLogger.error('Unable to cancel Zotero request', caught);
    }
  }, []);

  const refresh = useCallback(async () => {
    await cancelActiveRequest();
    setIsDetecting(true);
    setError(null);
    try {
      const result = await window.paperMind.zotero.detectZotero();
      if (!result.ok) {
        setStatus(null);
        setError(result.error.message);
        return;
      }
      setStatus(result.value);
      if (!result.value.available) {
        setPage(null);
        setSelected(null);
        setAttachments([]);
      }
    } catch (caught) {
      rendererLogger.error('Unable to detect Zotero', caught);
      setStatus(null);
      setError('PaperMind could not check Zotero status.');
    } finally {
      setIsDetecting(false);
    }
  }, [cancelActiveRequest]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(
    () => () => {
      void cancelActiveRequest();
    },
    [cancelActiveRequest],
  );

  const loadPage = async (start: number, requestedQuery: string) => {
    const requestId = crypto.randomUUID();
    activeRequestId.current = requestId;
    setIsSearching(true);
    setError(null);
    setSelected(null);
    setAttachments([]);
    try {
      const input = { requestId, start, limit: PAGE_SIZE };
      const result = requestedQuery
        ? await window.paperMind.zotero.searchItems({ ...input, query: requestedQuery })
        : await window.paperMind.zotero.listItems(input);
      if (activeRequestId.current !== requestId) return;
      if (!result.ok) {
        setPage(null);
        setError(result.error.message);
        return;
      }
      setPage(result.value);
    } catch (caught) {
      if (activeRequestId.current !== requestId) return;
      rendererLogger.error('Unable to search Zotero', caught);
      setPage(null);
      setError('PaperMind could not search Zotero.');
    } finally {
      if (activeRequestId.current === requestId) {
        activeRequestId.current = null;
        setIsSearching(false);
      }
    }
  };

  const search = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!status?.available) return;
    const normalizedQuery = query.trim();
    setActiveQuery(normalizedQuery);
    void loadPage(0, normalizedQuery);
  };

  const openItem = async (item: ZoteroItemSummary) => {
    setError(null);
    setIsLoadingDetails(true);
    try {
      const [itemResult, attachmentResult] = await Promise.all([
        window.paperMind.zotero.getItem(item.ref),
        window.paperMind.zotero.listAttachments(item.ref),
      ]);
      if (!itemResult.ok) {
        setError(itemResult.error.message);
        return;
      }
      if (!attachmentResult.ok) {
        setError(attachmentResult.error.message);
        return;
      }
      setSelected(itemResult.value);
      setAttachments(attachmentResult.value);
    } catch (caught) {
      rendererLogger.error('Unable to load Zotero item', caught);
      setError('PaperMind could not load the Zotero item.');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const connected = status?.available === true;
  const statusLabel = connected
    ? 'Connected'
    : status?.error?.code === 'not_running'
      ? 'Not Running'
      : 'Unavailable';
  const items = page?.items ?? [];
  const pageStart = page && page.items.length > 0 ? page.start + 1 : 0;
  const pageEnd = page ? page.start + page.items.length : 0;

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 px-6">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-zinc-950">Zotero Integration</h1>
          <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-zinc-400'}`}
            />
            <span data-testid="zotero-status">Status: {statusLabel}</span>
            {status && connected && status.apiVersion !== null ? (
              <span>API v{status.apiVersion}</span>
            ) : null}
          </div>
        </div>
        <button
          className="command-button"
          disabled={isDetecting}
          type="button"
          onClick={() => void refresh()}
        >
          <RefreshCw aria-hidden="true" className={`size-4 ${isDetecting ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      <form
        className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-200 px-6"
        onSubmit={search}
      >
        <label className="sr-only" htmlFor="zotero-search">
          Search Zotero
        </label>
        <div className="relative max-w-2xl flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400"
          />
          <input
            id="zotero-search"
            className="h-9 w-full rounded border border-zinc-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            maxLength={500}
            placeholder="Title, creator, or year"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {isSearching ? (
          <button
            aria-label="Cancel Zotero request"
            className="icon-button"
            title="Cancel Zotero request"
            type="button"
            onClick={() => void cancelActiveRequest()}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
        <button className="command-button" disabled={!connected || isSearching} type="submit">
          <Search aria-hidden="true" className="size-4" />
          Search Zotero
        </button>
      </form>

      {error || status?.error ? (
        <div
          className="border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-800"
          role="alert"
        >
          {error ?? status?.error?.message}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(420px,45%)_minmax(0,1fr)]">
        <section
          aria-labelledby="zotero-results-heading"
          className="flex min-w-0 flex-col border-r border-zinc-200"
        >
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-zinc-200 bg-zinc-50 px-5">
            <h2
              id="zotero-results-heading"
              className="text-xs font-semibold uppercase text-zinc-600"
            >
              Results
            </h2>
            <span className="text-xs text-zinc-500">
              {page?.total === null || page?.total === undefined
                ? `${String(pageStart)}-${String(pageEnd)}`
                : `${String(pageStart)}-${String(pageEnd)} of ${String(page.total)}`}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-zinc-500">
                {isSearching
                  ? 'Searching Zotero...'
                  : page
                    ? 'No matching Zotero items.'
                    : 'No Zotero items loaded.'}
              </div>
            ) : (
              <ul aria-label="Zotero items" className="divide-y divide-zinc-200">
                {items.map((item) => (
                  <li
                    key={`${item.ref.serverId}:${item.ref.library.type}:${item.ref.library.id}:${item.ref.itemKey}`}
                  >
                    <button
                      className="grid w-full grid-cols-[minmax(0,1fr)_110px] gap-4 px-5 py-4 text-left hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-emerald-600"
                      type="button"
                      onClick={() => void openItem(item)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-zinc-950">
                          {item.title || 'Untitled'}
                        </span>
                        <span className="mt-1 block truncate text-xs text-zinc-500">
                          {creatorNames(item) || 'No creators'}
                        </span>
                        <span className="mt-1 block text-xs text-zinc-500">
                          {item.year ?? item.date ?? 'No date'} | {formatItemType(item.itemType)}
                        </span>
                      </span>
                      <PdfStatus pdf={item.pdf} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex h-12 shrink-0 items-center justify-between border-t border-zinc-200 px-4">
            <button
              aria-label="Previous Zotero page"
              className="icon-button"
              disabled={!page || page.start === 0 || isSearching}
              title="Previous page"
              type="button"
              onClick={() =>
                page && void loadPage(Math.max(0, page.start - page.limit), activeQuery)
              }
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>
            <span className="text-xs text-zinc-500">
              {page ? `Page ${String(Math.floor(page.start / page.limit) + 1)}` : 'Page 0'}
            </span>
            <button
              aria-label="Next Zotero page"
              className="icon-button"
              disabled={!page?.hasNext || isSearching}
              title="Next page"
              type="button"
              onClick={() => page && void loadPage(page.start + page.limit, activeQuery)}
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </div>
        </section>

        <section
          aria-labelledby="zotero-metadata-heading"
          className="min-w-0 overflow-y-auto px-7 py-6"
        >
          <h2
            id="zotero-metadata-heading"
            className="text-xs font-semibold uppercase text-zinc-600"
          >
            Metadata
          </h2>
          {selected ? (
            <div className="mt-5 max-w-3xl">
              <h3 className="text-xl font-semibold text-zinc-950">
                {selected.title || 'Untitled'}
              </h3>
              <p className="mt-2 text-sm text-zinc-600">
                {creatorNames(selected) || 'No creators'}
              </p>
              <dl className="mt-6 grid grid-cols-[130px_minmax(0,1fr)] gap-x-5 gap-y-3 text-sm">
                <MetadataRow label="Type" value={formatItemType(selected.itemType)} />
                <MetadataRow label="Date" value={selected.date} />
                <MetadataRow label="Publication" value={selected.publication} />
                <MetadataRow label="DOI" value={selected.doi} />
                <MetadataRow label="URL" value={selected.url} />
                <MetadataRow label="PDF" value={pdfLabel(selected.pdf)} />
                <MetadataRow
                  label="Tags"
                  value={selected.tags.length > 0 ? selected.tags.join(', ') : null}
                />
              </dl>
              <div className="mt-7 border-t border-zinc-200 pt-5">
                <h4 className="text-xs font-semibold uppercase text-zinc-600">Attachments</h4>
                {attachments.length > 0 ? (
                  <ul aria-label="Zotero attachments" className="mt-3 divide-y divide-zinc-200">
                    {attachments.map((attachment) => (
                      <li
                        className="flex items-center justify-between gap-4 py-3 text-sm"
                        key={attachment.ref.itemKey}
                      >
                        <span className="min-w-0 truncate text-zinc-800">
                          {[attachment.title, attachment.filename].find(Boolean) ??
                            'Untitled attachment'}
                        </span>
                        <span className="shrink-0 text-xs text-zinc-500">
                          {attachment.isPdf
                            ? pdfLabel(attachment.pdf)
                            : (attachment.contentType ?? 'Attachment')}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-zinc-500">No attachments.</p>
                )}
              </div>
              <div className="mt-7 border-t border-zinc-200 pt-5">
                <h4 className="text-xs font-semibold uppercase text-zinc-600">Abstract</h4>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                  {selected.abstract ?? 'Not available'}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-8 text-sm text-zinc-500">
              {isLoadingDetails ? 'Loading metadata...' : 'No item selected.'}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function MetadataRow({ label, value }: { readonly label: string; readonly value: string | null }) {
  return (
    <>
      <dt className="font-medium text-zinc-500">{label}</dt>
      <dd className="min-w-0 break-words text-zinc-900">{value ?? 'Not available'}</dd>
    </>
  );
}

function PdfStatus({ pdf }: { readonly pdf: ZoteroPdfAvailability }) {
  return (
    <span className="flex min-w-0 items-center justify-end gap-1.5 text-xs text-zinc-600">
      <FileText aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{pdfLabel(pdf)}</span>
    </span>
  );
}

function creatorNames(item: ZoteroItemSummary): string {
  return item.creators.map(({ name }) => name).join(', ');
}

function pdfLabel(pdf: ZoteroPdfAvailability): string {
  if (!pdf.hasPdf) return 'No PDF';
  const mode = pdf.storageMode === 'linked' ? 'Linked' : 'Stored';
  if (pdf.state === 'available') return `${mode} PDF`;
  if (pdf.state === 'not_local') return `${mode} PDF | Not local`;
  return `${mode} PDF | Missing`;
}

function formatItemType(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/gu, '$1 $2')
    .replace(/^./u, (letter) => letter.toUpperCase());
}
