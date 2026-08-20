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
import type { ResearchChatApi } from './research-chat';
import type { ResearchMemoryApi } from './research-memory';
import type { ResearchPlanApi } from './research-plan';
import type { ResearchAgentApi } from './research-agent';
import type { ExperimentApi } from './experiment';
import type { ResearchGraphApi } from './research-graph';
import type { CrossToolApi } from './cross-tool';

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
  readonly researchChat: ResearchChatApi;
  readonly researchMemory: ResearchMemoryApi;
  readonly researchPlan: ResearchPlanApi;
  readonly researchAgent: ResearchAgentApi;
  readonly experiment: ExperimentApi;
  readonly researchGraph: ResearchGraphApi;
  readonly crossTool: CrossToolApi;
}
