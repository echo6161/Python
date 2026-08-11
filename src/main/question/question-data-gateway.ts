import type {
  AddCodeEvidenceInput,
  ArchiveResearchQuestionInput,
  CreateResearchQuestionInput,
  EvidenceTextAnchor,
  ResearchQuestion,
  SetResearchQuestionStatusInput,
  UpdateResearchQuestionInput,
} from '../../shared/contracts/question';
import type { CodeLanguage, CodeSymbolKind } from '../../shared/contracts/code-intelligence';
import type { ZoteroItemRef } from '../../shared/contracts/zotero';

export interface StoredEvidenceBase {
  readonly id: string;
  readonly questionId: string;
  readonly workspaceId: string;
  readonly note: string;
  readonly sourceSnapshotIdentity: string;
  readonly sortOrder: number;
  readonly createdAt: string;
}

export interface StoredZoteroEvidence extends StoredEvidenceBase {
  readonly kind: 'zotero_paper';
  readonly itemRef: ZoteroItemRef;
  readonly itemVersion: number;
  readonly pageNumber: number | null;
  readonly textAnchor: EvidenceTextAnchor | null;
}

export interface StoredCodeEvidence extends StoredEvidenceBase {
  readonly kind: 'code';
  readonly repositoryId: string;
  readonly language: CodeLanguage;
  readonly relativePath: string;
  readonly symbolKind: CodeSymbolKind | null;
  readonly symbolName: string | null;
  readonly startLine: number;
  readonly endLine: number;
  readonly contentHash: string;
}

export type StoredEvidence = StoredZoteroEvidence | StoredCodeEvidence;

export interface CreateStoredZoteroEvidenceInput {
  readonly workspaceId: string;
  readonly questionId: string;
  readonly itemRef: ZoteroItemRef;
  readonly itemVersion: number;
  readonly pageNumber: number | null;
  readonly textAnchor: EvidenceTextAnchor | null;
  readonly note: string;
  readonly sourceSnapshotIdentity: string;
}

export interface QuestionDataGateway {
  createQuestion(input: CreateResearchQuestionInput): Promise<ResearchQuestion>;
  getQuestion(workspaceId: string, questionId: string): Promise<ResearchQuestion | null>;
  listQuestions(workspaceId: string): Promise<readonly ResearchQuestion[]>;
  updateQuestion(input: UpdateResearchQuestionInput): Promise<ResearchQuestion>;
  setQuestionStatus(input: SetResearchQuestionStatusInput): Promise<ResearchQuestion>;
  archiveQuestion(input: ArchiveResearchQuestionInput): Promise<ResearchQuestion>;
  deleteQuestion(workspaceId: string, questionId: string): Promise<boolean>;
  listEvidence(workspaceId: string, questionId: string): Promise<readonly StoredEvidence[]>;
  addZoteroEvidence(input: CreateStoredZoteroEvidenceInput): Promise<StoredZoteroEvidence>;
  addCodeEvidence(input: AddCodeEvidenceInput): Promise<StoredCodeEvidence>;
  removeEvidence(workspaceId: string, questionId: string, evidenceId: string): Promise<boolean>;
  reorderEvidence(
    workspaceId: string,
    questionId: string,
    evidenceIds: readonly string[],
  ): Promise<void>;
  getEvidence(
    workspaceId: string,
    questionId: string,
    evidenceId: string,
  ): Promise<StoredEvidence | null>;
  codeLocationExists(evidence: StoredCodeEvidence): Promise<boolean>;
}
