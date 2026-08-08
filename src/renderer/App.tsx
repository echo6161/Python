import { useEffect, useState } from 'react';

import { LibraryWorkspace } from './components/LibraryWorkspace';
import { type AppView, Sidebar } from './components/Sidebar';
import { SettingsWorkspace } from './components/SettingsWorkspace';
import { rendererLogger } from './logger';

export function App() {
  const [activeView, setActiveView] = useState<AppView>('library');
  const [appVersion, setAppVersion] = useState('0.1.0');

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

  return (
    <div className="flex h-screen min-h-[680px] min-w-[1100px] overflow-hidden bg-zinc-100 text-zinc-900">
      <Sidebar activeView={activeView} appVersion={appVersion} onNavigate={setActiveView} />
      {activeView === 'library' ? <LibraryWorkspace /> : <SettingsWorkspace />}
    </div>
  );
}
