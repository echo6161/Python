import type { ApiResult } from './library';
import type { CodeLanguage, CodeSymbolKind } from './code-intelligence';
import type { EvidenceAvailability, EvidenceTextAnchor } from './question';
import type { ZoteroItemDetails, ZoteroItemRef, ZoteroPdfAvailability } from './zotero';

export const PAPER_CODE_LINK_IPC_CHANNELS = Object.freeze({
  create: 'paper-code-links:create',
  get: 'paper-code-links:get',
  listForWorkspace: 'paper-code-links:list-for-workspace',
  listForPaper: 'paper-code-links:list-for-paper',
  listForCode: 'paper-code-links:list-for-code',
  update: 'paper-code-links:update',
  delete: 'paper-code-links:delete',
  openPaper: 'paper-code-links:open-paper',
  openCode: 'paper-code-links:open-code',
});

export type PaperCodeLinkIpcChannels = typeof PAPER_CODE_LINK_IPC_CHANNELS;
export type PaperCodeRelationType = 'corresponds_to' | 'extends' | 'implements' | 'uses';
export type PaperCodeLinkProvenance = 'ai_proposed_confirmed' | 'manual';

export interface PaperCodeLink {
  readonly id: string;
  readonly workspaceId: string;
  readonly itemRef: ZoteroItemRef;
  readonly itemVersion: number;
  readonly paperSnapshotIdentity: string;
  readonly pageNumber: number | null;
  readonly locationLabel: string;
  readonly textAnchor: EvidenceTextAnchor | null;
  readonly repositoryId: string;
  readonly repositoryName: string | null;
  readonly codeSnapshotIdentity: string;
  readonly currentCodeSnapshotIdentity: string | null;
  readonly language: CodeLanguage;
  readonly relativePath: string;
  readonly symbolKind: CodeSymbolKind | null;
  readonly symbolName: string | null;
  readonly startLine: number;
  readonly endLine: number;
  readonly contentHash: string;
  readonly relationType: PaperCodeRelationType;
  readonly label: string;
  readonly description: string;
  readonly provenance: PaperCodeLinkProvenance;
  readonly paperAvailability: EvidenceAvailability;
  readonly paperAvailabilityReason: string | null;
  readonly codeAvailability: EvidenceAvailability;
  readonly codeAvailabilityReason: string | null;
  readonly item: ZoteroItemDetails | null;
  readonly pdf: ZoteroPdfAvailability | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
}

export interface CreatePaperCodeLinkInput {
  readonly workspaceId: string;
  readonly itemRef: ZoteroItemRef;
  readonly pageNumber?: number;
  readonly locationLabel: string;
  readonly textAnchor?: EvidenceTextAnchor;
  readonly repositoryId: string;
  readonly codeSnapshotIdentity: string;
  readonly language: CodeLanguage;
  readonly relativePath: string;
  readonly symbolKind: CodeSymbolKind | null;
  readonly symbolName: string | null;
  readonly startLine: number;
  readonly endLine: number;
  readonly contentHash: string;
  readonly relationType: PaperCodeRelationType;
  readonly label: string;
  readonly description: string;
}

export interface UpdatePaperCodeLinkInput {
  readonly id: string;
  readonly workspaceId: string;
  readonly relationType: PaperCodeRelationType;
  readonly label: string;
  readonly description: string;
  readonly rowVersion: number;
}

export interface PaperCodeLinkIdentityInput {
  readonly id: string;
  readonly workspaceId: string;
}

export interface PaperCodeLinkPaperQuery {
  readonly workspaceId: string;
  readonly itemRef: ZoteroItemRef;
}

export interface PaperCodeLinkCodeQuery {
  readonly workspaceId: string;
  readonly repositoryId: string;
  readonly relativePath?: string;
}

export interface PaperCodeLinkNavigationResult {
  readonly id: string;
  readonly opened: boolean;
  readonly target: 'code' | 'zotero_item' | 'zotero_pdf';
  readonly reason: string | null;
}

export interface PaperCodeLinkApi {
  create(input: CreatePaperCodeLinkInput): Promise<ApiResult<PaperCodeLink>>;
  get(input: PaperCodeLinkIdentityInput): Promise<ApiResult<PaperCodeLink>>;
  listForWorkspace(workspaceId: string): Promise<ApiResult<readonly PaperCodeLink[]>>;
  listForPaper(input: PaperCodeLinkPaperQuery): Promise<ApiResult<readonly PaperCodeLink[]>>;
  listForCode(input: PaperCodeLinkCodeQuery): Promise<ApiResult<readonly PaperCodeLink[]>>;
  update(input: UpdatePaperCodeLinkInput): Promise<ApiResult<PaperCodeLink>>;
  delete(
    input: PaperCodeLinkIdentityInput & { readonly confirmation: 'DELETE_LINK' },
  ): Promise<ApiResult<{ readonly id: string }>>;
  openPaper(input: PaperCodeLinkIdentityInput): Promise<ApiResult<PaperCodeLinkNavigationResult>>;
  openCode(input: PaperCodeLinkIdentityInput): Promise<ApiResult<PaperCodeLinkNavigationResult>>;
}
