import { BookOpen, FolderKanban, Library, Settings, Waypoints } from 'lucide-react';

export type AppView = 'library' | 'settings' | 'workspace' | 'zotero';

interface SidebarProps {
  readonly activeView: AppView;
  readonly appVersion: string | null;
  readonly onNavigate: (view: AppView) => void;
}

const navigationItems: readonly {
  readonly icon: typeof Library;
  readonly label: string;
  readonly view: AppView;
}[] = [
  { icon: FolderKanban, label: 'Workspace', view: 'workspace' },
  { icon: Library, label: 'Legacy Library', view: 'library' },
  { icon: Waypoints, label: 'Zotero Browser', view: 'zotero' },
  { icon: Settings, label: 'Settings', view: 'settings' },
];

export function Sidebar({ activeView, appVersion, onNavigate }: SidebarProps) {
  return (
    <aside className="app-sidebar flex h-screen w-56 shrink-0 flex-col border-r">
      <div className="flex h-16 items-center gap-3 border-b border-zinc-800 px-5">
        <span className="app-sidebar-brand-mark flex size-8 items-center justify-center rounded-md">
          <BookOpen aria-hidden="true" className="size-5" />
        </span>
        <span className="app-sidebar-brand-name text-base font-semibold">PaperMind</span>
      </div>

      <nav aria-label="Primary" className="flex-1 space-y-1 px-3 py-4">
        {navigationItems.map(({ icon: Icon, label, view }) => {
          const isActive = activeView === view;
          return (
            <button
              key={view}
              aria-current={isActive ? 'page' : undefined}
              className={`app-sidebar-link flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition-colors ${isActive ? 'is-active' : ''}`}
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
          Local first
        </div>
        <p className="mt-2">{appVersion ? `v${appVersion}` : 'Version unavailable'}</p>
      </div>
    </aside>
  );
}
