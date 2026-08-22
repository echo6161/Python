import { useEffect, useState } from 'react';

import { LibraryWorkspace } from './components/LibraryWorkspace';
import { type AppView, Sidebar } from './components/Sidebar';
import { SettingsWorkspace } from './components/SettingsWorkspace';
import { ZoteroIntegration } from './components/ZoteroIntegration';
import { WorkspaceView } from './components/workspace/WorkspaceView';
import { rendererLogger } from './logger';

export function App() {
  const [activeView, setActiveView] = useState<AppView>('workspace');
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [hasUnsavedPaperDetails, setHasUnsavedPaperDetails] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void window.paperMind.app
      .getInfo()
      .then((info) => {
        if (isMounted) {
          setAppVersion(info.version);
        }
      })
      .catch((error: unknown) => {
        rendererLogger.error('Unable to load application information', error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const navigate = (view: AppView) => {
    if (
      view !== activeView &&
      hasUnsavedPaperDetails &&
      !window.confirm('Discard unsaved paper detail changes?')
    ) {
      return;
    }
    setHasUnsavedPaperDetails(false);
    setActiveView(view);
  };

  if (activeView === 'workspace') {
    return <WorkspaceView appVersion={appVersion ?? undefined} onNavigateApp={navigate} />;
  }

  return (
    <div className="app-shell flex h-screen min-h-[680px] min-w-0 overflow-hidden">
      <Sidebar activeView={activeView} appVersion={appVersion} onNavigate={navigate} />
      {activeView === 'library' ? (
        <LibraryWorkspace
          onDirtyChange={setHasUnsavedPaperDetails}
          onOpenSettings={() => navigate('settings')}
        />
      ) : activeView === 'zotero' ? (
        <ZoteroIntegration />
      ) : (
        <SettingsWorkspace />
      )}
    </div>
  );
}
