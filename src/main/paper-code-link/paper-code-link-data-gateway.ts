import type {
  CreatePaperCodeLinkInput,
  PaperCodeLinkProvenance,
  UpdatePaperCodeLinkInput,
} from '../../shared/contracts/paper-code-link';
import type { CodeLanguage, CodeSymbolKind } from '../../shared/contracts/code-intelligence';
import type { EvidenceTextAnchor } from '../../shared/contracts/question';
import type { ZoteroItemRef } from '../../shared/contracts/zotero';

export interface StoredPaperCodeLink {
  readonly id: string;
  readonly workspaceId: string;
  readonly itemRef: ZoteroItemRef;
  readonly itemVersion: number;
  readonly paperSnapshotIdentity: string;
  readonly pageNumber: number | null;
  readonly locationLabel: string;
  readonly textAnchor: EvidenceTextAnchor | null;
  readonly repositoryId: string;
  readonly codeSnapshotIdentity: string;
  readonly language: CodeLanguage;
  readonly relativePath: string;
  readonly symbolKind: CodeSymbolKind | null;
  readonly symbolName: string | null;
  readonly startLine: number;
  readonly endLine: number;
  readonly contentHash: string;
  readonly relationType: CreatePaperCodeLinkInput['relationType'];
  readonly label: string;
  readonly description: string;
  readonly provenance: PaperCodeLinkProvenance;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
}

export interface CreateStoredPaperCodeLinkInput extends Omit<
  CreatePaperCodeLinkInput,
  'pageNumber' | 'textAnchor'
> {
  readonly itemVersion: number;
  readonly paperSnapshotIdentity: string;
  readonly pageNumber: number | null;
  readonly textAnchor: EvidenceTextAnchor | null;
  readonly provenance: PaperCodeLinkProvenance;
}

export interface PaperCodeLinkDataGateway {
  createPaperCodeLink(input: CreateStoredPaperCodeLinkInput): Promise<StoredPaperCodeLink>;
  getPaperCodeLink(workspaceId: string, id: string): Promise<StoredPaperCodeLink | null>;
  listPaperCodeLinks(workspaceId: string): Promise<readonly StoredPaperCodeLink[]>;
  updatePaperCodeLink(input: UpdatePaperCodeLinkInput): Promise<StoredPaperCodeLink>;
  deletePaperCodeLink(workspaceId: string, id: string): Promise<boolean>;
  paperCodeLocationExists(link: StoredPaperCodeLink): Promise<boolean>;
}
