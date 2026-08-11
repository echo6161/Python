import { useEffect, useState } from 'react';

import { LibraryWorkspace } from './components/LibraryWorkspace';
import { type AppView, Sidebar } from './components/Sidebar';
import { SettingsWorkspace } from './components/SettingsWorkspace';
import { ZoteroIntegration } from './components/ZoteroIntegration';
import { rendererLogger } from './logger';

export function App() {
  const [activeView, setActiveView] = useState<AppView>('library');
  const [appVersion, setAppVersion] = useState('0.1.0');
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

  return (
    <div className="flex h-screen min-h-[680px] min-w-[1100px] overflow-hidden bg-zinc-100 text-zinc-900">
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
