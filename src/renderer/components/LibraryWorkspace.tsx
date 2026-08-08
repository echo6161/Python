import { BookOpenText, FileText, Search, Send, Sparkles } from 'lucide-react';

export function LibraryWorkspace() {
  return (
    <section className="grid min-w-0 flex-1 grid-cols-[minmax(220px,280px)_minmax(400px,1fr)_minmax(280px,320px)] bg-white">
      <section aria-labelledby="library-heading" className="min-w-0 border-r border-zinc-200">
        <header className="border-b border-zinc-200 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="library-heading" className="text-sm font-semibold text-zinc-900">
              All papers
            </h2>
            <span className="text-xs tabular-nums text-zinc-500">0 papers</span>
          </div>
          <label className="mt-4 flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 text-zinc-500 focus-within:border-emerald-600">
            <Search aria-hidden="true" className="size-4 shrink-0" />
            <span className="sr-only">Search library</span>
            <input
              className="min-w-0 flex-1 bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
              placeholder="Search library"
              type="search"
            />
          </label>
        </header>

        <div className="flex h-[calc(100vh-8.1rem)] items-center justify-center p-6 text-center">
          <div>
            <span className="mx-auto flex size-10 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-500">
              <FileText aria-hidden="true" className="size-5" />
            </span>
            <p className="mt-3 text-sm font-medium text-zinc-800">Library is empty</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="reader-heading" className="flex min-w-0 flex-col bg-zinc-100">
        <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-5">
          <h2 id="reader-heading" className="text-sm font-semibold text-zinc-900">
            Reader
          </h2>
          <span className="text-xs text-zinc-400">No document selected</span>
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center">
          <div>
            <BookOpenText aria-hidden="true" className="mx-auto size-10 text-zinc-300" />
            <p className="mt-4 text-sm font-medium text-zinc-700">Select a paper</p>
          </div>
        </div>
      </section>

      <aside
        aria-labelledby="assistant-heading"
        className="flex min-w-0 flex-col border-l border-zinc-200 bg-white"
      >
        <header className="flex h-14 items-center justify-between border-b border-zinc-200 px-5">
          <div className="flex items-center gap-2">
            <Sparkles aria-hidden="true" className="size-4 text-emerald-700" />
            <h2 id="assistant-heading" className="text-sm font-semibold text-zinc-900">
              Assistant
            </h2>
          </div>
          <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
            Offline
          </span>
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
          <p className="text-sm text-zinc-500">No active paper</p>
        </div>
        <div className="border-t border-zinc-200 p-4">
          <div className="flex min-h-11 items-end gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-2">
            <span className="min-w-0 flex-1 px-1 py-1 text-sm text-zinc-400">
              Ask about this paper
            </span>
            <button
              aria-label="Send message"
              className="flex size-8 shrink-0 items-center justify-center rounded-md bg-zinc-200 text-zinc-400"
              disabled
              title="Send message"
              type="button"
            >
              <Send aria-hidden="true" className="size-4" />
            </button>
          </div>
        </div>
      </aside>
    </section>
  );
}
