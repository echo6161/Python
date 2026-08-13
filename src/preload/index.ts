import { contextBridge, ipcRenderer, webUtils } from 'electron';

import type { AppGetInfoChannel, AppInfo, PaperMindApi } from '../shared/contracts/app';
import type {
  CodeFileSearchResult,
  CodeIndexCancelResult,
  CodeIndexProgress,
  CodeIndexStatus,
  CodeIntelligenceIpcChannels,
  CodeSearchInput,
  CodeSearchPage,
  CodeSymbolSearchResult,
  CodeTextSearchResult,
  RunCodeIndexInput,
} from '../shared/contracts/code-intelligence';
import type {
  AiCapabilities,
  AiCodexLoginResult,
  AiChatGptBridgeInput,
  AiChatGptBridgeResult,
  AiConversation,
  AiCredentialState,
  AiIpcChannels,
  AiStreamEvent,
  AiTaskAccepted,
  AiTaskInput,
  AiProviderSettings,
  AiProviderId,
} from '../shared/contracts/ai';
import type {
  ApiResult,
  BatchPaperUpdate,
  BatchPaperUpdateResult,
  Collection,
  CreateCollectionInput,
  CreateTagInput,
  DeleteOrganizationItemInput,
  LibraryIpcChannels,
  LibraryOrganization,
  PaperDetails,
  PaperDetailsUpdate,
  PaperImportBatch,
  PaperListQuery,
  PaperListResult,
  PaperMetadataUpdate,
  PaperOrganizationUpdate,
  PaperRemovalRequest,
  PaperRemovalResult,
  Tag,
} from '../shared/contracts/library';
import type {
  Annotation,
  AnnotationExportRequest,
  AnnotationExportResult,
  CreateAnnotationInput,
  DeleteAnnotationInput,
  PdfAccess,
  ReaderIpcChannels,
  ReadingState,
  SaveReadingStateInput,
  UpdateAnnotationInput,
} from '../shared/contracts/reader';
import type {
  DeleteRepositoryRefInput,
  OpenRepositoryInVscodeInput,
  RepositoryCancelResult,
  RepositoryIpcChannels,
  RepositoryRef,
  RepositorySourceFile,
  RepositorySourceRequest,
  RepositoryTreePage,
  RepositoryTreeRequest,
  WorkspaceRepositoryInput,
  WorkspaceRepositoryRef,
} from '../shared/contracts/repository';
import type {
  ZoteroAttachment,
  ZoteroCancelResult,
  ZoteroCollection,
  ZoteroCollectionRef,
  ZoteroConnectionStatus,
  ZoteroIpcChannels,
  ZoteroItemDetails,
  ZoteroItemPage,
  ZoteroItemRef,
  ZoteroItemSummary,
  ZoteroPageRequest,
  ZoteroPdfAvailability,
  ZoteroSearchRequest,
} from '../shared/contracts/zotero';
import type {
  CreateWorkspaceInput,
  DeleteWorkspaceInput,
  SetLastActiveWorkspaceInput,
  SetWorkspaceStatusInput,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceIpcChannels,
  WorkspaceZoteroPaper,
  WorkspaceZoteroPaperInput,
} from '../shared/contracts/workspace';
import type {
  AddCodeEvidenceInput,
  AddZoteroEvidenceInput,
  ArchiveResearchQuestionInput,
  CreateResearchQuestionInput,
  EvidenceIdentityInput,
  OpenEvidenceResult,
  QuestionIpcChannels,
  ReorderEvidenceInput,
  ResearchQuestion,
  ResearchQuestionDetails,
  SetResearchQuestionStatusInput,
  UpdateResearchQuestionInput,
} from '../shared/contracts/question';
import type {
  CreatePaperCodeLinkInput,
  PaperCodeLink,
  PaperCodeLinkCodeQuery,
  PaperCodeLinkIdentityInput,
  PaperCodeLinkIpcChannels,
  PaperCodeLinkNavigationResult,
  PaperCodeLinkPaperQuery,
  UpdatePaperCodeLinkInput,
} from '../shared/contracts/paper-code-link';
import type {
  KnowledgeIndexCancelResult,
  KnowledgeIndexProgress,
  KnowledgeIndexStatus,
  KnowledgeIpcChannels,
  KnowledgeSearchInput,
  KnowledgeSearchPage,
  OpenKnowledgeResult,
  OpenKnowledgeResultInput,
  RemoveKnowledgeIndexInput,
  RunKnowledgeIndexInput,
} from '../shared/contracts/knowledge';
import type {
  OpenResearchChatCitationInput,
  PrepareResearchChatContextInput,
  ResearchChatContextPreview,
  ResearchChatConversation,
  ResearchChatIpcChannels,
  ResearchChatStreamEvent,
  ResearchChatTurnAccepted,
  RetryResearchChatTurnInput,
  StartResearchChatTurnInput,
} from '../shared/contracts/research-chat';

// Sandboxed preloads cannot load arbitrary local modules at runtime.
const APP_GET_INFO_CHANNEL: AppGetInfoChannel = 'app:get-info';
const CODE_INTELLIGENCE_CHANNELS = {
  getStatus: 'code-intelligence:get-status',
  runIndex: 'code-intelligence:run-index',
  cancelIndex: 'code-intelligence:cancel-index',
  searchFiles: 'code-intelligence:search-files',
  searchSymbols: 'code-intelligence:search-symbols',
  searchText: 'code-intelligence:search-text',
  progress: 'events:code-intelligence-progress',
} satisfies CodeIntelligenceIpcChannels;
const LIBRARY_CHANNELS = {
  chooseAndImportPdfs: 'dialog:choose-pdfs',
  importDroppedPdfs: 'papers:import-dropped',
  listPapers: 'papers:list',
  getPaper: 'papers:get',
  updatePaperDetails: 'papers:update-details',
  updatePaperMetadata: 'papers:update-metadata',
  updatePaperOrganization: 'papers:update-organization',
  batchUpdatePapers: 'papers:batch-update',
  listOrganization: 'library:list-organization',
  createTag: 'tags:create',
  deleteTag: 'tags:delete',
  createCollection: 'collections:create',
  deleteCollection: 'collections:delete',
  removePaper: 'papers:remove',
} satisfies LibraryIpcChannels;
const READER_CHANNELS = {
  getPdfAccess: 'papers:get-pdf-access',
  getReadingState: 'reader:get-state',
  saveReadingState: 'reader:save-state',
  listAnnotations: 'annotations:list',
  createAnnotation: 'annotations:create',
  updateAnnotation: 'annotations:update',
  deleteAnnotation: 'annotations:delete',
  exportAnnotations: 'annotations:export',
} satisfies ReaderIpcChannels;
const REPOSITORY_CHANNELS = {
  chooseAndLink: 'repositories:choose-and-link',
  listForWorkspace: 'repositories:list-for-workspace',
  removeFromWorkspace: 'repositories:remove-from-workspace',
  deleteReference: 'repositories:delete-reference',
  refresh: 'repositories:refresh',
  listTree: 'repositories:list-tree',
  readSource: 'repositories:read-source',
  openInVscode: 'repositories:open-in-vscode',
  cancelRequest: 'repositories:cancel-request',
} satisfies RepositoryIpcChannels;
const AI_CHANNELS = {
  getCapabilities: 'ai:get-capabilities',
  refreshProviders: 'ai:refresh-providers',
  selectProvider: 'ai:select-provider',
  startCodexLogin: 'ai:codex-login-start',
  cancelCodexLogin: 'ai:codex-login-cancel',
  logoutCodex: 'ai:codex-logout',
  updateSettings: 'settings:update-ai',
  setApiKey: 'secrets:set-provider-key',
  deleteApiKey: 'secrets:delete-provider-key',
  getConversation: 'ai:get-conversation',
  openChatGptBridge: 'ai:open-chatgpt-bridge',
  startTask: 'ai:start-task',
  cancelTask: 'ai:cancel-task',
  streamEvent: 'events:ai-stream',
} satisfies AiIpcChannels;
const ZOTERO_CHANNELS = {
  detect: 'zotero:detect',
  listItems: 'zotero:list-items',
  searchItems: 'zotero:search-items',
  cancelRequest: 'zotero:cancel-request',
  getItem: 'zotero:get-item',
  listCollections: 'zotero:list-collections',
  listCollectionItems: 'zotero:list-collection-items',
  listAttachments: 'zotero:list-attachments',
  findPrimaryPdf: 'zotero:find-primary-pdf',
  resolvePdfAvailability: 'zotero:resolve-pdf-availability',
} satisfies ZoteroIpcChannels;
const WORKSPACE_CHANNELS = {
  create: 'workspaces:create',
  get: 'workspaces:get',
  list: 'workspaces:list',
  update: 'workspaces:update',
  setStatus: 'workspaces:set-status',
  delete: 'workspaces:delete',
  getLastActive: 'workspaces:get-last-active',
  setLastActive: 'workspaces:set-last-active',
  addPaper: 'workspaces:add-zotero-paper',
  removePaper: 'workspaces:remove-zotero-paper',
  listPapers: 'workspaces:list-zotero-papers',
} satisfies WorkspaceIpcChannels;
const QUESTION_CHANNELS = {
  create: 'questions:create',
  get: 'questions:get',
  list: 'questions:list',
  update: 'questions:update',
  setStatus: 'questions:set-status',
  archive: 'questions:archive',
  delete: 'questions:delete',
  addZoteroEvidence: 'questions:add-zotero-evidence',
  addCodeEvidence: 'questions:add-code-evidence',
  removeEvidence: 'questions:remove-evidence',
  reorderEvidence: 'questions:reorder-evidence',
  openEvidence: 'questions:open-evidence',
} satisfies QuestionIpcChannels;
const PAPER_CODE_LINK_CHANNELS = {
  create: 'paper-code-links:create',
  get: 'paper-code-links:get',
  listForWorkspace: 'paper-code-links:list-for-workspace',
  listForPaper: 'paper-code-links:list-for-paper',
  listForCode: 'paper-code-links:list-for-code',
  update: 'paper-code-links:update',
  delete: 'paper-code-links:delete',
  openPaper: 'paper-code-links:open-paper',
  openCode: 'paper-code-links:open-code',
} satisfies PaperCodeLinkIpcChannels;
const KNOWLEDGE_CHANNELS = {
  getStatus: 'knowledge:get-status',
  runIndex: 'knowledge:run-index',
  cancelIndex: 'knowledge:cancel-index',
  removeIndex: 'knowledge:remove-index',
  search: 'knowledge:search',
  openResult: 'knowledge:open-result',
  progress: 'knowledge:index-progress',
} satisfies KnowledgeIpcChannels;
const RESEARCH_CHAT_CHANNELS = {
  getLatestConversation: 'research-chat:get-latest-conversation',
  prepareContext: 'research-chat:prepare-context',
  startTurn: 'research-chat:start-turn',
  retryTurn: 'research-chat:retry-turn',
  cancelTurn: 'research-chat:cancel-turn',
  openCitation: 'research-chat:open-citation',
  streamEvent: 'research-chat:stream-event',
} satisfies ResearchChatIpcChannels;

const api: PaperMindApi = Object.freeze({
  researchChat: Object.freeze({
    getLatestConversation: (workspaceId: string, questionId: string | null) =>
      ipcRenderer.invoke(RESEARCH_CHAT_CHANNELS.getLatestConversation, {
        workspaceId,
        questionId,
      }) as Promise<ApiResult<ResearchChatConversation | null>>,
    prepareContext: (input: PrepareResearchChatContextInput) =>
      ipcRenderer.invoke(RESEARCH_CHAT_CHANNELS.prepareContext, input) as Promise<
        ApiResult<ResearchChatContextPreview>
      >,
    startTurn: (input: StartResearchChatTurnInput) =>
      ipcRenderer.invoke(RESEARCH_CHAT_CHANNELS.startTurn, input) as Promise<
        ApiResult<ResearchChatTurnAccepted>
      >,
    retryTurn: (input: RetryResearchChatTurnInput) =>
      ipcRenderer.invoke(RESEARCH_CHAT_CHANNELS.retryTurn, input) as Promise<
        ApiResult<ResearchChatTurnAccepted>
      >,
    cancelTurn: (requestId: string) =>
      ipcRenderer.invoke(RESEARCH_CHAT_CHANNELS.cancelTurn, requestId) as Promise<
        ApiResult<{ readonly requestId: string }>
      >,
    openCitation: (input: OpenResearchChatCitationInput) =>
      ipcRenderer.invoke(RESEARCH_CHAT_CHANNELS.openCitation, input) as Promise<
        ApiResult<OpenKnowledgeResult>
      >,
    onStreamEvent: (listener: (event: ResearchChatStreamEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, streamEvent: ResearchChatStreamEvent) =>
        listener(streamEvent);
      ipcRenderer.on(RESEARCH_CHAT_CHANNELS.streamEvent, handler);
      return () => ipcRenderer.removeListener(RESEARCH_CHAT_CHANNELS.streamEvent, handler);
    },
  }),
  knowledge: Object.freeze({
    getStatus: (workspaceId: string) =>
      ipcRenderer.invoke(KNOWLEDGE_CHANNELS.getStatus, workspaceId) as Promise<
        ApiResult<KnowledgeIndexStatus>
      >,
    runIndex: (input: RunKnowledgeIndexInput) =>
      ipcRenderer.invoke(KNOWLEDGE_CHANNELS.runIndex, input) as Promise<
        ApiResult<KnowledgeIndexStatus>
      >,
    cancelIndex: (requestId: string) =>
      ipcRenderer.invoke(KNOWLEDGE_CHANNELS.cancelIndex, requestId) as Promise<
        ApiResult<KnowledgeIndexCancelResult>
      >,
    removeIndex: (input: RemoveKnowledgeIndexInput) =>
      ipcRenderer.invoke(KNOWLEDGE_CHANNELS.removeIndex, input) as Promise<
        ApiResult<{ readonly removed: boolean }>
      >,
    search: (input: KnowledgeSearchInput) =>
      ipcRenderer.invoke(KNOWLEDGE_CHANNELS.search, input) as Promise<
        ApiResult<KnowledgeSearchPage>
      >,
    openResult: (input: OpenKnowledgeResultInput) =>
      ipcRenderer.invoke(KNOWLEDGE_CHANNELS.openResult, input) as Promise<
        ApiResult<OpenKnowledgeResult>
      >,
    onProgress: (listener: (progress: KnowledgeIndexProgress) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: KnowledgeIndexProgress) =>
        listener(progress);
      ipcRenderer.on(KNOWLEDGE_CHANNELS.progress, handler);
      return () => ipcRenderer.removeListener(KNOWLEDGE_CHANNELS.progress, handler);
    },
  }),
  paperCodeLink: Object.freeze({
    create: (input: CreatePaperCodeLinkInput) =>
      ipcRenderer.invoke(PAPER_CODE_LINK_CHANNELS.create, input) as Promise<
        ApiResult<PaperCodeLink>
      >,
    get: (input: PaperCodeLinkIdentityInput) =>
      ipcRenderer.invoke(PAPER_CODE_LINK_CHANNELS.get, input) as Promise<ApiResult<PaperCodeLink>>,
    listForWorkspace: (workspaceId: string) =>
      ipcRenderer.invoke(PAPER_CODE_LINK_CHANNELS.listForWorkspace, workspaceId) as Promise<
        ApiResult<readonly PaperCodeLink[]>
      >,
    listForPaper: (input: PaperCodeLinkPaperQuery) =>
      ipcRenderer.invoke(PAPER_CODE_LINK_CHANNELS.listForPaper, input) as Promise<
        ApiResult<readonly PaperCodeLink[]>
      >,
    listForCode: (input: PaperCodeLinkCodeQuery) =>
      ipcRenderer.invoke(PAPER_CODE_LINK_CHANNELS.listForCode, input) as Promise<
        ApiResult<readonly PaperCodeLink[]>
      >,
    update: (input: UpdatePaperCodeLinkInput) =>
      ipcRenderer.invoke(PAPER_CODE_LINK_CHANNELS.update, input) as Promise<
        ApiResult<PaperCodeLink>
      >,
    delete: (input: PaperCodeLinkIdentityInput & { readonly confirmation: 'DELETE_LINK' }) =>
      ipcRenderer.invoke(PAPER_CODE_LINK_CHANNELS.delete, input) as Promise<
        ApiResult<{ readonly id: string }>
      >,
    openPaper: (input: PaperCodeLinkIdentityInput) =>
      ipcRenderer.invoke(PAPER_CODE_LINK_CHANNELS.openPaper, input) as Promise<
        ApiResult<PaperCodeLinkNavigationResult>
      >,
    openCode: (input: PaperCodeLinkIdentityInput) =>
      ipcRenderer.invoke(PAPER_CODE_LINK_CHANNELS.openCode, input) as Promise<
        ApiResult<PaperCodeLinkNavigationResult>
      >,
  }),
  question: Object.freeze({
    create: (input: CreateResearchQuestionInput) =>
      ipcRenderer.invoke(QUESTION_CHANNELS.create, input) as Promise<ApiResult<ResearchQuestion>>,
    get: (input: { readonly workspaceId: string; readonly questionId: string }) =>
      ipcRenderer.invoke(QUESTION_CHANNELS.get, input) as Promise<
        ApiResult<ResearchQuestionDetails>
      >,
    list: (workspaceId: string) =>
      ipcRenderer.invoke(QUESTION_CHANNELS.list, workspaceId) as Promise<
        ApiResult<readonly ResearchQuestion[]>
      >,
    update: (input: UpdateResearchQuestionInput) =>
      ipcRenderer.invoke(QUESTION_CHANNELS.update, input) as Promise<ApiResult<ResearchQuestion>>,
    setStatus: (input: SetResearchQuestionStatusInput) =>
      ipcRenderer.invoke(QUESTION_CHANNELS.setStatus, input) as Promise<
        ApiResult<ResearchQuestion>
      >,
    archive: (input: ArchiveResearchQuestionInput) =>
      ipcRenderer.invoke(QUESTION_CHANNELS.archive, input) as Promise<ApiResult<ResearchQuestion>>,
    delete: (input: {
      readonly workspaceId: string;
      readonly questionId: string;
      readonly confirmation: 'DELETE_QUESTION';
    }) =>
      ipcRenderer.invoke(QUESTION_CHANNELS.delete, input) as Promise<
        ApiResult<{ readonly id: string }>
      >,
    addZoteroEvidence: (input: AddZoteroEvidenceInput) =>
      ipcRenderer.invoke(QUESTION_CHANNELS.addZoteroEvidence, input) as Promise<
        ApiResult<ResearchQuestionDetails>
      >,
    addCodeEvidence: (input: AddCodeEvidenceInput) =>
      ipcRenderer.invoke(QUESTION_CHANNELS.addCodeEvidence, input) as Promise<
        ApiResult<ResearchQuestionDetails>
      >,
    removeEvidence: (input: EvidenceIdentityInput) =>
      ipcRenderer.invoke(QUESTION_CHANNELS.removeEvidence, input) as Promise<
        ApiResult<ResearchQuestionDetails>
      >,
    reorderEvidence: (input: ReorderEvidenceInput) =>
      ipcRenderer.invoke(QUESTION_CHANNELS.reorderEvidence, input) as Promise<
        ApiResult<ResearchQuestionDetails>
      >,
    openEvidence: (input: EvidenceIdentityInput) =>
      ipcRenderer.invoke(QUESTION_CHANNELS.openEvidence, input) as Promise<
        ApiResult<OpenEvidenceResult>
      >,
  }),
  codeIntelligence: Object.freeze({
    getStatus: (repositoryId: string) =>
      ipcRenderer.invoke(CODE_INTELLIGENCE_CHANNELS.getStatus, repositoryId) as Promise<
        ApiResult<CodeIndexStatus>
      >,
    runIndex: (input: RunCodeIndexInput) =>
      ipcRenderer.invoke(CODE_INTELLIGENCE_CHANNELS.runIndex, input) as Promise<
        ApiResult<CodeIndexStatus>
      >,
    cancelIndex: (requestId: string) =>
      ipcRenderer.invoke(CODE_INTELLIGENCE_CHANNELS.cancelIndex, requestId) as Promise<
        ApiResult<CodeIndexCancelResult>
      >,
    searchFiles: (input: CodeSearchInput) =>
      ipcRenderer.invoke(CODE_INTELLIGENCE_CHANNELS.searchFiles, input) as Promise<
        ApiResult<CodeSearchPage<CodeFileSearchResult>>
      >,
    searchSymbols: (input: CodeSearchInput) =>
      ipcRenderer.invoke(CODE_INTELLIGENCE_CHANNELS.searchSymbols, input) as Promise<
        ApiResult<CodeSearchPage<CodeSymbolSearchResult>>
      >,
    searchText: (input: CodeSearchInput) =>
      ipcRenderer.invoke(CODE_INTELLIGENCE_CHANNELS.searchText, input) as Promise<
        ApiResult<CodeSearchPage<CodeTextSearchResult>>
      >,
    onProgress: (listener: (progress: CodeIndexProgress) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: CodeIndexProgress) =>
        listener(progress);
      ipcRenderer.on(CODE_INTELLIGENCE_CHANNELS.progress, handler);
      return () => ipcRenderer.removeListener(CODE_INTELLIGENCE_CHANNELS.progress, handler);
    },
  }),
  app: Object.freeze({
    getInfo: () => ipcRenderer.invoke(APP_GET_INFO_CHANNEL) as Promise<AppInfo>,
  }),
  library: Object.freeze({
    chooseAndImportPdfs: () =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.chooseAndImportPdfs) as Promise<
        ApiResult<PaperImportBatch>
      >,
    importDroppedPdfs: (files: readonly File[]) => {
      const filePaths = files.map((file) => webUtils.getPathForFile(file)).filter(Boolean);
      return ipcRenderer.invoke(LIBRARY_CHANNELS.importDroppedPdfs, { filePaths }) as Promise<
        ApiResult<PaperImportBatch>
      >;
    },
    listPapers: (query: PaperListQuery = {}) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.listPapers, query) as Promise<ApiResult<PaperListResult>>,
    getPaper: (id: string) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.getPaper, id) as Promise<ApiResult<PaperDetails>>,
    updatePaperDetails: (input: PaperDetailsUpdate) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.updatePaperDetails, input) as Promise<
        ApiResult<PaperDetails>
      >,
    updatePaperMetadata: (input: PaperMetadataUpdate) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.updatePaperMetadata, input) as Promise<
        ApiResult<PaperDetails>
      >,
    updatePaperOrganization: (input: PaperOrganizationUpdate) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.updatePaperOrganization, input) as Promise<
        ApiResult<PaperDetails>
      >,
    batchUpdatePapers: (input: BatchPaperUpdate) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.batchUpdatePapers, input) as Promise<
        ApiResult<BatchPaperUpdateResult>
      >,
    listOrganization: () =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.listOrganization) as Promise<
        ApiResult<LibraryOrganization>
      >,
    createTag: (input: CreateTagInput) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.createTag, input) as Promise<ApiResult<Tag>>,
    deleteTag: (input: DeleteOrganizationItemInput) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.deleteTag, input) as Promise<
        ApiResult<{ readonly id: string }>
      >,
    createCollection: (input: CreateCollectionInput) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.createCollection, input) as Promise<
        ApiResult<Collection>
      >,
    deleteCollection: (input: DeleteOrganizationItemInput) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.deleteCollection, input) as Promise<
        ApiResult<{ readonly id: string }>
      >,
    removePaper: (input: PaperRemovalRequest) =>
      ipcRenderer.invoke(LIBRARY_CHANNELS.removePaper, input) as Promise<
        ApiResult<PaperRemovalResult>
      >,
  }),
  reader: Object.freeze({
    getPdfAccess: (paperId: string) =>
      ipcRenderer.invoke(READER_CHANNELS.getPdfAccess, paperId) as Promise<ApiResult<PdfAccess>>,
    getReadingState: (paperId: string) =>
      ipcRenderer.invoke(READER_CHANNELS.getReadingState, paperId) as Promise<
        ApiResult<ReadingState | null>
      >,
    saveReadingState: (input: SaveReadingStateInput) =>
      ipcRenderer.invoke(READER_CHANNELS.saveReadingState, input) as Promise<
        ApiResult<ReadingState>
      >,
    listAnnotations: (paperId: string) =>
      ipcRenderer.invoke(READER_CHANNELS.listAnnotations, paperId) as Promise<
        ApiResult<readonly Annotation[]>
      >,
    createAnnotation: (input: CreateAnnotationInput) =>
      ipcRenderer.invoke(READER_CHANNELS.createAnnotation, input) as Promise<ApiResult<Annotation>>,
    updateAnnotation: (input: UpdateAnnotationInput) =>
      ipcRenderer.invoke(READER_CHANNELS.updateAnnotation, input) as Promise<ApiResult<Annotation>>,
    deleteAnnotation: (input: DeleteAnnotationInput) =>
      ipcRenderer.invoke(READER_CHANNELS.deleteAnnotation, input) as Promise<
        ApiResult<{ readonly id: string }>
      >,
    exportAnnotations: (input: AnnotationExportRequest) =>
      ipcRenderer.invoke(READER_CHANNELS.exportAnnotations, input) as Promise<
        ApiResult<AnnotationExportResult>
      >,
  }),
  repository: Object.freeze({
    chooseAndLink: (workspaceId: string) =>
      ipcRenderer.invoke(REPOSITORY_CHANNELS.chooseAndLink, workspaceId) as Promise<
        ApiResult<WorkspaceRepositoryRef | null>
      >,
    listForWorkspace: (workspaceId: string) =>
      ipcRenderer.invoke(REPOSITORY_CHANNELS.listForWorkspace, workspaceId) as Promise<
        ApiResult<readonly WorkspaceRepositoryRef[]>
      >,
    removeFromWorkspace: (input: WorkspaceRepositoryInput) =>
      ipcRenderer.invoke(REPOSITORY_CHANNELS.removeFromWorkspace, input) as Promise<
        ApiResult<{ readonly removed: boolean }>
      >,
    deleteReference: (input: DeleteRepositoryRefInput) =>
      ipcRenderer.invoke(REPOSITORY_CHANNELS.deleteReference, input) as Promise<
        ApiResult<{ readonly repositoryId: string }>
      >,
    refresh: (input: { readonly repositoryId: string; readonly requestId: string }) =>
      ipcRenderer.invoke(REPOSITORY_CHANNELS.refresh, input) as Promise<ApiResult<RepositoryRef>>,
    listTree: (input: RepositoryTreeRequest) =>
      ipcRenderer.invoke(REPOSITORY_CHANNELS.listTree, input) as Promise<
        ApiResult<RepositoryTreePage>
      >,
    readSource: (input: RepositorySourceRequest) =>
      ipcRenderer.invoke(REPOSITORY_CHANNELS.readSource, input) as Promise<
        ApiResult<RepositorySourceFile>
      >,
    openInVscode: (input: OpenRepositoryInVscodeInput) =>
      ipcRenderer.invoke(REPOSITORY_CHANNELS.openInVscode, input) as Promise<
        ApiResult<{ readonly opened: boolean }>
      >,
    cancelRequest: (requestId: string) =>
      ipcRenderer.invoke(REPOSITORY_CHANNELS.cancelRequest, requestId) as Promise<
        ApiResult<RepositoryCancelResult>
      >,
  }),
  ai: Object.freeze({
    getCapabilities: () =>
      ipcRenderer.invoke(AI_CHANNELS.getCapabilities) as Promise<ApiResult<AiCapabilities>>,
    refreshProviders: () =>
      ipcRenderer.invoke(AI_CHANNELS.refreshProviders) as Promise<ApiResult<AiCapabilities>>,
    selectProvider: (providerId: AiProviderId) =>
      ipcRenderer.invoke(AI_CHANNELS.selectProvider, providerId) as Promise<
        ApiResult<AiCapabilities>
      >,
    startCodexLogin: () =>
      ipcRenderer.invoke(AI_CHANNELS.startCodexLogin) as Promise<ApiResult<AiCodexLoginResult>>,
    cancelCodexLogin: (loginId: string) =>
      ipcRenderer.invoke(AI_CHANNELS.cancelCodexLogin, loginId) as Promise<
        ApiResult<AiCapabilities>
      >,
    logoutCodex: () =>
      ipcRenderer.invoke(AI_CHANNELS.logoutCodex) as Promise<ApiResult<AiCapabilities>>,
    updateSettings: (settings: AiProviderSettings) =>
      ipcRenderer.invoke(AI_CHANNELS.updateSettings, settings) as Promise<
        ApiResult<AiCapabilities>
      >,
    setApiKey: (apiKey: string) =>
      ipcRenderer.invoke(AI_CHANNELS.setApiKey, apiKey) as Promise<ApiResult<AiCredentialState>>,
    deleteApiKey: () =>
      ipcRenderer.invoke(AI_CHANNELS.deleteApiKey) as Promise<ApiResult<AiCredentialState>>,
    getConversation: (paperId: string) =>
      ipcRenderer.invoke(AI_CHANNELS.getConversation, paperId) as Promise<
        ApiResult<AiConversation | null>
      >,
    openChatGptBridge: (input: AiChatGptBridgeInput) =>
      ipcRenderer.invoke(AI_CHANNELS.openChatGptBridge, input) as Promise<
        ApiResult<AiChatGptBridgeResult>
      >,
    startTask: (input: AiTaskInput) =>
      ipcRenderer.invoke(AI_CHANNELS.startTask, input) as Promise<ApiResult<AiTaskAccepted>>,
    cancelTask: (requestId: string) =>
      ipcRenderer.invoke(AI_CHANNELS.cancelTask, requestId) as Promise<
        ApiResult<{ readonly requestId: string }>
      >,
    onStreamEvent: (listener: (event: AiStreamEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, streamEvent: AiStreamEvent) =>
        listener(streamEvent);
      ipcRenderer.on(AI_CHANNELS.streamEvent, handler);
      return () => ipcRenderer.removeListener(AI_CHANNELS.streamEvent, handler);
    },
  }),
  zotero: Object.freeze({
    detectZotero: () =>
      ipcRenderer.invoke(ZOTERO_CHANNELS.detect) as Promise<ApiResult<ZoteroConnectionStatus>>,
    listItems: (input: ZoteroPageRequest) =>
      ipcRenderer.invoke(ZOTERO_CHANNELS.listItems, input) as Promise<ApiResult<ZoteroItemPage>>,
    searchItems: (input: ZoteroSearchRequest) =>
      ipcRenderer.invoke(ZOTERO_CHANNELS.searchItems, input) as Promise<ApiResult<ZoteroItemPage>>,
    cancelRequest: (requestId: string) =>
      ipcRenderer.invoke(ZOTERO_CHANNELS.cancelRequest, requestId) as Promise<
        ApiResult<ZoteroCancelResult>
      >,
    getItem: (ref: ZoteroItemRef) =>
      ipcRenderer.invoke(ZOTERO_CHANNELS.getItem, ref) as Promise<ApiResult<ZoteroItemDetails>>,
    listCollections: () =>
      ipcRenderer.invoke(ZOTERO_CHANNELS.listCollections) as Promise<
        ApiResult<readonly ZoteroCollection[]>
      >,
    listCollectionItems: (ref: ZoteroCollectionRef) =>
      ipcRenderer.invoke(ZOTERO_CHANNELS.listCollectionItems, ref) as Promise<
        ApiResult<readonly ZoteroItemSummary[]>
      >,
    listAttachments: (ref: ZoteroItemRef) =>
      ipcRenderer.invoke(ZOTERO_CHANNELS.listAttachments, ref) as Promise<
        ApiResult<readonly ZoteroAttachment[]>
      >,
    findPrimaryPdf: (ref: ZoteroItemRef) =>
      ipcRenderer.invoke(ZOTERO_CHANNELS.findPrimaryPdf, ref) as Promise<
        ApiResult<ZoteroAttachment | null>
      >,
    resolvePdfAvailability: (ref: ZoteroItemRef) =>
      ipcRenderer.invoke(ZOTERO_CHANNELS.resolvePdfAvailability, ref) as Promise<
        ApiResult<ZoteroPdfAvailability>
      >,
  }),
  workspace: Object.freeze({
    create: (input: CreateWorkspaceInput) =>
      ipcRenderer.invoke(WORKSPACE_CHANNELS.create, input) as Promise<ApiResult<Workspace>>,
    get: (id: string) =>
      ipcRenderer.invoke(WORKSPACE_CHANNELS.get, id) as Promise<ApiResult<Workspace>>,
    list: () =>
      ipcRenderer.invoke(WORKSPACE_CHANNELS.list) as Promise<ApiResult<readonly Workspace[]>>,
    update: (input: UpdateWorkspaceInput) =>
      ipcRenderer.invoke(WORKSPACE_CHANNELS.update, input) as Promise<ApiResult<Workspace>>,
    setStatus: (input: SetWorkspaceStatusInput) =>
      ipcRenderer.invoke(WORKSPACE_CHANNELS.setStatus, input) as Promise<ApiResult<Workspace>>,
    delete: (input: DeleteWorkspaceInput) =>
      ipcRenderer.invoke(WORKSPACE_CHANNELS.delete, input) as Promise<
        ApiResult<{ readonly id: string }>
      >,
    getLastActive: () =>
      ipcRenderer.invoke(WORKSPACE_CHANNELS.getLastActive) as Promise<ApiResult<Workspace | null>>,
    setLastActive: (input: SetLastActiveWorkspaceInput) =>
      ipcRenderer.invoke(WORKSPACE_CHANNELS.setLastActive, input) as Promise<
        ApiResult<Workspace | null>
      >,
    addPaper: (input: WorkspaceZoteroPaperInput) =>
      ipcRenderer.invoke(WORKSPACE_CHANNELS.addPaper, input) as Promise<
        ApiResult<WorkspaceZoteroPaper>
      >,
    removePaper: (input: WorkspaceZoteroPaperInput) =>
      ipcRenderer.invoke(WORKSPACE_CHANNELS.removePaper, input) as Promise<
        ApiResult<{ readonly removed: boolean }>
      >,
    listPapers: (workspaceId: string) =>
      ipcRenderer.invoke(WORKSPACE_CHANNELS.listPapers, workspaceId) as Promise<
        ApiResult<readonly WorkspaceZoteroPaper[]>
      >,
  }),
});

contextBridge.exposeInMainWorld('paperMind', api);
