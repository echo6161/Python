import type { ApiResult } from './library';
import type { CodeLanguage, CodeSymbolKind } from './code-intelligence';
import type { ZoteroItemDetails, ZoteroItemRef, ZoteroPdfAvailability } from './zotero';

export const QUESTION_IPC_CHANNELS = Object.freeze({
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
});

export type QuestionIpcChannels = typeof QUESTION_IPC_CHANNELS;
export type ResearchQuestionStatus =
  'blocked' | 'closed' | 'investigating' | 'understood' | 'unresolved';
export type ResearchQuestionPriority = 'critical' | 'high' | 'low' | 'normal';
export type EvidenceAvailability = 'available' | 'stale' | 'unavailable';

export interface ResearchQuestion {
  readonly id: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly description: string;
  readonly status: ResearchQuestionStatus;
  readonly priority: ResearchQuestionPriority;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
}

export interface CreateResearchQuestionInput {
  readonly workspaceId: string;
  readonly title: string;
  readonly description: string;
  readonly priority: ResearchQuestionPriority;
}

export interface UpdateResearchQuestionInput {
  readonly id: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly description: string;
  readonly priority: ResearchQuestionPriority;
  readonly rowVersion: number;
}

export interface SetResearchQuestionStatusInput {
  readonly id: string;
  readonly workspaceId: string;
  readonly status: ResearchQuestionStatus;
  readonly rowVersion: number;
}

export interface ArchiveResearchQuestionInput {
  readonly id: string;
  readonly workspaceId: string;
  readonly archived: boolean;
  readonly rowVersion: number;
}

export interface EvidenceTextAnchor {
  readonly exact: string;
  readonly prefix: string;
  readonly suffix: string;
}

interface EvidenceBase {
  readonly id: string;
  readonly questionId: string;
  readonly workspaceId: string;
  readonly note: string;
  readonly sourceSnapshotIdentity: string;
  readonly sortOrder: number;
  readonly availability: EvidenceAvailability;
  readonly availabilityReason: string | null;
  readonly createdAt: string;
}

export interface ZoteroEvidenceReference extends EvidenceBase {
  readonly kind: 'zotero_paper';
  readonly itemRef: ZoteroItemRef;
  readonly itemVersion: number;
  readonly pageNumber: number | null;
  readonly textAnchor: EvidenceTextAnchor | null;
  readonly item: ZoteroItemDetails | null;
  readonly pdf: ZoteroPdfAvailability | null;
}

export interface CodeEvidenceReference extends EvidenceBase {
  readonly kind: 'code';
  readonly repositoryId: string;
  readonly repositoryName: string | null;
  readonly language: CodeLanguage;
  readonly relativePath: string;
  readonly symbolKind: CodeSymbolKind | null;
  readonly symbolName: string | null;
  readonly startLine: number;
  readonly endLine: number;
  readonly contentHash: string;
  readonly currentSnapshotIdentity: string | null;
}

export type EvidenceReference = ZoteroEvidenceReference | CodeEvidenceReference;

export interface ResearchQuestionDetails {
  readonly question: ResearchQuestion;
  readonly evidence: readonly EvidenceReference[];
}

export interface AddZoteroEvidenceInput {
  readonly workspaceId: string;
  readonly questionId: string;
  readonly itemRef: ZoteroItemRef;
  readonly pageNumber?: number;
  readonly textAnchor?: EvidenceTextAnchor;
  readonly note: string;
}

export interface AddCodeEvidenceInput {
  readonly workspaceId: string;
  readonly questionId: string;
  readonly repositoryId: string;
  readonly sourceSnapshotIdentity: string;
  readonly language: CodeLanguage;
  readonly relativePath: string;
  readonly symbolKind: CodeSymbolKind | null;
  readonly symbolName: string | null;
  readonly startLine: number;
  readonly endLine: number;
  readonly contentHash: string;
  readonly note: string;
}

export interface EvidenceIdentityInput {
  readonly workspaceId: string;
  readonly questionId: string;
  readonly evidenceId: string;
}

export interface ReorderEvidenceInput {
  readonly workspaceId: string;
  readonly questionId: string;
  readonly evidenceIds: readonly string[];
}

export interface OpenEvidenceResult {
  readonly evidenceId: string;
  readonly opened: boolean;
  readonly target: 'code' | 'zotero_item' | 'zotero_pdf';
  readonly reason: string | null;
}

export interface QuestionApi {
  create(input: CreateResearchQuestionInput): Promise<ApiResult<ResearchQuestion>>;
  get(input: {
    readonly workspaceId: string;
    readonly questionId: string;
  }): Promise<ApiResult<ResearchQuestionDetails>>;
  list(workspaceId: string): Promise<ApiResult<readonly ResearchQuestion[]>>;
  update(input: UpdateResearchQuestionInput): Promise<ApiResult<ResearchQuestion>>;
  setStatus(input: SetResearchQuestionStatusInput): Promise<ApiResult<ResearchQuestion>>;
  archive(input: ArchiveResearchQuestionInput): Promise<ApiResult<ResearchQuestion>>;
  delete(input: {
    readonly workspaceId: string;
    readonly questionId: string;
    readonly confirmation: 'DELETE_QUESTION';
  }): Promise<ApiResult<{ readonly id: string }>>;
  addZoteroEvidence(input: AddZoteroEvidenceInput): Promise<ApiResult<ResearchQuestionDetails>>;
  addCodeEvidence(input: AddCodeEvidenceInput): Promise<ApiResult<ResearchQuestionDetails>>;
  removeEvidence(input: EvidenceIdentityInput): Promise<ApiResult<ResearchQuestionDetails>>;
  reorderEvidence(input: ReorderEvidenceInput): Promise<ApiResult<ResearchQuestionDetails>>;
  openEvidence(input: EvidenceIdentityInput): Promise<ApiResult<OpenEvidenceResult>>;
}
