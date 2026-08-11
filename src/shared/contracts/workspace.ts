import type { ApiResult } from './library';
import type { ZoteroItemDetails, ZoteroItemRef } from './zotero';

export const WORKSPACE_IPC_CHANNELS = Object.freeze({
  create: 'workspaces:create',
  get: 'workspaces:get',
  list: 'workspaces:list',
  update: 'workspaces:update',
  setStatus: 'workspaces:set-status',
  delete: 'workspaces:delete',
  getLastActive: 'workspaces:get-last-active',
  setLastActive: 'workspaces:set-last-active',
  addPaper: 'workspaces:add-zotero-paper',
  removePaper: 'workspaces:remove-zotero-paper',
  listPapers: 'workspaces:list-zotero-papers',
});

export type WorkspaceIpcChannels = typeof WORKSPACE_IPC_CHANNELS;
export type WorkspaceStatus = 'active' | 'archived' | 'paused';
export type WorkspacePaperAvailability = 'available' | 'missing' | 'stale_identity' | 'unavailable';

export interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly researchGoal: string;
  readonly status: WorkspaceStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
}

export interface CreateWorkspaceInput {
  readonly name: string;
  readonly description: string;
  readonly researchGoal: string;
}

export interface UpdateWorkspaceInput extends CreateWorkspaceInput {
  readonly id: string;
  readonly rowVersion: number;
}

export interface SetWorkspaceStatusInput {
  readonly id: string;
  readonly rowVersion: number;
  readonly status: WorkspaceStatus;
}

export interface DeleteWorkspaceInput {
  readonly id: string;
  readonly confirmation: 'DELETE_WORKSPACE';
}

export interface SetLastActiveWorkspaceInput {
  readonly workspaceId: string | null;
}

export interface WorkspaceZoteroPaperInput {
  readonly workspaceId: string;
  readonly itemRef: ZoteroItemRef;
}

export interface WorkspaceZoteroPaper {
  readonly workspaceId: string;
  readonly itemRef: ZoteroItemRef;
  readonly addedAt: string;
  readonly sortOrder: number;
  readonly availability: WorkspacePaperAvailability;
  readonly item: ZoteroItemDetails | null;
}

export interface WorkspaceApi {
  create(input: CreateWorkspaceInput): Promise<ApiResult<Workspace>>;
  get(id: string): Promise<ApiResult<Workspace>>;
  list(): Promise<ApiResult<readonly Workspace[]>>;
  update(input: UpdateWorkspaceInput): Promise<ApiResult<Workspace>>;
  setStatus(input: SetWorkspaceStatusInput): Promise<ApiResult<Workspace>>;
  delete(input: DeleteWorkspaceInput): Promise<ApiResult<{ readonly id: string }>>;
  getLastActive(): Promise<ApiResult<Workspace | null>>;
  setLastActive(input: SetLastActiveWorkspaceInput): Promise<ApiResult<Workspace | null>>;
  addPaper(input: WorkspaceZoteroPaperInput): Promise<ApiResult<WorkspaceZoteroPaper>>;
  removePaper(input: WorkspaceZoteroPaperInput): Promise<ApiResult<{ readonly removed: boolean }>>;
  listPapers(workspaceId: string): Promise<ApiResult<readonly WorkspaceZoteroPaper[]>>;
}
