import type { LibraryApi } from './library';
import type { ReaderApi } from './reader';
import type { RepositoryApi } from './repository';
import type { CodeIntelligenceApi } from './code-intelligence';
import type { AiApi } from './ai';
import type { ZoteroApi } from './zotero';
import type { WorkspaceApi } from './workspace';
import type { QuestionApi } from './question';
import type { PaperCodeLinkApi } from './paper-code-link';
import type { KnowledgeApi } from './knowledge';

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
  readonly codeIntelligence: CodeIntelligenceApi;
  readonly app: {
    getInfo(): Promise<AppInfo>;
  };
  readonly library: LibraryApi;
  readonly reader: ReaderApi;
  readonly repository: RepositoryApi;
  readonly ai: AiApi;
  readonly zotero: ZoteroApi;
  readonly workspace: WorkspaceApi;
  readonly question: QuestionApi;
  readonly paperCodeLink: PaperCodeLinkApi;
  readonly knowledge: KnowledgeApi;
}
