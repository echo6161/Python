import type { ApiResult } from './library';

export const REPOSITORY_IPC_CHANNELS = Object.freeze({
  chooseAndLink: 'repositories:choose-and-link',
  listForWorkspace: 'repositories:list-for-workspace',
  removeFromWorkspace: 'repositories:remove-from-workspace',
  deleteReference: 'repositories:delete-reference',
  refresh: 'repositories:refresh',
  listTree: 'repositories:list-tree',
  readSource: 'repositories:read-source',
  openInVscode: 'repositories:open-in-vscode',
  cancelRequest: 'repositories:cancel-request',
});

export type RepositoryIpcChannels = typeof REPOSITORY_IPC_CHANNELS;
export type RepositoryKind = 'git' | 'source_folder';
export type RepositoryAvailability = 'available' | 'missing' | 'permission_denied' | 'unavailable';
export type RepositoryTreeEntryKind = 'directory' | 'file' | 'symlink';
export type RepositorySourceEncoding = 'utf-8' | 'utf-16be' | 'utf-16le';

export interface RepositoryRemoteSummary {
  readonly name: string;
  readonly url: string;
}

export interface RepositoryRef {
  readonly id: string;
  readonly displayName: string;
  readonly canonicalRoot: string;
  readonly kind: RepositoryKind;
  readonly gitRoot: string | null;
  readonly currentBranch: string | null;
  readonly headCommit: string | null;
  readonly remotes: readonly RepositoryRemoteSummary[];
  readonly availability: RepositoryAvailability;
  readonly lastErrorCode: string | null;
  readonly lastObservedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
}

export interface WorkspaceRepositoryRef extends RepositoryRef {
  readonly workspaceId: string;
  readonly addedAt: string;
  readonly sortOrder: number;
}

export interface RepositoryTreeEntry {
  readonly name: string;
  readonly relativePath: string;
  readonly kind: RepositoryTreeEntryKind;
  readonly byteSize: number | null;
  readonly modifiedAt: string | null;
}

export interface RepositoryTreePage {
  readonly repositoryId: string;
  readonly directory: string;
  readonly entries: readonly RepositoryTreeEntry[];
  readonly start: number;
  readonly limit: number;
  readonly total: number;
  readonly hasNext: boolean;
}

export interface RepositorySourceFile {
  readonly repositoryId: string;
  readonly relativePath: string;
  readonly language: string;
  readonly encoding: RepositorySourceEncoding;
  readonly byteSize: number;
  readonly lineCount: number;
  readonly content: string;
}

export interface RepositoryRequestInput {
  readonly repositoryId: string;
  readonly requestId: string;
}

export interface RepositoryTreeRequest extends RepositoryRequestInput {
  readonly relativePath: string;
  readonly start?: number;
  readonly limit?: number;
}

export interface RepositorySourceRequest extends RepositoryRequestInput {
  readonly relativePath: string;
}

export interface WorkspaceRepositoryInput {
  readonly workspaceId: string;
  readonly repositoryId: string;
}

export interface DeleteRepositoryRefInput {
  readonly repositoryId: string;
  readonly confirmation: 'DELETE_REPOSITORY_REF';
}

export interface OpenRepositoryInVscodeInput {
  readonly repositoryId: string;
  readonly relativePath?: string;
  readonly line?: number;
  readonly column?: number;
}

export interface RepositoryCancelResult {
  readonly requestId: string;
  readonly cancelled: boolean;
}

export interface RepositoryApi {
  chooseAndLink(workspaceId: string): Promise<ApiResult<WorkspaceRepositoryRef | null>>;
  listForWorkspace(workspaceId: string): Promise<ApiResult<readonly WorkspaceRepositoryRef[]>>;
  removeFromWorkspace(
    input: WorkspaceRepositoryInput,
  ): Promise<ApiResult<{ readonly removed: boolean }>>;
  deleteReference(
    input: DeleteRepositoryRefInput,
  ): Promise<ApiResult<{ readonly repositoryId: string }>>;
  refresh(input: RepositoryRequestInput): Promise<ApiResult<RepositoryRef>>;
  listTree(input: RepositoryTreeRequest): Promise<ApiResult<RepositoryTreePage>>;
  readSource(input: RepositorySourceRequest): Promise<ApiResult<RepositorySourceFile>>;
  openInVscode(
    input: OpenRepositoryInVscodeInput,
  ): Promise<ApiResult<{ readonly opened: boolean }>>;
  cancelRequest(requestId: string): Promise<ApiResult<RepositoryCancelResult>>;
}
