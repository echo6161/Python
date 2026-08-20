import type {
  BatchPaperUpdate,
  CreateCollectionInput,
  CreateTagInput,
  PaperDetailsUpdate,
  PaperListQuery,
  PaperMetadataUpdate,
  PaperOrganizationUpdate,
} from '../../shared/contracts/library';
import type {
  CreateAnnotationInput,
  SaveReadingStateInput,
  UpdateAnnotationInput,
} from '../../shared/contracts/reader';
import type { AiProviderSettings } from '../../shared/contracts/ai';
import type { RepositoryObservationInput } from '../repository/repository-data-gateway';
import type {
  CodeIndexFailureInput,
  CompleteCodeIndexInput,
} from '../code-intelligence/code-index-data-gateway';
import type { CodeSearchInput } from '../../shared/contracts/code-intelligence';
import type {
  CreateWorkspaceInput,
  SetWorkspaceStatusInput,
  UpdateWorkspaceInput,
} from '../../shared/contracts/workspace';
import type { ZoteroItemRef } from '../../shared/contracts/zotero';
import type { CreateAiTurnInput, FinalizeAiMessageInput } from '../ai/ai-data-gateway';
import type { ImportedPaperRecord, PaperTextExtractionRecord } from '../library/paper-data-gateway';
import type {
  AddCodeEvidenceInput,
  ArchiveResearchQuestionInput,
  CreateResearchQuestionInput,
  SetResearchQuestionStatusInput,
  UpdateResearchQuestionInput,
} from '../../shared/contracts/question';
import type {
  CreateStoredZoteroEvidenceInput,
  StoredCodeEvidence,
} from '../question/question-data-gateway';
import type {
  CreateStoredPaperCodeLinkInput,
  StoredPaperCodeLink,
} from '../paper-code-link/paper-code-link-data-gateway';
import type { UpdatePaperCodeLinkInput } from '../../shared/contracts/paper-code-link';
import type { KnowledgeSourceType } from '../../shared/contracts/knowledge';
import type {
  BeginKnowledgeIndexInput,
  CompleteKnowledgeIndexInput,
  KnowledgeIndexFailureInput,
  KnowledgeKeywordSearchInput,
  UpdateKnowledgeIndexProgressInput,
} from '../knowledge/knowledge-data-gateway';
import type {
  CreateResearchChatTurnInput,
  FinalizeResearchChatMessageInput,
} from '../research-chat/research-chat-data-gateway';
import type {
  ConfirmStoredProposalInput,
  CreateStoredProposalInput,
  RecordResearchExportInput,
  StoredResearchReferenceInput,
} from '../research-memory/research-memory-data-gateway';
import type {
  CreateResearchContentInput,
  ListResearchContentInput,
  ResearchContentIdentityInput,
  UpdateResearchContentInput,
} from '../../shared/contracts/research-memory';
import type {
  CreatePlanTaskInput,
  CreateResearchPlanInput,
  PlanTaskIdentityInput,
  SetPlanDependenciesInput,
  UpdatePlanTaskInput,
  UpdateResearchPlanInput,
} from '../../shared/contracts/research-plan';
import type {
  StoredPlanProposalInput,
  StoredPlanReferenceInput,
} from '../research-plan/research-plan-data-gateway';
import type {
  AppendStoredAgentStepInput,
  CompleteStoredAgentRunInput,
  CreateStoredAgentRunInput,
  ResearchAgentDataGateway,
} from '../research-agent/research-agent-data-gateway';

export type DatabaseWorkerRequest =
  | { readonly id: number; readonly method: 'listPapers'; readonly payload: PaperListQuery }
  | { readonly id: number; readonly method: 'getPaper'; readonly payload: { readonly id: string } }
  | {
      readonly id: number;
      readonly method: 'findPaperByHash';
      readonly payload: { readonly sha256: string };
    }
  | {
      readonly id: number;
      readonly method: 'createImportedPaper';
      readonly payload: ImportedPaperRecord;
    }
  | {
      readonly id: number;
      readonly method: 'updatePaperDetails';
      readonly payload: PaperDetailsUpdate;
    }
  | {
      readonly id: number;
      readonly method: 'updatePaperMetadata';
      readonly payload: PaperMetadataUpdate;
    }
  | {
      readonly id: number;
      readonly method: 'updatePaperOrganization';
      readonly payload: PaperOrganizationUpdate;
    }
  | {
      readonly id: number;
      readonly method: 'batchUpdatePapers';
      readonly payload: BatchPaperUpdate;
    }
  | { readonly id: number; readonly method: 'listOrganization'; readonly payload: null }
  | { readonly id: number; readonly method: 'createTag'; readonly payload: CreateTagInput }
  | { readonly id: number; readonly method: 'deleteTag'; readonly payload: { readonly id: string } }
  | {
      readonly id: number;
      readonly method: 'createCollection';
      readonly payload: CreateCollectionInput;
    }
  | {
      readonly id: number;
      readonly method: 'deleteCollection';
      readonly payload: { readonly id: string };
    }
  | {
      readonly id: number;
      readonly method: 'listPendingPaperTextExtractions';
      readonly payload: null;
    }
  | {
      readonly id: number;
      readonly method: 'savePaperTextExtraction';
      readonly payload: PaperTextExtractionRecord;
    }
  | {
      readonly id: number;
      readonly method: 'removePaperRecord';
      readonly payload: { readonly id: string };
    }
  | {
      readonly id: number;
      readonly method: 'getManagedPaperFile';
      readonly payload: { readonly paperId: string };
    }
  | {
      readonly id: number;
      readonly method: 'listAnnotations';
      readonly payload: { readonly paperId: string };
    }
  | {
      readonly id: number;
      readonly method: 'createAnnotation';
      readonly payload: CreateAnnotationInput;
    }
  | {
      readonly id: number;
      readonly method: 'updateAnnotation';
      readonly payload: UpdateAnnotationInput;
    }
  | {
      readonly id: number;
      readonly method: 'deleteAnnotation';
      readonly payload: { readonly id: string; readonly rowVersion: number };
    }
  | {
      readonly id: number;
      readonly method: 'getReadingState';
      readonly payload: { readonly paperId: string };
    }
  | {
      readonly id: number;
      readonly method: 'saveReadingState';
      readonly payload: SaveReadingStateInput;
    }
  | { readonly id: number; readonly method: 'getAiSettings'; readonly payload: null }
  | {
      readonly id: number;
      readonly method: 'saveAiSettings';
      readonly payload: AiProviderSettings;
    }
  | {
      readonly id: number;
      readonly method: 'createAiTurn';
      readonly payload: CreateAiTurnInput;
    }
  | {
      readonly id: number;
      readonly method: 'finalizeAiMessage';
      readonly payload: FinalizeAiMessageInput;
    }
  | {
      readonly id: number;
      readonly method: 'getLatestAiConversation';
      readonly payload: { readonly paperId: string };
    }
  | {
      readonly id: number;
      readonly method: 'getAiConversation';
      readonly payload: { readonly conversationId: string };
    }
  | { readonly id: number; readonly method: 'markStaleAiMessages'; readonly payload: null }
  | {
      readonly id: number;
      readonly method: 'createResearchChatTurn';
      readonly payload: CreateResearchChatTurnInput;
    }
  | {
      readonly id: number;
      readonly method: 'finalizeResearchChatMessage';
      readonly payload: FinalizeResearchChatMessageInput;
    }
  | {
      readonly id: number;
      readonly method: 'getLatestResearchChatConversation';
      readonly payload: { readonly workspaceId: string; readonly questionId: string | null };
    }
  | {
      readonly id: number;
      readonly method: 'getResearchChatConversation';
      readonly payload: { readonly workspaceId: string; readonly conversationId: string };
    }
  | {
      readonly id: number;
      readonly method: 'getResearchChatTurn';
      readonly payload: {
        readonly workspaceId: string;
        readonly conversationId: string;
        readonly assistantMessageId: string;
      };
    }
  | {
      readonly id: number;
      readonly method: 'getResearchChatCitationSource';
      readonly payload: {
        readonly workspaceId: string;
        readonly conversationId: string;
        readonly messageId: string;
        readonly alias: string;
      };
    }
  | {
      readonly id: number;
      readonly method: 'markStaleResearchChatMessages';
      readonly payload: null;
    }
  | {
      readonly id: number;
      readonly method: 'createWorkspace';
      readonly payload: CreateWorkspaceInput;
    }
  | {
      readonly id: number;
      readonly method: 'getWorkspace';
      readonly payload: { readonly id: string };
    }
  | { readonly id: number; readonly method: 'listWorkspaces'; readonly payload: null }
  | {
      readonly id: number;
      readonly method: 'updateWorkspace';
      readonly payload: UpdateWorkspaceInput;
    }
  | {
      readonly id: number;
      readonly method: 'setWorkspaceStatus';
      readonly payload: SetWorkspaceStatusInput;
    }
  | {
      readonly id: number;
      readonly method: 'deleteWorkspace';
      readonly payload: { readonly id: string };
    }
  | { readonly id: number; readonly method: 'getLastActiveWorkspace'; readonly payload: null }
  | {
      readonly id: number;
      readonly method: 'setLastActiveWorkspace';
      readonly payload: { readonly workspaceId: string | null };
    }
  | {
      readonly id: number;
      readonly method: 'addWorkspaceZoteroPaper';
      readonly payload: { readonly workspaceId: string; readonly itemRef: ZoteroItemRef };
    }
  | {
      readonly id: number;
      readonly method: 'removeWorkspaceZoteroPaper';
      readonly payload: { readonly workspaceId: string; readonly itemRef: ZoteroItemRef };
    }
  | {
      readonly id: number;
      readonly method: 'listWorkspaceZoteroPapers';
      readonly payload: { readonly workspaceId: string };
    }
  | {
      readonly id: number;
      readonly method: 'createOrUpdateRepository';
      readonly payload: RepositoryObservationInput;
    }
  | {
      readonly id: number;
      readonly method: 'getRepository';
      readonly payload: { readonly id: string };
    }
  | {
      readonly id: number;
      readonly method: 'updateRepositoryObservation';
      readonly payload: {
        readonly id: string;
        readonly observation: Omit<
          RepositoryObservationInput,
          'canonicalKey' | 'canonicalRoot' | 'displayName'
        >;
      };
    }
  | {
      readonly id: number;
      readonly method: 'addWorkspaceRepository';
      readonly payload: { readonly workspaceId: string; readonly repositoryId: string };
    }
  | {
      readonly id: number;
      readonly method: 'removeWorkspaceRepository';
      readonly payload: { readonly workspaceId: string; readonly repositoryId: string };
    }
  | {
      readonly id: number;
      readonly method: 'listWorkspaceRepositories';
      readonly payload: { readonly workspaceId: string };
    }
  | {
      readonly id: number;
      readonly method: 'deleteRepository';
      readonly payload: { readonly id: string };
    }
  | {
      readonly id: number;
      readonly method: 'recoverInterruptedIndexes';
      readonly payload: { readonly updatedAt: string };
    }
  | {
      readonly id: number;
      readonly method: 'getCodeIndexStatus';
      readonly payload: { readonly repositoryId: string };
    }
  | {
      readonly id: number;
      readonly method: 'listCodeFileHashes';
      readonly payload: { readonly repositoryId: string };
    }
  | {
      readonly id: number;
      readonly method: 'beginCodeIndex';
      readonly payload: {
        readonly repositoryId: string;
        readonly requestId: string;
        readonly parserVersion: string;
        readonly totalFiles: number;
        readonly startedAt: string;
      };
    }
  | {
      readonly id: number;
      readonly method: 'updateCodeIndexProgress';
      readonly payload: {
        readonly repositoryId: string;
        readonly requestId: string;
        readonly processedFiles: number;
        readonly totalFiles: number;
        readonly updatedAt: string;
      };
    }
  | {
      readonly id: number;
      readonly method: 'completeCodeIndex';
      readonly payload: CompleteCodeIndexInput;
    }
  | {
      readonly id: number;
      readonly method: 'cancelCodeIndex';
      readonly payload: CodeIndexFailureInput;
    }
  | {
      readonly id: number;
      readonly method: 'failCodeIndex';
      readonly payload: CodeIndexFailureInput;
    }
  | {
      readonly id: number;
      readonly method: 'markCodeIndexStale';
      readonly payload: { readonly repositoryId: string; readonly updatedAt: string };
    }
  | { readonly id: number; readonly method: 'searchCodeFiles'; readonly payload: CodeSearchInput }
  | { readonly id: number; readonly method: 'searchCodeSymbols'; readonly payload: CodeSearchInput }
  | { readonly id: number; readonly method: 'searchCodeText'; readonly payload: CodeSearchInput }
  | {
      readonly id: number;
      readonly method: 'listCodeChunksForKnowledge';
      readonly payload: { readonly repositoryId: string };
    }
  | {
      readonly id: number;
      readonly method: 'createQuestion';
      readonly payload: CreateResearchQuestionInput;
    }
  | {
      readonly id: number;
      readonly method: 'getQuestion';
      readonly payload: { readonly workspaceId: string; readonly questionId: string };
    }
  | {
      readonly id: number;
      readonly method: 'listQuestions';
      readonly payload: { readonly workspaceId: string };
    }
  | {
      readonly id: number;
      readonly method: 'updateQuestion';
      readonly payload: UpdateResearchQuestionInput;
    }
  | {
      readonly id: number;
      readonly method: 'setQuestionStatus';
      readonly payload: SetResearchQuestionStatusInput;
    }
  | {
      readonly id: number;
      readonly method: 'archiveQuestion';
      readonly payload: ArchiveResearchQuestionInput;
    }
  | {
      readonly id: number;
      readonly method: 'deleteQuestion';
      readonly payload: { readonly workspaceId: string; readonly questionId: string };
    }
  | {
      readonly id: number;
      readonly method: 'listEvidence';
      readonly payload: { readonly workspaceId: string; readonly questionId: string };
    }
  | {
      readonly id: number;
      readonly method: 'addZoteroEvidence';
      readonly payload: CreateStoredZoteroEvidenceInput;
    }
  | {
      readonly id: number;
      readonly method: 'addCodeEvidence';
      readonly payload: AddCodeEvidenceInput;
    }
  | {
      readonly id: number;
      readonly method: 'removeEvidence';
      readonly payload: {
        readonly questionId: string;
        readonly workspaceId: string;
        readonly evidenceId: string;
      };
    }
  | {
      readonly id: number;
      readonly method: 'reorderEvidence';
      readonly payload: {
        readonly questionId: string;
        readonly workspaceId: string;
        readonly evidenceIds: readonly string[];
      };
    }
  | {
      readonly id: number;
      readonly method: 'getEvidence';
      readonly payload: {
        readonly workspaceId: string;
        readonly questionId: string;
        readonly evidenceId: string;
      };
    }
  | {
      readonly id: number;
      readonly method: 'codeLocationExists';
      readonly payload: StoredCodeEvidence;
    }
  | {
      readonly id: number;
      readonly method: 'createPaperCodeLink';
      readonly payload: CreateStoredPaperCodeLinkInput;
    }
  | {
      readonly id: number;
      readonly method: 'getPaperCodeLink';
      readonly payload: { readonly workspaceId: string; readonly id: string };
    }
  | {
      readonly id: number;
      readonly method: 'listPaperCodeLinks';
      readonly payload: { readonly workspaceId: string };
    }
  | {
      readonly id: number;
      readonly method: 'updatePaperCodeLink';
      readonly payload: UpdatePaperCodeLinkInput;
    }
  | {
      readonly id: number;
      readonly method: 'deletePaperCodeLink';
      readonly payload: { readonly workspaceId: string; readonly id: string };
    }
  | {
      readonly id: number;
      readonly method: 'paperCodeLocationExists';
      readonly payload: StoredPaperCodeLink;
    }
  | {
      readonly id: number;
      readonly method: 'recoverInterruptedKnowledgeIndexes';
      readonly payload: { readonly updatedAt: string };
    }
  | {
      readonly id: number;
      readonly method: 'getKnowledgeIndexStatus';
      readonly payload: { readonly workspaceId: string };
    }
  | {
      readonly id: number;
      readonly method: 'listKnowledgeSourceFingerprints';
      readonly payload: { readonly workspaceId: string };
    }
  | {
      readonly id: number;
      readonly method: 'beginKnowledgeIndex';
      readonly payload: BeginKnowledgeIndexInput;
    }
  | {
      readonly id: number;
      readonly method: 'updateKnowledgeIndexProgress';
      readonly payload: UpdateKnowledgeIndexProgressInput;
    }
  | {
      readonly id: number;
      readonly method: 'completeKnowledgeIndex';
      readonly payload: CompleteKnowledgeIndexInput;
    }
  | {
      readonly id: number;
      readonly method: 'cancelKnowledgeIndex';
      readonly payload: KnowledgeIndexFailureInput;
    }
  | {
      readonly id: number;
      readonly method: 'failKnowledgeIndex';
      readonly payload: KnowledgeIndexFailureInput;
    }
  | {
      readonly id: number;
      readonly method: 'removeKnowledgeIndex';
      readonly payload: { readonly workspaceId: string };
    }
  | {
      readonly id: number;
      readonly method: 'searchKnowledgeKeyword';
      readonly payload: KnowledgeKeywordSearchInput;
    }
  | {
      readonly id: number;
      readonly method: 'listKnowledgeSemanticCandidates';
      readonly payload: {
        readonly workspaceId: string;
        readonly sourceTypes: readonly KnowledgeSourceType[];
        readonly limit: number;
      };
    }
  | {
      readonly id: number;
      readonly method: 'getKnowledgeChunk';
      readonly payload: { readonly workspaceId: string; readonly chunkId: string };
    }
  | {
      readonly id: number;
      readonly method: 'listResearchContent';
      readonly payload: ListResearchContentInput;
    }
  | {
      readonly id: number;
      readonly method: 'getResearchContent';
      readonly payload: ResearchContentIdentityInput;
    }
  | {
      readonly id: number;
      readonly method: 'createResearchContent';
      readonly payload: CreateResearchContentInput;
    }
  | {
      readonly id: number;
      readonly method: 'updateResearchContent';
      readonly payload: UpdateResearchContentInput;
    }
  | {
      readonly id: number;
      readonly method: 'deleteResearchContent';
      readonly payload: ResearchContentIdentityInput;
    }
  | {
      readonly id: number;
      readonly method: 'addResearchReference';
      readonly payload: StoredResearchReferenceInput;
    }
  | {
      readonly id: number;
      readonly method: 'removeResearchReference' | 'getResearchReference';
      readonly payload: {
        readonly workspaceId: string;
        readonly ownerType: 'memory' | 'note';
        readonly ownerId: string;
        readonly referenceId: string;
      };
    }
  | {
      readonly id: number;
      readonly method: 'createResearchMemoryProposal';
      readonly payload: CreateStoredProposalInput;
    }
  | {
      readonly id: number;
      readonly method: 'listResearchMemoryProposals';
      readonly payload: { readonly workspaceId: string };
    }
  | {
      readonly id: number;
      readonly method: 'getResearchMemoryProposal';
      readonly payload: { readonly workspaceId: string; readonly proposalId: string };
    }
  | {
      readonly id: number;
      readonly method: 'confirmResearchMemoryProposal';
      readonly payload: ConfirmStoredProposalInput;
    }
  | {
      readonly id: number;
      readonly method: 'rejectResearchMemoryProposal';
      readonly payload: {
        readonly workspaceId: string;
        readonly proposalId: string;
        readonly rowVersion: number;
      };
    }
  | {
      readonly id: number;
      readonly method: 'recordResearchExport';
      readonly payload: RecordResearchExportInput;
    }
  | {
      readonly id: number;
      readonly method: 'getActiveResearchPlan';
      readonly payload: { readonly workspaceId: string };
    }
  | {
      readonly id: number;
      readonly method: 'getResearchPlan';
      readonly payload: { readonly workspaceId: string; readonly planId: string };
    }
  | {
      readonly id: number;
      readonly method: 'createResearchPlan';
      readonly payload: CreateResearchPlanInput;
    }
  | {
      readonly id: number;
      readonly method: 'updateResearchPlan';
      readonly payload: UpdateResearchPlanInput;
    }
  | {
      readonly id: number;
      readonly method: 'retireResearchPlan';
      readonly payload: {
        readonly workspaceId: string;
        readonly planId: string;
        readonly rowVersion: number;
      };
    }
  | {
      readonly id: number;
      readonly method: 'deleteResearchPlan';
      readonly payload: { readonly workspaceId: string; readonly planId: string };
    }
  | {
      readonly id: number;
      readonly method: 'createPlanTask';
      readonly payload: CreatePlanTaskInput;
    }
  | {
      readonly id: number;
      readonly method: 'updatePlanTask';
      readonly payload: UpdatePlanTaskInput;
    }
  | {
      readonly id: number;
      readonly method: 'deletePlanTask';
      readonly payload: PlanTaskIdentityInput;
    }
  | {
      readonly id: number;
      readonly method: 'reorderPlanTasks';
      readonly payload: {
        readonly workspaceId: string;
        readonly planId: string;
        readonly taskIds: readonly string[];
      };
    }
  | {
      readonly id: number;
      readonly method: 'setPlanTaskStatus';
      readonly payload: PlanTaskIdentityInput & {
        readonly status: string;
        readonly blockedReason: string | null;
        readonly rowVersion: number;
      };
    }
  | {
      readonly id: number;
      readonly method: 'completePlanTask';
      readonly payload: PlanTaskIdentityInput & {
        readonly completionNote: string;
        readonly evidenceReferenceIds: readonly string[];
        readonly rowVersion: number;
      };
    }
  | {
      readonly id: number;
      readonly method: 'setPlanDependencies';
      readonly payload: SetPlanDependenciesInput;
    }
  | {
      readonly id: number;
      readonly method: 'addPlanReference';
      readonly payload: StoredPlanReferenceInput;
    }
  | {
      readonly id: number;
      readonly method: 'removePlanReference';
      readonly payload: PlanTaskIdentityInput & { readonly referenceId: string };
    }
  | {
      readonly id: number;
      readonly method: 'listResearchPlanHistory';
      readonly payload: { readonly workspaceId: string; readonly planId: string };
    }
  | {
      readonly id: number;
      readonly method: 'createResearchPlanProposal';
      readonly payload: StoredPlanProposalInput;
    }
  | {
      readonly id: number;
      readonly method: 'getResearchPlanProposal';
      readonly payload: { readonly workspaceId: string; readonly proposalId: string };
    }
  | {
      readonly id: number;
      readonly method: 'updateResearchPlanProposal';
      readonly payload: {
        readonly workspaceId: string;
        readonly proposalId: string;
        readonly goal: string;
        readonly rationale: string;
        readonly changesJson: string;
        readonly rowVersion: number;
      };
    }
  | {
      readonly id: number;
      readonly method: 'confirmResearchPlanProposal' | 'rejectResearchPlanProposal';
      readonly payload: {
        readonly workspaceId: string;
        readonly proposalId: string;
        readonly rowVersion: number;
      };
    }
  | {
      readonly id: number;
      readonly method: 'listPlanReferences';
      readonly payload: { readonly workspaceId: string; readonly planId: string };
    }
  | {
      readonly id: number;
      readonly method: 'markInterruptedAgentRuns';
      readonly payload: { readonly completedAt: string };
    }
  | {
      readonly id: number;
      readonly method: 'createAgentRun';
      readonly payload: CreateStoredAgentRunInput;
    }
  | {
      readonly id: number;
      readonly method: 'appendAgentStep';
      readonly payload: AppendStoredAgentStepInput;
    }
  | {
      readonly id: number;
      readonly method: 'updateAgentContextUsage';
      readonly payload: {
        readonly workspaceId: string;
        readonly runId: string;
        readonly contextCharacters: number;
      };
    }
  | {
      readonly id: number;
      readonly method: 'completeAgentRun';
      readonly payload: CompleteStoredAgentRunInput;
    }
  | {
      readonly id: number;
      readonly method: 'getAgentRun';
      readonly payload: { readonly workspaceId: string; readonly runId: string };
    }
  | {
      readonly id: number;
      readonly method: 'listAgentRuns';
      readonly payload: { readonly workspaceId: string };
    }
  | {
      readonly id: number;
      readonly method: 'reviewAgentProposal';
      readonly payload: Parameters<ResearchAgentDataGateway['reviewAgentProposal']>[0];
    }
  | {
      readonly id: number;
      readonly method: 'backupTo';
      readonly payload: { readonly destinationPath: string };
    }
  | {
      readonly id: number;
      readonly method: 'restoreFrom';
      readonly payload: { readonly sourcePath: string };
    }
  | { readonly id: number; readonly method: 'getMigrationVersions'; readonly payload: null }
  | { readonly id: number; readonly method: 'close'; readonly payload: null };

export type DatabaseWorkerResponse =
  | { readonly id: number; readonly ok: true; readonly value: unknown }
  | {
      readonly id: number;
      readonly ok: false;
      readonly error: { readonly code?: string; readonly message: string };
    };

export interface DatabaseWorkerData {
  readonly databasePath: string;
}
