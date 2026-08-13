import type { KnowledgeProvenance, KnowledgeSourceType, OpenKnowledgeResult } from './knowledge';
import type { ApiResult } from './library';

export const RESEARCH_MEMORY_IPC_CHANNELS = Object.freeze({
  list: 'research-memory:list',
  get: 'research-memory:get',
  create: 'research-memory:create',
  update: 'research-memory:update',
  delete: 'research-memory:delete',
  searchSources: 'research-memory:search-sources',
  addReference: 'research-memory:add-reference',
  removeReference: 'research-memory:remove-reference',
  openReference: 'research-memory:open-reference',
  createProposal: 'research-memory:create-proposal',
  listProposals: 'research-memory:list-proposals',
  confirmProposal: 'research-memory:confirm-proposal',
  rejectProposal: 'research-memory:reject-proposal',
  prepareExport: 'research-memory:prepare-export',
  confirmExport: 'research-memory:confirm-export',
});

export type ResearchMemoryIpcChannels = typeof RESEARCH_MEMORY_IPC_CHANNELS;
export type ResearchContentType = 'memory' | 'note';
export type WorkspaceNoteStatus = 'active' | 'archived' | 'draft';
export type ResearchMemoryStatus = 'confirmed' | 'draft' | 'retired';
export type ResearchMemoryProposalStatus = 'confirmed' | 'pending' | 'rejected';

export interface ResearchReference {
  readonly id: string;
  readonly workspaceId: string;
  readonly ownerType: ResearchContentType | 'proposal';
  readonly ownerId: string;
  readonly chunkId: string | null;
  readonly sourceType: KnowledgeSourceType;
  readonly title: string;
  readonly citation: string;
  readonly snippet: string;
  readonly provenance: KnowledgeProvenance;
  readonly createdAt: string;
  readonly displayOrder: number;
}

interface ResearchContentBase {
  readonly id: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
  readonly references: readonly ResearchReference[];
}

export interface WorkspaceNote extends ResearchContentBase {
  readonly type: 'note';
  readonly status: WorkspaceNoteStatus;
}

export interface ResearchMemoryEntry extends ResearchContentBase {
  readonly type: 'memory';
  readonly status: ResearchMemoryStatus;
  readonly provenance: 'ai-proposed-confirmed' | 'manual';
  readonly confirmedAt: string | null;
}

export type ResearchContentItem = ResearchMemoryEntry | WorkspaceNote;

export interface ResearchContentSummary {
  readonly id: string;
  readonly type: ResearchContentType;
  readonly title: string;
  readonly status: ResearchMemoryStatus | WorkspaceNoteStatus;
  readonly referenceCount: number;
  readonly updatedAt: string;
}

export interface ListResearchContentInput {
  readonly workspaceId: string;
  readonly query?: string;
  readonly types?: readonly ResearchContentType[];
  readonly statuses?: readonly string[];
}

export interface CreateResearchContentInput {
  readonly workspaceId: string;
  readonly type: ResearchContentType;
  readonly title: string;
  readonly bodyMarkdown: string;
}

export interface UpdateResearchContentInput {
  readonly workspaceId: string;
  readonly type: ResearchContentType;
  readonly id: string;
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly status: ResearchMemoryStatus | WorkspaceNoteStatus;
  readonly rowVersion: number;
}

export interface ResearchContentIdentityInput {
  readonly workspaceId: string;
  readonly type: ResearchContentType;
  readonly id: string;
}

export interface DeleteResearchContentInput extends ResearchContentIdentityInput {
  readonly confirmation: 'DELETE_RESEARCH_CONTENT';
}

export interface AddResearchReferenceInput extends ResearchContentIdentityInput {
  readonly chunkId: string;
}

export interface ResearchReferenceIdentityInput extends ResearchContentIdentityInput {
  readonly referenceId: string;
}

export interface ResearchMemoryProposal {
  readonly id: string;
  readonly workspaceId: string;
  readonly sourceNoteId: string | null;
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly reason: string;
  readonly providerId: 'codex' | 'openai';
  readonly model: string;
  readonly status: ResearchMemoryProposalStatus;
  readonly confirmedMemoryId: string | null;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
  readonly rowVersion: number;
  readonly references: readonly ResearchReference[];
}

export interface CreateResearchMemoryProposalInput {
  readonly workspaceId: string;
  readonly sourceNoteId: string;
  readonly reason: string;
}

export interface ReviewResearchMemoryProposalInput {
  readonly workspaceId: string;
  readonly proposalId: string;
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly rowVersion: number;
}

export interface RejectResearchMemoryProposalInput {
  readonly workspaceId: string;
  readonly proposalId: string;
  readonly rowVersion: number;
}

export interface ResearchMemoryExportPreview {
  readonly id: string;
  readonly item: ResearchContentSummary;
  readonly vaultName: string;
  readonly relativePath: string;
  readonly markdown: string;
  readonly conflict: boolean;
  readonly existingPreview: string | null;
  readonly expiresAt: string;
}

export interface ConfirmResearchMemoryExportInput {
  readonly previewId: string;
  readonly confirmation: 'EXPORT_NEW_FILE';
}

export interface ResearchMemoryExportResult {
  readonly filename: string;
  readonly relativePath: string;
}

export interface ResearchMemoryApi {
  list(input: ListResearchContentInput): Promise<ApiResult<readonly ResearchContentSummary[]>>;
  get(input: ResearchContentIdentityInput): Promise<ApiResult<ResearchContentItem>>;
  create(input: CreateResearchContentInput): Promise<ApiResult<ResearchContentItem>>;
  update(input: UpdateResearchContentInput): Promise<ApiResult<ResearchContentItem>>;
  delete(input: DeleteResearchContentInput): Promise<ApiResult<{ readonly id: string }>>;
  searchSources(input: { readonly workspaceId: string; readonly query: string }): Promise<
    ApiResult<
      readonly {
        readonly chunkId: string;
        readonly sourceType: KnowledgeSourceType;
        readonly title: string;
        readonly citation: string;
        readonly snippet: string;
      }[]
    >
  >;
  addReference(input: AddResearchReferenceInput): Promise<ApiResult<ResearchContentItem>>;
  removeReference(input: ResearchReferenceIdentityInput): Promise<ApiResult<ResearchContentItem>>;
  openReference(input: ResearchReferenceIdentityInput): Promise<ApiResult<OpenKnowledgeResult>>;
  createProposal(
    input: CreateResearchMemoryProposalInput,
  ): Promise<ApiResult<ResearchMemoryProposal>>;
  listProposals(workspaceId: string): Promise<ApiResult<readonly ResearchMemoryProposal[]>>;
  confirmProposal(
    input: ReviewResearchMemoryProposalInput,
  ): Promise<ApiResult<ResearchMemoryEntry>>;
  rejectProposal(
    input: RejectResearchMemoryProposalInput,
  ): Promise<ApiResult<ResearchMemoryProposal>>;
  prepareExport(
    input: ResearchContentIdentityInput,
  ): Promise<ApiResult<ResearchMemoryExportPreview | null>>;
  confirmExport(
    input: ConfirmResearchMemoryExportInput,
  ): Promise<ApiResult<ResearchMemoryExportResult>>;
}
