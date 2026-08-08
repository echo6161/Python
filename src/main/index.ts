import path from 'node:path';

import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';

import { IPC_CHANNELS, type AppInfo, type DesktopPlatform } from '../shared/contracts/app';
import { createConsoleLogger } from '../shared/logging';
import { DatabaseWorkerClient } from './database/database-worker-client';
import { registerLibraryIpcHandlers } from './ipc/library-ipc';
import { PaperFileStorage } from './library/file-storage';
import { getDefaultLibraryRoot, initializeLibraryPaths } from './library/library-paths';
import { PaperLibraryService } from './library/paper-library-service';
import { configureSessionSecurity, restrictWindowNavigation } from './security';
import { createWindowOptions } from './window-options';

const logger = createConsoleLogger('main');
let mainWindow: BrowserWindow | null = null;
let databaseClient: DatabaseWorkerClient | null = null;
let shutdownPromise: Promise<void> | null = null;

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.appGetInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: getDesktopPlatform(),
  }));
}

async function initializeLibrary(): Promise<void> {
  const testRoot = process.env.NODE_ENV === 'test' ? process.env.PAPERMIND_LIBRARY_ROOT : undefined;
  const libraryRoot = testRoot ?? getDefaultLibraryRoot(app.getPath('documents'));
  const libraryPaths = await initializeLibraryPaths(libraryRoot);
  const workerPath = path.join(__dirname, 'database/worker.js');
  databaseClient = new DatabaseWorkerClient(workerPath, libraryPaths.database);
  const library = new PaperLibraryService(
    databaseClient,
    new PaperFileStorage(libraryPaths),
    libraryPaths,
  );
  registerLibraryIpcHandlers(library, () => mainWindow);
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

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void app
    .whenReady()
    .then(async () => {
      configureSessionSecurity(session.defaultSession, app.isPackaged);
      registerIpcHandlers();
      await initializeLibrary();
      await createMainWindow();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          void createMainWindow();
        }
      });
    })
    .catch((error: unknown) => {
      logger.error('Application startup failed', error);
      dialog.showErrorBox(
        'PaperMind could not start',
        'The local paper library could not be initialized. No source files were changed.',
      );
      app.quit();
    });
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

app.on('before-quit', (event) => {
  if (!databaseClient) {
    return;
  }

  event.preventDefault();
  if (!shutdownPromise) {
    const client = databaseClient;
    shutdownPromise = client
      .close()
      .catch((error: unknown) => {
        logger.error('Database shutdown failed', error);
      })
      .finally(() => {
        databaseClient = null;
        app.quit();
      });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
