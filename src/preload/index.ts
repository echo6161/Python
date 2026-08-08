import { contextBridge, ipcRenderer } from 'electron';

import type { AppGetInfoChannel, AppInfo, PaperMindApi } from '../shared/contracts/app';

// Sandboxed preloads cannot load arbitrary local modules at runtime.
const APP_GET_INFO_CHANNEL: AppGetInfoChannel = 'app:get-info';

const api: PaperMindApi = Object.freeze({
  app: Object.freeze({
    getInfo: () => ipcRenderer.invoke(APP_GET_INFO_CHANNEL) as Promise<AppInfo>,
  }),
});

contextBridge.exposeInMainWorld('paperMind', api);
