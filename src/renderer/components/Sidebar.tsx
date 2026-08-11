import { BookOpen, Library, Settings, Waypoints } from 'lucide-react';

export type AppView = 'library' | 'settings' | 'zotero';

interface SidebarProps {
  readonly activeView: AppView;
  readonly appVersion: string;
  readonly onNavigate: (view: AppView) => void;
}

const navigationItems: readonly {
  readonly icon: typeof Library;
  readonly label: string;
  readonly view: AppView;
}[] = [
  { icon: Library, label: 'Library', view: 'library' },
  { icon: Waypoints, label: 'Zotero Integration', view: 'zotero' },
  { icon: Settings, label: 'Settings', view: 'settings' },
];

export function Sidebar({ activeView, appVersion, onNavigate }: SidebarProps) {
  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-200">
      <div className="flex h-16 items-center gap-3 border-b border-zinc-800 px-5">
        <span className="flex size-8 items-center justify-center rounded-md bg-emerald-500 text-zinc-950">
          <BookOpen aria-hidden="true" className="size-5" />
        </span>
        <span className="text-base font-semibold text-white">PaperMind</span>
      </div>

      <nav aria-label="Primary" className="flex-1 space-y-1 px-3 py-4">
        {navigationItems.map(({ icon: Icon, label, view }) => {
          const isActive = activeView === view;
          return (
            <button
              key={view}
              aria-current={isActive ? 'page' : undefined}
              className={`flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${
                isActive
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
              }`}
              title={label}
              type="button"
              onClick={() => onNavigate(view)}
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-zinc-800 px-5 py-4 text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
          Local workspace
        </div>
        <p className="mt-2">v{appVersion}</p>
      </div>
    </aside>
  );
}
