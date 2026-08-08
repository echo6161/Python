import path from 'node:path';

import { app, BrowserWindow, ipcMain, session } from 'electron';

import { IPC_CHANNELS, type AppInfo, type DesktopPlatform } from '../shared/contracts/app';
import { createConsoleLogger } from '../shared/logging';
import { configureSessionSecurity, restrictWindowNavigation } from './security';
import { createWindowOptions } from './window-options';

const logger = createConsoleLogger('main');
let mainWindow: BrowserWindow | null = null;

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.appGetInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: getDesktopPlatform(),
  }));
}

function getDesktopPlatform(): DesktopPlatform {
  if (
    process.platform === 'darwin' ||
    process.platform === 'linux' ||
    process.platform === 'win32'
  ) {
    return process.platform;
  }

  throw new Error(`Unsupported desktop platform: ${process.platform}`);
}

async function createMainWindow(): Promise<void> {
  const preloadPath = path.join(__dirname, '../preload/index.js');
  const window = new BrowserWindow(createWindowOptions(preloadPath));
  mainWindow = window;

  restrictWindowNavigation(window.webContents);
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  const devServerUrl = process.env.PAPERMIND_DEV_SERVER_URL;
  if (devServerUrl) {
    await window.loadURL(devServerUrl);
    return;
  }

  await window.loadFile(path.join(__dirname, '../../renderer/index.html'));
}

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason);
});

void app.whenReady().then(async () => {
  configureSessionSecurity(session.defaultSession, app.isPackaged);
  registerIpcHandlers();
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
