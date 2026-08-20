import { randomUUID } from 'node:crypto';
import { copyFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';

import type { AiConversation, AiMessage, AiProviderSettings } from '../../shared/contracts/ai';
import type {
  AiDataGateway,
  CreateAiTurnInput,
  CreateAiTurnResult,
  FinalizeAiMessageInput,
} from '../ai/ai-data-gateway';
import type {
  BatchPaperUpdate,
  BatchPaperUpdateResult,
  Collection,
  CreateCollectionInput,
  CreateTagInput,
  LibraryOrganization,
  PaperDetails,
  PaperDetailsUpdate,
  PaperListQuery,
  PaperListResult,
  PaperMetadataUpdate,
  PaperOrganizationUpdate,
  Tag,
} from '../../shared/contracts/library';
import type {
  Annotation,
  CreateAnnotationInput,
  ReadingState,
  SaveReadingStateInput,
  UpdateAnnotationInput,
} from '../../shared/contracts/reader';
import { LibraryError } from '../library/errors';
import type {
  CreateImportedPaperResult,
  ImportedPaperRecord,
  PaperTextExtractionRecord,
  PendingPaperTextExtraction,
  PaperDataGateway,
} from '../library/paper-data-gateway';
import type {
  CreateWorkspaceInput,
  SetWorkspaceStatusInput,
  UpdateWorkspaceInput,
  Workspace,
} from '../../shared/contracts/workspace';
import type { ZoteroItemRef } from '../../shared/contracts/zotero';
import type { RepositoryRef, WorkspaceRepositoryRef } from '../../shared/contracts/repository';
import type {
  RepositoryDataGateway,
  RepositoryObservationInput,
} from '../repository/repository-data-gateway';
import type {
  StoredWorkspaceZoteroPaper,
  WorkspaceDataGateway,
} from '../workspace/workspace-data-gateway';
import { applyMigrations } from './migrations';
import { AiRepository } from './ai-repository';
import { PaperRepository } from './paper-repository';
import { ReaderRepository } from './reader-repository';
import { WorkspaceRepository } from './workspace-repository';
import { RepositoryRepository } from './repository-repository';
import { CodeIndexRepository } from './code-index-repository';
import type {
  CodeIndexDataGateway,
  CodeIndexFailureInput,
  CompleteCodeIndexInput,
  StoredCodeFileHash,
  StoredCodeKnowledgeChunk,
} from '../code-intelligence/code-index-data-gateway';
import type {
  CodeFileSearchResult,
  CodeIndexStatus,
  CodeSearchInput,
  CodeSearchPage,
  CodeSymbolSearchResult,
  CodeTextSearchResult,
} from '../../shared/contracts/code-intelligence';
import type {
  CreateResearchQuestionInput,
  ArchiveResearchQuestionInput,
  AddCodeEvidenceInput,
  ResearchQuestion,
  SetResearchQuestionStatusInput,
  UpdateResearchQuestionInput,
} from '../../shared/contracts/question';
import type {
  CreateStoredZoteroEvidenceInput,
  QuestionDataGateway,
  StoredCodeEvidence,
  StoredEvidence,
  StoredZoteroEvidence,
} from '../question/question-data-gateway';
import { QuestionRepository } from './question-repository';
import { PaperCodeLinkRepository } from './paper-code-link-repository';
import type {
  CreateStoredPaperCodeLinkInput,
  PaperCodeLinkDataGateway,
  StoredPaperCodeLink,
} from '../paper-code-link/paper-code-link-data-gateway';
import type { UpdatePaperCodeLinkInput } from '../../shared/contracts/paper-code-link';
import type { KnowledgeIndexStatus, KnowledgeSourceType } from '../../shared/contracts/knowledge';
import type {
  BeginKnowledgeIndexInput,
  CompleteKnowledgeIndexInput,
  KnowledgeDataGateway,
  KnowledgeIndexFailureInput,
  KnowledgeKeywordSearchInput,
  KnowledgeSourceFingerprint,
  StoredKnowledgeChunk,
  UpdateKnowledgeIndexProgressInput,
} from '../knowledge/knowledge-data-gateway';
import { KnowledgeRepository } from './knowledge-repository';
import { ResearchChatRepository } from './research-chat-repository';
import type {
  CreateResearchChatTurnInput,
  CreateResearchChatTurnResult,
  FinalizeResearchChatMessageInput,
  ResearchChatDataGateway,
  StoredResearchChatTurn,
} from '../research-chat/research-chat-data-gateway';
import type {
  ResearchChatContextSource,
  ResearchChatConversation,
  ResearchChatMessage,
} from '../../shared/contracts/research-chat';
import type {
  CreateResearchContentInput,
  ListResearchContentInput,
  ResearchContentIdentityInput,
  ResearchContentItem,
  ResearchContentSummary,
  ResearchMemoryEntry,
  ResearchMemoryProposal,
  ResearchReference,
  UpdateResearchContentInput,
} from '../../shared/contracts/research-memory';
import type {
  ConfirmStoredProposalInput,
  CreateStoredProposalInput,
  RecordResearchExportInput,
  ResearchMemoryDataGateway,
  StoredResearchReferenceInput,
} from '../research-memory/research-memory-data-gateway';
import { ResearchMemoryRepository } from './research-memory-repository';
import type {
  ResearchPlan,
  ResearchPlanHistoryEntry,
  ResearchPlanProposal,
} from '../../shared/contracts/research-plan';
import type {
  ResearchPlanDataGateway,
  StoredPlanProposalInput,
  StoredPlanReferenceInput,
} from '../research-plan/research-plan-data-gateway';
import { ResearchPlanRepository } from './research-plan-repository';
import type {
  AppendStoredAgentStepInput,
  CompleteStoredAgentRunInput,
  CreateStoredAgentRunInput,
  ResearchAgentDataGateway,
} from '../research-agent/research-agent-data-gateway';
import type {
  ResearchAgentProposal,
  ResearchAgentRun,
  ResearchAgentRunSummary,
} from '../../shared/contracts/research-agent';
import { ResearchAgentRepository } from './research-agent-repository';
import type { ExperimentDataGateway } from '../experiment/experiment-data-gateway';
import type { Experiment, ExperimentConclusionProposal } from '../../shared/contracts/experiment';
import { ExperimentRepository } from './experiment-repository';

export class LibraryDatabase
  implements
    PaperDataGateway,
    AiDataGateway,
    WorkspaceDataGateway,
    RepositoryDataGateway,
    CodeIndexDataGateway,
    QuestionDataGateway,
    PaperCodeLinkDataGateway,
    KnowledgeDataGateway,
    ResearchChatDataGateway,
    ResearchMemoryDataGateway,
    ResearchPlanDataGateway,
    ResearchAgentDataGateway,
    ExperimentDataGateway
{
  private database: BetterSqlite3.Database;
  private repository: PaperRepository;
  private readerRepository: ReaderRepository;
  private aiRepository: AiRepository;
  private workspaceRepository: WorkspaceRepository;
  private repositoryRepository: RepositoryRepository;
  private codeIndexRepository: CodeIndexRepository;
  private questionRepository: QuestionRepository;
  private paperCodeLinkRepository: PaperCodeLinkRepository;
  private knowledgeRepository: KnowledgeRepository;
  private researchChatRepository: ResearchChatRepository;
  private researchMemoryRepository: ResearchMemoryRepository;
  private researchPlanRepository: ResearchPlanRepository;
  private researchAgentRepository: ResearchAgentRepository;
  private experimentRepository: ExperimentRepository;

  public constructor(private readonly databasePath: string) {
    this.database = this.openDatabase(databasePath);
    this.repository = new PaperRepository(this.database);
    this.readerRepository = new ReaderRepository(this.database);
    this.aiRepository = new AiRepository(this.database);
    this.workspaceRepository = new WorkspaceRepository(this.database);
    this.repositoryRepository = new RepositoryRepository(this.database);
    this.codeIndexRepository = new CodeIndexRepository(this.database);
    this.questionRepository = new QuestionRepository(this.database);
    this.paperCodeLinkRepository = new PaperCodeLinkRepository(this.database);
    this.knowledgeRepository = new KnowledgeRepository(this.database);
    this.researchChatRepository = new ResearchChatRepository(this.database);
    this.researchMemoryRepository = new ResearchMemoryRepository(this.database);
    this.researchPlanRepository = new ResearchPlanRepository(this.database);
    this.researchAgentRepository = new ResearchAgentRepository(this.database);
    this.experimentRepository = new ExperimentRepository(this.database);
  }

  public listPapers(query?: PaperListQuery): Promise<PaperListResult> {
    return this.run(() => this.repository.list(query));
  }

  public getPaper(id: string): Promise<PaperDetails | null> {
    return this.run(() => this.repository.getById(id));
  }

  public findPaperByHash(sha256: string): Promise<PaperDetails | null> {
    return this.run(() => this.repository.findByHash(sha256));
  }

  public createImportedPaper(input: ImportedPaperRecord): Promise<CreateImportedPaperResult> {
    return this.run(() => this.repository.createImported(input));
  }

  public updatePaperDetails(input: PaperDetailsUpdate): Promise<PaperDetails> {
    return this.run(() => this.repository.updateDetails(input));
  }

  public updatePaperMetadata(input: PaperMetadataUpdate): Promise<PaperDetails> {
    return this.run(() => this.repository.updateMetadata(input));
  }

  public updatePaperOrganization(input: PaperOrganizationUpdate): Promise<PaperDetails> {
    return this.run(() => this.repository.updateOrganization(input));
  }

  public batchUpdatePapers(input: BatchPaperUpdate): Promise<BatchPaperUpdateResult> {
    return this.run(() => this.repository.batchUpdate(input));
  }

  public listOrganization(): Promise<LibraryOrganization> {
    return this.run(() => this.repository.listOrganization());
  }

  public createTag(input: CreateTagInput): Promise<Tag> {
    return this.run(() => this.repository.createTag(input));
  }

  public deleteTag(id: string): Promise<void> {
    return this.run(() => this.repository.deleteTag(id));
  }

  public createCollection(input: CreateCollectionInput): Promise<Collection> {
    return this.run(() => this.repository.createCollection(input));
  }

  public deleteCollection(id: string): Promise<void> {
    return this.run(() => this.repository.deleteCollection(id));
  }

  public listPendingPaperTextExtractions(): Promise<readonly PendingPaperTextExtraction[]> {
    return this.run(() => this.repository.listPendingTextExtractions());
  }

  public savePaperTextExtraction(input: PaperTextExtractionRecord): Promise<void> {
    return this.run(() => this.repository.saveTextExtraction(input));
  }

  public removePaperRecord(id: string): Promise<PaperDetails> {
    return this.run(() => this.repository.remove(id));
  }

  public getManagedPaperFile(paperId: string) {
    return this.run(() => this.readerRepository.getManagedPaperFile(paperId));
  }

  public listAnnotations(paperId: string): Promise<readonly Annotation[]> {
    return this.run(() => this.readerRepository.listAnnotations(paperId));
  }

  public createAnnotation(input: CreateAnnotationInput): Promise<Annotation> {
    return this.run(() => this.readerRepository.createAnnotation(input));
  }

  public updateAnnotation(input: UpdateAnnotationInput): Promise<Annotation> {
    return this.run(() => this.readerRepository.updateAnnotation(input));
  }

  public deleteAnnotation(id: string, rowVersion: number): Promise<void> {
    return this.run(() => this.readerRepository.deleteAnnotation(id, rowVersion));
  }

  public getReadingState(paperId: string): Promise<ReadingState | null> {
    return this.run(() => this.readerRepository.getReadingState(paperId));
  }

  public saveReadingState(input: SaveReadingStateInput): Promise<ReadingState> {
    return this.run(() => this.readerRepository.saveReadingState(input));
  }

  public getAiSettings(): Promise<AiProviderSettings | null> {
    return this.run(() => this.aiRepository.getSettings());
  }

  public saveAiSettings(settings: AiProviderSettings): Promise<AiProviderSettings> {
    return this.run(() => this.aiRepository.saveSettings(settings));
  }

  public createAiTurn(input: CreateAiTurnInput): Promise<CreateAiTurnResult> {
    return this.run(() => this.aiRepository.createTurn(input));
  }

  public finalizeAiMessage(input: FinalizeAiMessageInput): Promise<AiMessage> {
    return this.run(() => this.aiRepository.finalizeMessage(input));
  }

  public getLatestAiConversation(paperId: string): Promise<AiConversation | null> {
    return this.run(() => this.aiRepository.getLatestConversation(paperId));
  }

  public getAiConversation(conversationId: string): Promise<AiConversation | null> {
    return this.run(() => this.aiRepository.getConversation(conversationId));
  }

  public markStaleAiMessages(): Promise<number> {
    return this.run(() => this.aiRepository.markStaleMessages());
  }

  public createResearchChatTurn(
    input: CreateResearchChatTurnInput,
  ): Promise<CreateResearchChatTurnResult> {
    return this.run(() => this.researchChatRepository.createTurn(input));
  }

  public finalizeResearchChatMessage(
    input: FinalizeResearchChatMessageInput,
  ): Promise<ResearchChatMessage> {
    return this.run(() => this.researchChatRepository.finalizeMessage(input));
  }

  public getLatestResearchChatConversation(
    workspaceId: string,
    questionId: string | null,
  ): Promise<ResearchChatConversation | null> {
    return this.run(() =>
      this.researchChatRepository.getLatestConversation(workspaceId, questionId),
    );
  }

  public getResearchChatConversation(
    workspaceId: string,
    conversationId: string,
  ): Promise<ResearchChatConversation | null> {
    return this.run(() => this.researchChatRepository.getConversation(workspaceId, conversationId));
  }

  public getResearchChatTurn(
    workspaceId: string,
    conversationId: string,
    assistantMessageId: string,
  ): Promise<StoredResearchChatTurn | null> {
    return this.run(() =>
      this.researchChatRepository.getTurn(workspaceId, conversationId, assistantMessageId),
    );
  }

  public getResearchChatCitationSource(
    workspaceId: string,
    conversationId: string,
    messageId: string,
    alias: string,
  ): Promise<ResearchChatContextSource | null> {
    return this.run(() =>
      this.researchChatRepository.getCitationSource(workspaceId, conversationId, messageId, alias),
    );
  }

  public markStaleResearchChatMessages(): Promise<number> {
    return this.run(() => this.researchChatRepository.markStaleMessages());
  }

  public createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
    return this.run(() => this.workspaceRepository.create(input));
  }

  public getWorkspace(id: string): Promise<Workspace | null> {
    return this.run(() => this.workspaceRepository.get(id));
  }

  public listWorkspaces(): Promise<readonly Workspace[]> {
    return this.run(() => this.workspaceRepository.list());
  }

  public updateWorkspace(input: UpdateWorkspaceInput): Promise<Workspace> {
    return this.run(() => this.workspaceRepository.update(input));
  }

  public setWorkspaceStatus(input: SetWorkspaceStatusInput): Promise<Workspace> {
    return this.run(() => this.workspaceRepository.setStatus(input));
  }

  public deleteWorkspace(id: string): Promise<boolean> {
    return this.run(() => this.workspaceRepository.delete(id));
  }

  public getLastActiveWorkspace(): Promise<Workspace | null> {
    return this.run(() => this.workspaceRepository.getLastActive());
  }

  public setLastActiveWorkspace(workspaceId: string | null): Promise<Workspace | null> {
    return this.run(() => this.workspaceRepository.setLastActive(workspaceId));
  }

  public addWorkspaceZoteroPaper(
    workspaceId: string,
    itemRef: ZoteroItemRef,
  ): Promise<StoredWorkspaceZoteroPaper> {
    return this.run(() => this.workspaceRepository.addZoteroPaper(workspaceId, itemRef));
  }

  public removeWorkspaceZoteroPaper(workspaceId: string, itemRef: ZoteroItemRef): Promise<boolean> {
    return this.run(() => this.workspaceRepository.removeZoteroPaper(workspaceId, itemRef));
  }

  public listWorkspaceZoteroPapers(
    workspaceId: string,
  ): Promise<readonly StoredWorkspaceZoteroPaper[]> {
    return this.run(() => this.workspaceRepository.listZoteroPapers(workspaceId));
  }

  public createOrUpdateRepository(input: RepositoryObservationInput): Promise<RepositoryRef> {
    return this.run(() => this.repositoryRepository.createOrUpdate(input));
  }

  public getRepository(id: string): Promise<RepositoryRef | null> {
    return this.run(() => this.repositoryRepository.get(id));
  }

  public updateRepositoryObservation(
    id: string,
    input: Omit<RepositoryObservationInput, 'canonicalKey' | 'canonicalRoot' | 'displayName'>,
  ): Promise<RepositoryRef> {
    return this.run(() => this.repositoryRepository.updateObservation(id, input));
  }

  public addWorkspaceRepository(
    workspaceId: string,
    repositoryId: string,
  ): Promise<WorkspaceRepositoryRef> {
    return this.run(() => this.repositoryRepository.addToWorkspace(workspaceId, repositoryId));
  }

  public removeWorkspaceRepository(workspaceId: string, repositoryId: string): Promise<boolean> {
    return this.run(() => this.repositoryRepository.removeFromWorkspace(workspaceId, repositoryId));
  }

  public listWorkspaceRepositories(
    workspaceId: string,
  ): Promise<readonly WorkspaceRepositoryRef[]> {
    return this.run(() => this.repositoryRepository.listForWorkspace(workspaceId));
  }

  public deleteRepository(id: string): Promise<boolean> {
    return this.run(() => this.repositoryRepository.delete(id));
  }

  public recoverInterruptedIndexes(updatedAt: string): Promise<number> {
    return this.run(() => this.codeIndexRepository.recoverInterrupted(updatedAt));
  }

  public getCodeIndexStatus(repositoryId: string): Promise<CodeIndexStatus | null> {
    return this.run(() => this.codeIndexRepository.getStatus(repositoryId));
  }

  public listCodeFileHashes(repositoryId: string): Promise<readonly StoredCodeFileHash[]> {
    return this.run(() => this.codeIndexRepository.listFileHashes(repositoryId));
  }

  public beginCodeIndex(
    repositoryId: string,
    requestId: string,
    parserVersion: string,
    totalFiles: number,
    startedAt: string,
  ): Promise<CodeIndexStatus> {
    return this.run(() =>
      this.codeIndexRepository.begin(repositoryId, requestId, parserVersion, totalFiles, startedAt),
    );
  }

  public updateCodeIndexProgress(
    repositoryId: string,
    requestId: string,
    processedFiles: number,
    totalFiles: number,
    updatedAt: string,
  ): Promise<void> {
    return this.run(() =>
      this.codeIndexRepository.updateProgress(
        repositoryId,
        requestId,
        processedFiles,
        totalFiles,
        updatedAt,
      ),
    );
  }

  public completeCodeIndex(input: CompleteCodeIndexInput): Promise<CodeIndexStatus> {
    return this.run(() => this.codeIndexRepository.complete(input));
  }

  public cancelCodeIndex(input: CodeIndexFailureInput): Promise<CodeIndexStatus> {
    return this.run(() => this.codeIndexRepository.cancel(input));
  }

  public failCodeIndex(input: CodeIndexFailureInput): Promise<CodeIndexStatus> {
    return this.run(() => this.codeIndexRepository.fail(input));
  }

  public markCodeIndexStale(repositoryId: string, updatedAt: string): Promise<CodeIndexStatus> {
    return this.run(() => this.codeIndexRepository.markStale(repositoryId, updatedAt));
  }

  public searchCodeFiles(input: CodeSearchInput): Promise<CodeSearchPage<CodeFileSearchResult>> {
    return this.run(() => this.codeIndexRepository.searchFiles(input));
  }

  public searchCodeSymbols(
    input: CodeSearchInput,
  ): Promise<CodeSearchPage<CodeSymbolSearchResult>> {
    return this.run(() => this.codeIndexRepository.searchSymbols(input));
  }

  public searchCodeText(input: CodeSearchInput): Promise<CodeSearchPage<CodeTextSearchResult>> {
    return this.run(() => this.codeIndexRepository.searchText(input));
  }

  public listCodeChunksForKnowledge(
    repositoryId: string,
  ): Promise<readonly StoredCodeKnowledgeChunk[]> {
    return this.run(() => this.codeIndexRepository.listChunksForKnowledge(repositoryId));
  }

  public createQuestion(input: CreateResearchQuestionInput): Promise<ResearchQuestion> {
    return this.run(() => this.questionRepository.create(input));
  }

  public getQuestion(workspaceId: string, questionId: string): Promise<ResearchQuestion | null> {
    return this.run(() => this.questionRepository.get(workspaceId, questionId));
  }

  public listQuestions(workspaceId: string): Promise<readonly ResearchQuestion[]> {
    return this.run(() => this.questionRepository.list(workspaceId));
  }

  public updateQuestion(input: UpdateResearchQuestionInput): Promise<ResearchQuestion> {
    return this.run(() => this.questionRepository.update(input));
  }

  public setQuestionStatus(input: SetResearchQuestionStatusInput): Promise<ResearchQuestion> {
    return this.run(() => this.questionRepository.setStatus(input));
  }

  public archiveQuestion(input: ArchiveResearchQuestionInput): Promise<ResearchQuestion> {
    return this.run(() => this.questionRepository.archive(input));
  }

  public deleteQuestion(workspaceId: string, questionId: string): Promise<boolean> {
    return this.run(() => this.questionRepository.delete(workspaceId, questionId));
  }

  public listEvidence(workspaceId: string, questionId: string): Promise<readonly StoredEvidence[]> {
    return this.run(() => this.questionRepository.listEvidence(workspaceId, questionId));
  }

  public addZoteroEvidence(input: CreateStoredZoteroEvidenceInput): Promise<StoredZoteroEvidence> {
    return this.run(() => this.questionRepository.addZoteroEvidence(input));
  }

  public addCodeEvidence(input: AddCodeEvidenceInput): Promise<StoredCodeEvidence> {
    return this.run(() => this.questionRepository.addCodeEvidence(input));
  }

  public removeEvidence(
    workspaceId: string,
    questionId: string,
    evidenceId: string,
  ): Promise<boolean> {
    return this.run(() =>
      this.questionRepository.removeEvidence(workspaceId, questionId, evidenceId),
    );
  }

  public reorderEvidence(
    workspaceId: string,
    questionId: string,
    evidenceIds: readonly string[],
  ): Promise<void> {
    return this.run(() =>
      this.questionRepository.reorderEvidence(workspaceId, questionId, evidenceIds),
    );
  }

  public getEvidence(
    workspaceId: string,
    questionId: string,
    evidenceId: string,
  ): Promise<StoredEvidence | null> {
    return this.run(() => this.questionRepository.getEvidence(workspaceId, questionId, evidenceId));
  }

  public codeLocationExists(input: StoredCodeEvidence): Promise<boolean> {
    return this.run(() => this.questionRepository.codeLocationExists(input));
  }

  public createPaperCodeLink(input: CreateStoredPaperCodeLinkInput): Promise<StoredPaperCodeLink> {
    return this.run(() => this.paperCodeLinkRepository.create(input));
  }

  public getPaperCodeLink(workspaceId: string, id: string): Promise<StoredPaperCodeLink | null> {
    return this.run(() => this.paperCodeLinkRepository.get(workspaceId, id));
  }

  public listPaperCodeLinks(workspaceId: string): Promise<readonly StoredPaperCodeLink[]> {
    return this.run(() => this.paperCodeLinkRepository.list(workspaceId));
  }

  public updatePaperCodeLink(input: UpdatePaperCodeLinkInput): Promise<StoredPaperCodeLink> {
    return this.run(() => this.paperCodeLinkRepository.update(input));
  }

  public deletePaperCodeLink(workspaceId: string, id: string): Promise<boolean> {
    return this.run(() => this.paperCodeLinkRepository.delete(workspaceId, id));
  }

  public paperCodeLocationExists(input: StoredPaperCodeLink): Promise<boolean> {
    return this.run(() => this.paperCodeLinkRepository.codeLocationExists(input));
  }

  public recoverInterruptedKnowledgeIndexes(updatedAt: string): Promise<number> {
    return this.run(() => this.knowledgeRepository.recoverInterrupted(updatedAt));
  }

  public getKnowledgeIndexStatus(workspaceId: string): Promise<KnowledgeIndexStatus | null> {
    return this.run(() => this.knowledgeRepository.getStatus(workspaceId));
  }

  public listKnowledgeSourceFingerprints(
    workspaceId: string,
  ): Promise<readonly KnowledgeSourceFingerprint[]> {
    return this.run(() => this.knowledgeRepository.listFingerprints(workspaceId));
  }

  public beginKnowledgeIndex(input: BeginKnowledgeIndexInput): Promise<KnowledgeIndexStatus> {
    return this.run(() => this.knowledgeRepository.begin(input));
  }

  public updateKnowledgeIndexProgress(
    input: UpdateKnowledgeIndexProgressInput,
  ): Promise<KnowledgeIndexStatus> {
    return this.run(() => this.knowledgeRepository.updateProgress(input));
  }

  public completeKnowledgeIndex(input: CompleteKnowledgeIndexInput): Promise<KnowledgeIndexStatus> {
    return this.run(() => this.knowledgeRepository.complete(input));
  }

  public cancelKnowledgeIndex(input: KnowledgeIndexFailureInput): Promise<KnowledgeIndexStatus> {
    return this.run(() => this.knowledgeRepository.cancel(input));
  }

  public failKnowledgeIndex(input: KnowledgeIndexFailureInput): Promise<KnowledgeIndexStatus> {
    return this.run(() => this.knowledgeRepository.fail(input));
  }

  public removeKnowledgeIndex(workspaceId: string): Promise<boolean> {
    return this.run(() => this.knowledgeRepository.remove(workspaceId));
  }

  public searchKnowledgeKeyword(
    input: KnowledgeKeywordSearchInput,
  ): Promise<readonly StoredKnowledgeChunk[]> {
    return this.run(() => this.knowledgeRepository.searchKeyword(input));
  }

  public listKnowledgeSemanticCandidates(
    workspaceId: string,
    sourceTypes: readonly KnowledgeSourceType[],
    limit: number,
  ): Promise<readonly StoredKnowledgeChunk[]> {
    return this.run(() =>
      this.knowledgeRepository.listSemanticCandidates(workspaceId, sourceTypes, limit),
    );
  }

  public getKnowledgeChunk(
    workspaceId: string,
    chunkId: string,
  ): Promise<StoredKnowledgeChunk | null> {
    return this.run(() => this.knowledgeRepository.getChunk(workspaceId, chunkId));
  }

  public listResearchContent(
    input: ListResearchContentInput,
  ): Promise<readonly ResearchContentSummary[]> {
    return this.run(() => this.researchMemoryRepository.list(input));
  }

  public getResearchContent(
    input: ResearchContentIdentityInput,
  ): Promise<ResearchContentItem | null> {
    return this.run(() => this.researchMemoryRepository.get(input));
  }

  public createResearchContent(input: CreateResearchContentInput): Promise<ResearchContentItem> {
    return this.run(() => this.researchMemoryRepository.create(input));
  }

  public updateResearchContent(input: UpdateResearchContentInput): Promise<ResearchContentItem> {
    return this.run(() => this.researchMemoryRepository.update(input));
  }

  public deleteResearchContent(input: ResearchContentIdentityInput): Promise<boolean> {
    return this.run(() => this.researchMemoryRepository.delete(input));
  }

  public addResearchReference(input: StoredResearchReferenceInput): Promise<ResearchReference> {
    return this.run(() => this.researchMemoryRepository.addReference(input));
  }

  public removeResearchReference(
    input: Parameters<ResearchMemoryDataGateway['removeResearchReference']>[0],
  ): Promise<boolean> {
    return this.run(() => this.researchMemoryRepository.removeReference(input));
  }

  public getResearchReference(
    input: Parameters<ResearchMemoryDataGateway['getResearchReference']>[0],
  ): Promise<ResearchReference | null> {
    return this.run(() => this.researchMemoryRepository.getReference(input));
  }

  public createResearchMemoryProposal(
    input: CreateStoredProposalInput,
  ): Promise<ResearchMemoryProposal> {
    return this.run(() => this.researchMemoryRepository.createProposal(input));
  }

  public listResearchMemoryProposals(
    workspaceId: string,
  ): Promise<readonly ResearchMemoryProposal[]> {
    return this.run(() => this.researchMemoryRepository.listProposals(workspaceId));
  }

  public getResearchMemoryProposal(
    workspaceId: string,
    proposalId: string,
  ): Promise<ResearchMemoryProposal | null> {
    return this.run(() => this.researchMemoryRepository.getProposal(workspaceId, proposalId));
  }

  public confirmResearchMemoryProposal(
    input: ConfirmStoredProposalInput,
  ): Promise<ResearchMemoryEntry> {
    return this.run(() => this.researchMemoryRepository.confirmProposal(input));
  }

  public rejectResearchMemoryProposal(input: {
    readonly workspaceId: string;
    readonly proposalId: string;
    readonly rowVersion: number;
  }): Promise<ResearchMemoryProposal> {
    return this.run(() => this.researchMemoryRepository.rejectProposal(input));
  }

  public recordResearchExport(input: RecordResearchExportInput): Promise<void> {
    return this.run(() => this.researchMemoryRepository.recordExport(input));
  }
  public getLatestResearchExport(
    workspaceId: string,
    ownerType: 'memory' | 'note',
    ownerId: string,
  ) {
    return this.run(() => {
      const r = this.researchMemoryRepository.getLatestExport(workspaceId, ownerType, ownerId);
      return r
        ? {
            id: r.id,
            workspaceId: r.workspace_id,
            ownerType: r.owner_type,
            ownerId: r.owner_id,
            vaultName: r.vault_name,
            relativePath: r.relative_path,
            contentHash: r.content_hash,
            exportedAt: r.exported_at,
          }
        : null;
    });
  }

  public getActiveResearchPlan(workspaceId: string): Promise<ResearchPlan | null> {
    return this.run(() => this.researchPlanRepository.getActive(workspaceId));
  }

  public getResearchPlan(workspaceId: string, planId: string): Promise<ResearchPlan | null> {
    return this.run(() => this.researchPlanRepository.get(workspaceId, planId));
  }

  public createResearchPlan(
    input: Parameters<ResearchPlanDataGateway['createResearchPlan']>[0],
  ): Promise<ResearchPlan> {
    return this.run(() => this.researchPlanRepository.create(input));
  }

  public updateResearchPlan(
    input: Parameters<ResearchPlanDataGateway['updateResearchPlan']>[0],
  ): Promise<ResearchPlan> {
    return this.run(() => this.researchPlanRepository.update(input));
  }

  public retireResearchPlan(
    input: Parameters<ResearchPlanDataGateway['retireResearchPlan']>[0],
  ): Promise<ResearchPlan> {
    return this.run(() => this.researchPlanRepository.retire(input));
  }

  public deleteResearchPlan(workspaceId: string, planId: string): Promise<boolean> {
    return this.run(() => this.researchPlanRepository.delete(workspaceId, planId));
  }

  public createPlanTask(
    input: Parameters<ResearchPlanDataGateway['createPlanTask']>[0],
  ): Promise<ResearchPlan> {
    return this.run(() => this.researchPlanRepository.createTask(input));
  }

  public updatePlanTask(
    input: Parameters<ResearchPlanDataGateway['updatePlanTask']>[0],
  ): Promise<ResearchPlan> {
    return this.run(() => this.researchPlanRepository.updateTask(input));
  }

  public deletePlanTask(
    input: Parameters<ResearchPlanDataGateway['deletePlanTask']>[0],
  ): Promise<ResearchPlan> {
    return this.run(() => this.researchPlanRepository.deleteTask(input));
  }

  public reorderPlanTasks(
    input: Parameters<ResearchPlanDataGateway['reorderPlanTasks']>[0],
  ): Promise<ResearchPlan> {
    return this.run(() => this.researchPlanRepository.reorderTasks(input));
  }

  public setPlanTaskStatus(
    input: Parameters<ResearchPlanDataGateway['setPlanTaskStatus']>[0],
  ): Promise<ResearchPlan> {
    return this.run(() => this.researchPlanRepository.setTaskStatus(input));
  }

  public completePlanTask(
    input: Parameters<ResearchPlanDataGateway['completePlanTask']>[0],
  ): Promise<ResearchPlan> {
    return this.run(() => this.researchPlanRepository.completeTask(input));
  }

  public setPlanDependencies(
    input: Parameters<ResearchPlanDataGateway['setPlanDependencies']>[0],
  ): Promise<ResearchPlan> {
    return this.run(() => this.researchPlanRepository.setDependencies(input));
  }

  public addPlanReference(input: StoredPlanReferenceInput): Promise<ResearchPlan> {
    return this.run(() => this.researchPlanRepository.addReference(input));
  }

  public removePlanReference(
    input: Parameters<ResearchPlanDataGateway['removePlanReference']>[0],
  ): Promise<ResearchPlan> {
    return this.run(() => this.researchPlanRepository.removeReference(input));
  }

  public listResearchPlanHistory(
    workspaceId: string,
    planId: string,
  ): Promise<readonly ResearchPlanHistoryEntry[]> {
    return this.run(() => this.researchPlanRepository.listHistory(workspaceId, planId));
  }

  public createResearchPlanProposal(input: StoredPlanProposalInput): Promise<ResearchPlanProposal> {
    return this.run(() => this.researchPlanRepository.createProposal(input));
  }

  public getResearchPlanProposal(
    workspaceId: string,
    proposalId: string,
  ): Promise<ResearchPlanProposal | null> {
    return this.run(() => this.researchPlanRepository.getProposal(workspaceId, proposalId));
  }

  public updateResearchPlanProposal(
    input: Parameters<ResearchPlanDataGateway['updateResearchPlanProposal']>[0],
  ): Promise<ResearchPlanProposal> {
    return this.run(() => this.researchPlanRepository.updateProposal(input));
  }

  public confirmResearchPlanProposal(
    input: Parameters<ResearchPlanDataGateway['confirmResearchPlanProposal']>[0],
  ): Promise<ResearchPlan> {
    return this.run(() => this.researchPlanRepository.confirmProposal(input));
  }

  public rejectResearchPlanProposal(
    input: Parameters<ResearchPlanDataGateway['rejectResearchPlanProposal']>[0],
  ): Promise<ResearchPlanProposal> {
    return this.run(() => this.researchPlanRepository.rejectProposal(input));
  }

  public listPlanReferences(workspaceId: string, planId: string) {
    return this.run(() => this.researchPlanRepository.listReferences(workspaceId, planId));
  }

  public markInterruptedAgentRuns(completedAt: string): Promise<number> {
    return this.run(() => this.researchAgentRepository.markInterrupted(completedAt));
  }

  public createAgentRun(input: CreateStoredAgentRunInput): Promise<ResearchAgentRun> {
    return this.run(() => this.researchAgentRepository.create(input));
  }

  public appendAgentStep(input: AppendStoredAgentStepInput): Promise<ResearchAgentRun> {
    return this.run(() => this.researchAgentRepository.appendStep(input));
  }

  public updateAgentContextUsage(
    workspaceId: string,
    runId: string,
    contextCharacters: number,
  ): Promise<ResearchAgentRun> {
    return this.run(() =>
      this.researchAgentRepository.updateContextUsage(workspaceId, runId, contextCharacters),
    );
  }

  public completeAgentRun(input: CompleteStoredAgentRunInput): Promise<ResearchAgentRun> {
    return this.run(() => this.researchAgentRepository.complete(input));
  }

  public getAgentRun(workspaceId: string, runId: string): Promise<ResearchAgentRun | null> {
    return this.run(() => this.researchAgentRepository.get(workspaceId, runId));
  }

  public listAgentRuns(workspaceId: string): Promise<readonly ResearchAgentRunSummary[]> {
    return this.run(() => this.researchAgentRepository.list(workspaceId));
  }

  public reviewAgentProposal(
    input: Parameters<ResearchAgentDataGateway['reviewAgentProposal']>[0],
  ): Promise<ResearchAgentProposal> {
    return this.run(() => this.researchAgentRepository.reviewProposal(input));
  }
  public listExperiments(workspaceId: string): Promise<readonly Experiment[]> {
    return this.run(() => this.experimentRepository.list(workspaceId));
  }
  public getExperiment(workspaceId: string, id: string): Promise<Experiment | null> {
    return this.run(() => this.experimentRepository.get(workspaceId, id));
  }
  public createExperiment(input: Parameters<ExperimentDataGateway['createExperiment']>[0]) {
    return this.run(() => this.experimentRepository.create(input));
  }
  public updateExperiment(input: Parameters<ExperimentDataGateway['updateExperiment']>[0]) {
    return this.run(() => this.experimentRepository.update(input));
  }
  public setExperimentStatus(
    w: string,
    id: string,
    s: Parameters<ExperimentDataGateway['setExperimentStatus']>[2],
    v: number,
  ) {
    return this.run(() => this.experimentRepository.status(w, id, s, v));
  }
  public deleteExperiment(w: string, id: string) {
    return this.run(() => this.experimentRepository.delete(w, id));
  }
  public addExperimentRun(i: Parameters<ExperimentDataGateway['addExperimentRun']>[0]) {
    return this.run(() => this.experimentRepository.addRun(i));
  }
  public updateExperimentRun(i: Parameters<ExperimentDataGateway['updateExperimentRun']>[0]) {
    return this.run(() => this.experimentRepository.updateRun(i));
  }
  public deleteExperimentRun(w: string, e: string, r: string) {
    return this.run(() => this.experimentRepository.deleteRun(w, e, r));
  }
  public recordExperimentResult(i: Parameters<ExperimentDataGateway['recordExperimentResult']>[0]) {
    return this.run(() => this.experimentRepository.result(i));
  }
  public createExperimentConclusion(
    w: string,
    e: string,
    r: string | null,
    s: string,
    p: 'manual' | 'ai-proposed-confirmed',
  ) {
    return this.run(() => this.experimentRepository.conclusion(w, e, r, s, p));
  }
  public updateExperimentConclusion(
    w: string,
    e: string,
    id: string,
    s: string,
    status: Parameters<ExperimentDataGateway['updateExperimentConclusion']>[4],
    v: number,
  ) {
    return this.run(() => this.experimentRepository.updateConclusion(w, e, id, s, status, v));
  }
  public createExperimentConclusionProposal(
    i: Parameters<ExperimentDataGateway['createExperimentConclusionProposal']>[0],
  ): Promise<ExperimentConclusionProposal> {
    return this.run(() => this.experimentRepository.createProposal(i));
  }
  public confirmExperimentConclusionProposal(
    i: Parameters<ExperimentDataGateway['confirmExperimentConclusionProposal']>[0],
  ) {
    return this.run(() => this.experimentRepository.confirmProposal(i));
  }
  public rejectExperimentConclusionProposal(w: string, e: string, p: string, v: number) {
    return this.run(() => this.experimentRepository.rejectProposal(w, e, p, v));
  }

  public async backupTo(destinationPath: string): Promise<void> {
    await this.database.backup(destinationPath);
  }

  public async restoreFrom(sourcePath: string): Promise<void> {
    if (path.resolve(sourcePath) === path.resolve(this.databasePath)) {
      throw new LibraryError('INVALID_INPUT', 'The active database cannot restore itself.');
    }

    const suffix = randomUUID();
    const stagedPath = `${this.databasePath}.restore-${suffix}`;
    const previousPath = `${this.databasePath}.previous-${suffix}`;
    await copyFile(sourcePath, stagedPath);

    try {
      const candidate = this.openDatabase(stagedPath);
      try {
        const integrity = candidate.pragma('integrity_check', { simple: true }) as string;
        if (integrity !== 'ok') {
          throw new LibraryError('DATABASE_ERROR', 'The selected backup failed integrity checks.');
        }
        const foreignKeyErrors = candidate.pragma('foreign_key_check') as readonly unknown[];
        if (foreignKeyErrors.length > 0) {
          throw new LibraryError('DATABASE_ERROR', 'The selected backup has broken relationships.');
        }
      } finally {
        candidate.close();
      }

      this.database.pragma('wal_checkpoint(TRUNCATE)');
      this.database.close();
      await rename(this.databasePath, previousPath);
      await rename(stagedPath, this.databasePath);

      try {
        this.database = this.openDatabase(this.databasePath);
        this.repository = new PaperRepository(this.database);
        this.readerRepository = new ReaderRepository(this.database);
        this.aiRepository = new AiRepository(this.database);
        this.workspaceRepository = new WorkspaceRepository(this.database);
        this.repositoryRepository = new RepositoryRepository(this.database);
        this.codeIndexRepository = new CodeIndexRepository(this.database);
        this.questionRepository = new QuestionRepository(this.database);
        this.paperCodeLinkRepository = new PaperCodeLinkRepository(this.database);
        this.knowledgeRepository = new KnowledgeRepository(this.database);
        this.researchChatRepository = new ResearchChatRepository(this.database);
        this.researchMemoryRepository = new ResearchMemoryRepository(this.database);
        this.researchPlanRepository = new ResearchPlanRepository(this.database);
        this.researchAgentRepository = new ResearchAgentRepository(this.database);
        this.experimentRepository = new ExperimentRepository(this.database);
      } catch (error) {
        await rm(this.databasePath, { force: true });
        await rename(previousPath, this.databasePath);
        this.database = this.openDatabase(this.databasePath);
        this.repository = new PaperRepository(this.database);
        this.readerRepository = new ReaderRepository(this.database);
        this.aiRepository = new AiRepository(this.database);
        this.workspaceRepository = new WorkspaceRepository(this.database);
        this.repositoryRepository = new RepositoryRepository(this.database);
        this.codeIndexRepository = new CodeIndexRepository(this.database);
        this.questionRepository = new QuestionRepository(this.database);
        this.paperCodeLinkRepository = new PaperCodeLinkRepository(this.database);
        this.knowledgeRepository = new KnowledgeRepository(this.database);
        this.researchChatRepository = new ResearchChatRepository(this.database);
        this.researchMemoryRepository = new ResearchMemoryRepository(this.database);
        this.researchPlanRepository = new ResearchPlanRepository(this.database);
        this.researchAgentRepository = new ResearchAgentRepository(this.database);
        this.experimentRepository = new ExperimentRepository(this.database);
        throw error;
      }

      await rm(previousPath, { force: true });
    } finally {
      await rm(stagedPath, { force: true });
    }
  }

  public getMigrationVersions(): Promise<readonly number[]> {
    return this.run(() =>
      (
        this.database.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as {
          readonly version: number;
        }[]
      ).map(({ version }) => version),
    );
  }

  public close(): Promise<void> {
    return this.run(() => {
      if (this.database.open) this.database.close();
    });
  }

  private openDatabase(databasePath: string): BetterSqlite3.Database {
    const database = new BetterSqlite3(databasePath);
    database.pragma('foreign_keys = ON');
    database.pragma('busy_timeout = 5000');
    database.pragma('journal_mode = WAL');
    database.pragma('synchronous = NORMAL');
    applyMigrations(database);
    return database;
  }

  private run<T>(operation: () => T): Promise<T> {
    return Promise.resolve().then(operation);
  }
}
