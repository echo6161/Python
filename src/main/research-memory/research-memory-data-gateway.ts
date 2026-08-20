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

export interface StoredResearchReferenceInput {
  readonly id: string;
  readonly workspaceId: string;
  readonly ownerType: 'memory' | 'note' | 'proposal';
  readonly ownerId: string;
  readonly chunkId: string | null;
  readonly sourceType: 'code' | 'link' | 'paper' | 'question';
  readonly title: string;
  readonly citation: string;
  readonly snippet: string;
  readonly provenanceJson: string;
  readonly createdAt: string;
}

export interface CreateStoredProposalInput {
  readonly id: string;
  readonly workspaceId: string;
  readonly sourceNoteId: string | null;
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly reason: string;
  readonly providerId: 'codex' | 'openai';
  readonly model: string;
  readonly createdAt: string;
}

export interface ConfirmStoredProposalInput {
  readonly workspaceId: string;
  readonly proposalId: string;
  readonly title: string;
  readonly bodyMarkdown: string;
  readonly rowVersion: number;
}

export interface RecordResearchExportInput {
  readonly id: string;
  readonly workspaceId: string;
  readonly ownerType: 'memory' | 'note';
  readonly ownerId: string;
  readonly vaultName: string;
  readonly relativePath: string;
  readonly contentHash: string;
  readonly exportedAt: string;
}

export interface ResearchMemoryDataGateway {
  listResearchContent(input: ListResearchContentInput): Promise<readonly ResearchContentSummary[]>;
  getResearchContent(input: ResearchContentIdentityInput): Promise<ResearchContentItem | null>;
  createResearchContent(input: CreateResearchContentInput): Promise<ResearchContentItem>;
  updateResearchContent(input: UpdateResearchContentInput): Promise<ResearchContentItem>;
  deleteResearchContent(input: ResearchContentIdentityInput): Promise<boolean>;
  addResearchReference(input: StoredResearchReferenceInput): Promise<ResearchReference>;
  removeResearchReference(input: {
    readonly workspaceId: string;
    readonly ownerType: 'memory' | 'note';
    readonly ownerId: string;
    readonly referenceId: string;
  }): Promise<boolean>;
  getResearchReference(input: {
    readonly workspaceId: string;
    readonly ownerType: 'memory' | 'note';
    readonly ownerId: string;
    readonly referenceId: string;
  }): Promise<ResearchReference | null>;
  createResearchMemoryProposal(input: CreateStoredProposalInput): Promise<ResearchMemoryProposal>;
  listResearchMemoryProposals(workspaceId: string): Promise<readonly ResearchMemoryProposal[]>;
  getResearchMemoryProposal(
    workspaceId: string,
    proposalId: string,
  ): Promise<ResearchMemoryProposal | null>;
  confirmResearchMemoryProposal(input: ConfirmStoredProposalInput): Promise<ResearchMemoryEntry>;
  rejectResearchMemoryProposal(input: {
    readonly workspaceId: string;
    readonly proposalId: string;
    readonly rowVersion: number;
  }): Promise<ResearchMemoryProposal>;
  recordResearchExport(input: RecordResearchExportInput): Promise<void>;
}
