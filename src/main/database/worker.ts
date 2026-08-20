import { parentPort, workerData } from 'node:worker_threads';

import { LibraryError } from '../library/errors';
import { LibraryDatabase } from './library-database';
import type {
  DatabaseWorkerData,
  DatabaseWorkerRequest,
  DatabaseWorkerResponse,
} from './worker-protocol';

const port = parentPort;
if (!port) {
  throw new Error('Database worker must run inside a worker thread.');
}

const data = workerData as DatabaseWorkerData;
const database = new LibraryDatabase(data.databasePath);
let queue = Promise.resolve();

async function execute(request: DatabaseWorkerRequest): Promise<unknown> {
  switch (request.method) {
    case 'listPapers':
      return database.listPapers(request.payload);
    case 'getPaper':
      return database.getPaper(request.payload.id);
    case 'findPaperByHash':
      return database.findPaperByHash(request.payload.sha256);
    case 'createImportedPaper':
      return database.createImportedPaper(request.payload);
    case 'updatePaperDetails':
      return database.updatePaperDetails(request.payload);
    case 'updatePaperMetadata':
      return database.updatePaperMetadata(request.payload);
    case 'updatePaperOrganization':
      return database.updatePaperOrganization(request.payload);
    case 'batchUpdatePapers':
      return database.batchUpdatePapers(request.payload);
    case 'listOrganization':
      return database.listOrganization();
    case 'createTag':
      return database.createTag(request.payload);
    case 'deleteTag':
      return database.deleteTag(request.payload.id);
    case 'createCollection':
      return database.createCollection(request.payload);
    case 'deleteCollection':
      return database.deleteCollection(request.payload.id);
    case 'listPendingPaperTextExtractions':
      return database.listPendingPaperTextExtractions();
    case 'savePaperTextExtraction':
      return database.savePaperTextExtraction(request.payload);
    case 'removePaperRecord':
      return database.removePaperRecord(request.payload.id);
    case 'getManagedPaperFile':
      return database.getManagedPaperFile(request.payload.paperId);
    case 'listAnnotations':
      return database.listAnnotations(request.payload.paperId);
    case 'createAnnotation':
      return database.createAnnotation(request.payload);
    case 'updateAnnotation':
      return database.updateAnnotation(request.payload);
    case 'deleteAnnotation':
      return database.deleteAnnotation(request.payload.id, request.payload.rowVersion);
    case 'getReadingState':
      return database.getReadingState(request.payload.paperId);
    case 'saveReadingState':
      return database.saveReadingState(request.payload);
    case 'getAiSettings':
      return database.getAiSettings();
    case 'saveAiSettings':
      return database.saveAiSettings(request.payload);
    case 'createAiTurn':
      return database.createAiTurn(request.payload);
    case 'finalizeAiMessage':
      return database.finalizeAiMessage(request.payload);
    case 'getLatestAiConversation':
      return database.getLatestAiConversation(request.payload.paperId);
    case 'getAiConversation':
      return database.getAiConversation(request.payload.conversationId);
    case 'markStaleAiMessages':
      return database.markStaleAiMessages();
    case 'createResearchChatTurn':
      return database.createResearchChatTurn(request.payload);
    case 'finalizeResearchChatMessage':
      return database.finalizeResearchChatMessage(request.payload);
    case 'getLatestResearchChatConversation':
      return database.getLatestResearchChatConversation(
        request.payload.workspaceId,
        request.payload.questionId,
      );
    case 'getResearchChatConversation':
      return database.getResearchChatConversation(
        request.payload.workspaceId,
        request.payload.conversationId,
      );
    case 'getResearchChatTurn':
      return database.getResearchChatTurn(
        request.payload.workspaceId,
        request.payload.conversationId,
        request.payload.assistantMessageId,
      );
    case 'getResearchChatCitationSource':
      return database.getResearchChatCitationSource(
        request.payload.workspaceId,
        request.payload.conversationId,
        request.payload.messageId,
        request.payload.alias,
      );
    case 'markStaleResearchChatMessages':
      return database.markStaleResearchChatMessages();
    case 'createWorkspace':
      return database.createWorkspace(request.payload);
    case 'getWorkspace':
      return database.getWorkspace(request.payload.id);
    case 'listWorkspaces':
      return database.listWorkspaces();
    case 'updateWorkspace':
      return database.updateWorkspace(request.payload);
    case 'setWorkspaceStatus':
      return database.setWorkspaceStatus(request.payload);
    case 'deleteWorkspace':
      return database.deleteWorkspace(request.payload.id);
    case 'getLastActiveWorkspace':
      return database.getLastActiveWorkspace();
    case 'setLastActiveWorkspace':
      return database.setLastActiveWorkspace(request.payload.workspaceId);
    case 'addWorkspaceZoteroPaper':
      return database.addWorkspaceZoteroPaper(request.payload.workspaceId, request.payload.itemRef);
    case 'removeWorkspaceZoteroPaper':
      return database.removeWorkspaceZoteroPaper(
        request.payload.workspaceId,
        request.payload.itemRef,
      );
    case 'listWorkspaceZoteroPapers':
      return database.listWorkspaceZoteroPapers(request.payload.workspaceId);
    case 'createOrUpdateRepository':
      return database.createOrUpdateRepository(request.payload);
    case 'getRepository':
      return database.getRepository(request.payload.id);
    case 'updateRepositoryObservation':
      return database.updateRepositoryObservation(request.payload.id, request.payload.observation);
    case 'addWorkspaceRepository':
      return database.addWorkspaceRepository(
        request.payload.workspaceId,
        request.payload.repositoryId,
      );
    case 'removeWorkspaceRepository':
      return database.removeWorkspaceRepository(
        request.payload.workspaceId,
        request.payload.repositoryId,
      );
    case 'listWorkspaceRepositories':
      return database.listWorkspaceRepositories(request.payload.workspaceId);
    case 'deleteRepository':
      return database.deleteRepository(request.payload.id);
    case 'recoverInterruptedIndexes':
      return database.recoverInterruptedIndexes(request.payload.updatedAt);
    case 'getCodeIndexStatus':
      return database.getCodeIndexStatus(request.payload.repositoryId);
    case 'listCodeFileHashes':
      return database.listCodeFileHashes(request.payload.repositoryId);
    case 'beginCodeIndex':
      return database.beginCodeIndex(
        request.payload.repositoryId,
        request.payload.requestId,
        request.payload.parserVersion,
        request.payload.totalFiles,
        request.payload.startedAt,
      );
    case 'updateCodeIndexProgress':
      return database.updateCodeIndexProgress(
        request.payload.repositoryId,
        request.payload.requestId,
        request.payload.processedFiles,
        request.payload.totalFiles,
        request.payload.updatedAt,
      );
    case 'completeCodeIndex':
      return database.completeCodeIndex(request.payload);
    case 'cancelCodeIndex':
      return database.cancelCodeIndex(request.payload);
    case 'failCodeIndex':
      return database.failCodeIndex(request.payload);
    case 'markCodeIndexStale':
      return database.markCodeIndexStale(request.payload.repositoryId, request.payload.updatedAt);
    case 'searchCodeFiles':
      return database.searchCodeFiles(request.payload);
    case 'searchCodeSymbols':
      return database.searchCodeSymbols(request.payload);
    case 'searchCodeText':
      return database.searchCodeText(request.payload);
    case 'listCodeChunksForKnowledge':
      return database.listCodeChunksForKnowledge(request.payload.repositoryId);
    case 'createQuestion':
      return database.createQuestion(request.payload);
    case 'getQuestion':
      return database.getQuestion(request.payload.workspaceId, request.payload.questionId);
    case 'listQuestions':
      return database.listQuestions(request.payload.workspaceId);
    case 'updateQuestion':
      return database.updateQuestion(request.payload);
    case 'setQuestionStatus':
      return database.setQuestionStatus(request.payload);
    case 'archiveQuestion':
      return database.archiveQuestion(request.payload);
    case 'deleteQuestion':
      return database.deleteQuestion(request.payload.workspaceId, request.payload.questionId);
    case 'listEvidence':
      return database.listEvidence(request.payload.workspaceId, request.payload.questionId);
    case 'addZoteroEvidence':
      return database.addZoteroEvidence(request.payload);
    case 'addCodeEvidence':
      return database.addCodeEvidence(request.payload);
    case 'removeEvidence':
      return database.removeEvidence(
        request.payload.workspaceId,
        request.payload.questionId,
        request.payload.evidenceId,
      );
    case 'reorderEvidence':
      return database.reorderEvidence(
        request.payload.workspaceId,
        request.payload.questionId,
        request.payload.evidenceIds,
      );
    case 'getEvidence':
      return database.getEvidence(
        request.payload.workspaceId,
        request.payload.questionId,
        request.payload.evidenceId,
      );
    case 'codeLocationExists':
      return database.codeLocationExists(request.payload);
    case 'createPaperCodeLink':
      return database.createPaperCodeLink(request.payload);
    case 'getPaperCodeLink':
      return database.getPaperCodeLink(request.payload.workspaceId, request.payload.id);
    case 'listPaperCodeLinks':
      return database.listPaperCodeLinks(request.payload.workspaceId);
    case 'updatePaperCodeLink':
      return database.updatePaperCodeLink(request.payload);
    case 'deletePaperCodeLink':
      return database.deletePaperCodeLink(request.payload.workspaceId, request.payload.id);
    case 'paperCodeLocationExists':
      return database.paperCodeLocationExists(request.payload);
    case 'recoverInterruptedKnowledgeIndexes':
      return database.recoverInterruptedKnowledgeIndexes(request.payload.updatedAt);
    case 'getKnowledgeIndexStatus':
      return database.getKnowledgeIndexStatus(request.payload.workspaceId);
    case 'listKnowledgeSourceFingerprints':
      return database.listKnowledgeSourceFingerprints(request.payload.workspaceId);
    case 'beginKnowledgeIndex':
      return database.beginKnowledgeIndex(request.payload);
    case 'updateKnowledgeIndexProgress':
      return database.updateKnowledgeIndexProgress(request.payload);
    case 'completeKnowledgeIndex':
      return database.completeKnowledgeIndex(request.payload);
    case 'cancelKnowledgeIndex':
      return database.cancelKnowledgeIndex(request.payload);
    case 'failKnowledgeIndex':
      return database.failKnowledgeIndex(request.payload);
    case 'removeKnowledgeIndex':
      return database.removeKnowledgeIndex(request.payload.workspaceId);
    case 'searchKnowledgeKeyword':
      return database.searchKnowledgeKeyword(request.payload);
    case 'listKnowledgeSemanticCandidates':
      return database.listKnowledgeSemanticCandidates(
        request.payload.workspaceId,
        request.payload.sourceTypes,
        request.payload.limit,
      );
    case 'getKnowledgeChunk':
      return database.getKnowledgeChunk(request.payload.workspaceId, request.payload.chunkId);
    case 'listResearchContent':
      return database.listResearchContent(request.payload);
    case 'getResearchContent':
      return database.getResearchContent(request.payload);
    case 'createResearchContent':
      return database.createResearchContent(request.payload);
    case 'updateResearchContent':
      return database.updateResearchContent(request.payload);
    case 'deleteResearchContent':
      return database.deleteResearchContent(request.payload);
    case 'addResearchReference':
      return database.addResearchReference(request.payload);
    case 'removeResearchReference':
      return database.removeResearchReference(request.payload);
    case 'getResearchReference':
      return database.getResearchReference(request.payload);
    case 'createResearchMemoryProposal':
      return database.createResearchMemoryProposal(request.payload);
    case 'listResearchMemoryProposals':
      return database.listResearchMemoryProposals(request.payload.workspaceId);
    case 'getResearchMemoryProposal':
      return database.getResearchMemoryProposal(
        request.payload.workspaceId,
        request.payload.proposalId,
      );
    case 'confirmResearchMemoryProposal':
      return database.confirmResearchMemoryProposal(request.payload);
    case 'rejectResearchMemoryProposal':
      return database.rejectResearchMemoryProposal(request.payload);
    case 'recordResearchExport':
      return database.recordResearchExport(request.payload);
    case 'getLatestResearchExport':
      return database.getLatestResearchExport(
        request.payload.workspaceId,
        request.payload.ownerType,
        request.payload.ownerId,
      );
    case 'getActiveResearchPlan':
      return database.getActiveResearchPlan(request.payload.workspaceId);
    case 'getResearchPlan':
      return database.getResearchPlan(request.payload.workspaceId, request.payload.planId);
    case 'createResearchPlan':
      return database.createResearchPlan(request.payload);
    case 'updateResearchPlan':
      return database.updateResearchPlan(request.payload);
    case 'retireResearchPlan':
      return database.retireResearchPlan(request.payload);
    case 'deleteResearchPlan':
      return database.deleteResearchPlan(request.payload.workspaceId, request.payload.planId);
    case 'createPlanTask':
      return database.createPlanTask(request.payload);
    case 'updatePlanTask':
      return database.updatePlanTask(request.payload);
    case 'deletePlanTask':
      return database.deletePlanTask(request.payload);
    case 'reorderPlanTasks':
      return database.reorderPlanTasks(request.payload);
    case 'setPlanTaskStatus':
      return database.setPlanTaskStatus(request.payload);
    case 'completePlanTask':
      return database.completePlanTask(request.payload);
    case 'setPlanDependencies':
      return database.setPlanDependencies(request.payload);
    case 'addPlanReference':
      return database.addPlanReference(request.payload);
    case 'removePlanReference':
      return database.removePlanReference(request.payload);
    case 'listResearchPlanHistory':
      return database.listResearchPlanHistory(request.payload.workspaceId, request.payload.planId);
    case 'createResearchPlanProposal':
      return database.createResearchPlanProposal(request.payload);
    case 'getResearchPlanProposal':
      return database.getResearchPlanProposal(
        request.payload.workspaceId,
        request.payload.proposalId,
      );
    case 'updateResearchPlanProposal':
      return database.updateResearchPlanProposal(request.payload);
    case 'confirmResearchPlanProposal':
      return database.confirmResearchPlanProposal(request.payload);
    case 'rejectResearchPlanProposal':
      return database.rejectResearchPlanProposal(request.payload);
    case 'listPlanReferences':
      return database.listPlanReferences(request.payload.workspaceId, request.payload.planId);
    case 'markInterruptedAgentRuns':
      return database.markInterruptedAgentRuns(request.payload.completedAt);
    case 'createAgentRun':
      return database.createAgentRun(request.payload);
    case 'appendAgentStep':
      return database.appendAgentStep(request.payload);
    case 'updateAgentContextUsage':
      return database.updateAgentContextUsage(
        request.payload.workspaceId,
        request.payload.runId,
        request.payload.contextCharacters,
      );
    case 'completeAgentRun':
      return database.completeAgentRun(request.payload);
    case 'getAgentRun':
      return database.getAgentRun(request.payload.workspaceId, request.payload.runId);
    case 'listAgentRuns':
      return database.listAgentRuns(request.payload.workspaceId);
    case 'reviewAgentProposal':
      return database.reviewAgentProposal(request.payload);
    case 'listExperiments':
      return database.listExperiments(request.payload.workspaceId);
    case 'getExperiment':
      return database.getExperiment(request.payload.workspaceId, request.payload.id);
    case 'createExperiment':
      return database.createExperiment(request.payload);
    case 'updateExperiment':
      return database.updateExperiment(request.payload);
    case 'setExperimentStatus':
      return database.setExperimentStatus(
        request.payload.workspaceId,
        request.payload.id,
        request.payload.status,
        request.payload.rowVersion,
      );
    case 'deleteExperiment':
      return database.deleteExperiment(request.payload.workspaceId, request.payload.id);
    case 'addExperimentRun':
      return database.addExperimentRun(request.payload);
    case 'updateExperimentRun':
      return database.updateExperimentRun(request.payload);
    case 'deleteExperimentRun':
      return database.deleteExperimentRun(
        request.payload.workspaceId,
        request.payload.experimentId,
        request.payload.runId,
      );
    case 'recordExperimentResult':
      return database.recordExperimentResult(request.payload);
    case 'createExperimentConclusion':
      return database.createExperimentConclusion(
        request.payload.workspaceId,
        request.payload.experimentId,
        request.payload.resultId,
        request.payload.statement,
        request.payload.provenance,
      );
    case 'updateExperimentConclusion':
      return database.updateExperimentConclusion(
        request.payload.workspaceId,
        request.payload.experimentId,
        request.payload.conclusionId,
        request.payload.statement,
        request.payload.status,
        request.payload.rowVersion,
      );
    case 'createExperimentConclusionProposal':
      return database.createExperimentConclusionProposal(request.payload);
    case 'confirmExperimentConclusionProposal':
      return database.confirmExperimentConclusionProposal(request.payload);
    case 'rejectExperimentConclusionProposal':
      return database.rejectExperimentConclusionProposal(
        request.payload.workspaceId,
        request.payload.experimentId,
        request.payload.proposalId,
        request.payload.rowVersion,
      );
    case 'backupTo':
      return database.backupTo(request.payload.destinationPath);
    case 'restoreFrom':
      return database.restoreFrom(request.payload.sourcePath);
    case 'getMigrationVersions':
      return database.getMigrationVersions();
    case 'close':
      return database.close();
  }
}

port.on('message', (request: DatabaseWorkerRequest) => {
  queue = queue.then(async () => {
    try {
      const value = await execute(request);
      const response: DatabaseWorkerResponse = { id: request.id, ok: true, value };
      port.postMessage(response);
    } catch (error) {
      const code = error instanceof LibraryError ? error.code : undefined;
      const response: DatabaseWorkerResponse = {
        id: request.id,
        ok: false,
        error: {
          ...(code ? { code } : {}),
          message:
            error instanceof LibraryError
              ? error.message
              : 'The database worker could not complete the operation.',
        },
      };
      port.postMessage(response);
    }
  });
});
