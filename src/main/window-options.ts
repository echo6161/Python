import type { BrowserWindowConstructorOptions } from 'electron';

export function createWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    title: 'PaperMind',
    backgroundColor: '#f4f6f5',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  };
}
