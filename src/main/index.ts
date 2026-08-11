import path from 'node:path';

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  safeStorage,
  session,
  shell,
} from 'electron';

import { IPC_CHANNELS, type AppInfo, type DesktopPlatform } from '../shared/contracts/app';
import { createConsoleLogger } from '../shared/logging';
import { DatabaseWorkerClient } from './database/database-worker-client';
import { AiAssistantService } from './ai/ai-assistant-service';
import { AiSecretStore } from './ai/secret-store';
import { registerAiIpcHandlers } from './ipc/ai-ipc';
import { registerLibraryIpcHandlers } from './ipc/library-ipc';
import { registerReaderIpcHandlers } from './ipc/reader-ipc';
import { registerRepositoryIpcHandlers } from './ipc/repository-ipc';
import { registerCodeIntelligenceIpcHandlers } from './ipc/code-intelligence-ipc';
import { registerWorkspaceIpcHandlers } from './ipc/workspace-ipc';
import { registerQuestionIpcHandlers } from './ipc/question-ipc';
import { registerZoteroIpcHandlers } from './ipc/zotero-ipc';
import { PaperFileStorage } from './library/file-storage';
import { getDefaultLibraryRoot, initializeLibraryPaths } from './library/library-paths';
import { PaperLibraryService } from './library/paper-library-service';
import { PdfMetadataExtractionClient } from './metadata/pdf-metadata-extraction-client';
import { PaperReaderService } from './reader/paper-reader-service';
import { GitRepositoryClient } from './repository/git-repository-client';
import { RepositoryFileService } from './repository/repository-file-service';
import { RepositoryService } from './repository/repository-service';
import { RepositoryVscodeLauncher } from './repository/repository-vscode-launcher';
import { CodeIndexScanner } from './code-intelligence/code-index-scanner';
import { CodeParserClient } from './code-intelligence/code-parser-client';
import { CodeIntelligenceService } from './code-intelligence/code-intelligence-service';
import { registerPdfProtocol } from './reader/pdf-protocol';
import { configureSessionSecurity, restrictWindowNavigation } from './security';
import { createWindowOptions } from './window-options';
import { WorkspaceService } from './workspace/workspace-service';
import { ZoteroBridgeService } from './zotero/zotero-bridge-service';
import { ZoteroLocalApiClient } from './zotero/zotero-local-api-client';
import { QuestionService } from './question/question-service';
import { ZoteroEvidenceLauncher } from './question/zotero-evidence-launcher';

const logger = createConsoleLogger('main');
let mainWindow: BrowserWindow | null = null;
let databaseClient: DatabaseWorkerClient | null = null;
let metadataExtractionClient: PdfMetadataExtractionClient | null = null;
let metadataBackfillPromise: Promise<void> | null = null;
let aiAssistant: AiAssistantService | null = null;
let shutdownPromise: Promise<void> | null = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'papermind-pdf',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

if (process.env.NODE_ENV === 'test' && process.env.PAPERMIND_USER_DATA_ROOT) {
  app.setPath('userData', path.resolve(process.env.PAPERMIND_USER_DATA_ROOT));
}

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
  const secrets = new AiSecretStore({
    userDataPath: app.getPath('userData'),
    safeStorage,
  });
  aiAssistant = new AiAssistantService(databaseClient, secrets, {
    useMockProvider:
      !app.isPackaged &&
      process.env.NODE_ENV === 'test' &&
      process.env.PAPERMIND_AI_PROVIDER === 'mock',
    mockProviderOptions: {
      delayMs: Number(process.env.PAPERMIND_AI_MOCK_DELAY_MS ?? 15),
    },
  });
  await aiAssistant.initialize();
  const metadataWorkerPath = path.join(__dirname, 'metadata/pdf-metadata-extraction-worker.js');
  metadataExtractionClient = new PdfMetadataExtractionClient(metadataWorkerPath);
  const storage = new PaperFileStorage(libraryPaths);
  const library = new PaperLibraryService(
    databaseClient,
    storage,
    libraryPaths,
    metadataExtractionClient,
  );
  const reader = new PaperReaderService(databaseClient, storage);
  registerLibraryIpcHandlers(library, () => mainWindow);
  registerReaderIpcHandlers(reader, () => mainWindow);
  registerAiIpcHandlers(aiAssistant, () => mainWindow);
  const zoteroBridge = new ZoteroBridgeService(new ZoteroLocalApiClient());
  registerZoteroIpcHandlers(zoteroBridge);
  registerWorkspaceIpcHandlers(new WorkspaceService(databaseClient.workspace, zoteroBridge));
  const gitRepositories = new GitRepositoryClient();
  const repositoryFiles = new RepositoryFileService(gitRepositories);
  const repositoryService = new RepositoryService(
    databaseClient.repository,
    gitRepositories,
    repositoryFiles,
    {
      chooseDirectory: async () => {
        const owner = mainWindow;
        const result = owner
          ? await dialog.showOpenDialog(owner, {
              title: 'Select Git repository or source folder',
              properties: ['openDirectory'],
            })
          : await dialog.showOpenDialog({
              title: 'Select Git repository or source folder',
              properties: ['openDirectory'],
            });
        return result.canceled ? null : (result.filePaths[0] ?? null);
      },
    },
    new RepositoryVscodeLauncher(shell),
  );
  registerRepositoryIpcHandlers(repositoryService);
  const codeIntelligence = new CodeIntelligenceService(
    databaseClient.codeIndex,
    databaseClient.repository,
    new CodeIndexScanner(repositoryFiles, gitRepositories),
    new CodeParserClient(path.join(__dirname, 'code-intelligence/code-parser-worker.js')),
  );
  await codeIntelligence.initialize();
  registerCodeIntelligenceIpcHandlers(codeIntelligence);
  registerQuestionIpcHandlers(
    new QuestionService(
      databaseClient.question,
      zoteroBridge,
      databaseClient.repository,
      codeIntelligence,
      repositoryService,
      new ZoteroEvidenceLauncher(shell),
    ),
  );
  registerPdfProtocol(session.defaultSession, reader);
  metadataBackfillPromise = library
    .backfillPendingPaperTextExtractions()
    .catch((error: unknown) => {
      logger.error('Pending PDF text extraction backfill failed', error);
    });
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
  const windowOwnerId = window.webContents.id;

  restrictWindowNavigation(window.webContents);
  window.webContents.once('destroyed', () => {
    aiAssistant?.cancelOwnerRequests(windowOwnerId);
  });
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
  if (!databaseClient && !metadataExtractionClient && !aiAssistant) {
    return;
  }

  event.preventDefault();
  if (!shutdownPromise) {
    const database = databaseClient;
    const metadata = metadataExtractionClient;
    const backfill = metadataBackfillPromise;
    shutdownPromise = Promise.resolve()
      .then(async () => {
        await metadata?.close();
        await backfill;
        await aiAssistant?.shutdown();
        await database?.close();
      })
      .catch((error: unknown) => {
        logger.error('Application services could not shut down cleanly', error);
      })
      .finally(() => {
        databaseClient = null;
        metadataExtractionClient = null;
        metadataBackfillPromise = null;
        aiAssistant = null;
        app.quit();
      });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
