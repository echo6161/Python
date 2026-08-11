import type { LibraryApi } from './library';
import type { ReaderApi } from './reader';
import type { RepositoryApi } from './repository';
import type { AiApi } from './ai';
import type { ZoteroApi } from './zotero';
import type { WorkspaceApi } from './workspace';

export const IPC_CHANNELS = Object.freeze({
  appGetInfo: 'app:get-info',
});

export type AppGetInfoChannel = (typeof IPC_CHANNELS)['appGetInfo'];
export type DesktopPlatform = 'darwin' | 'linux' | 'win32';

export interface AppInfo {
  readonly name: string;
  readonly version: string;
  readonly platform: DesktopPlatform;
}

export interface PaperMindApi {
  readonly app: {
    getInfo(): Promise<AppInfo>;
  };
  readonly library: LibraryApi;
  readonly reader: ReaderApi;
  readonly repository: RepositoryApi;
  readonly ai: AiApi;
  readonly zotero: ZoteroApi;
  readonly workspace: WorkspaceApi;
}
