import type {
  CreateWorkspaceInput,
  SetWorkspaceStatusInput,
  UpdateWorkspaceInput,
  Workspace,
} from '../../shared/contracts/workspace';
import type { ZoteroItemRef } from '../../shared/contracts/zotero';

export interface StoredWorkspaceZoteroPaper {
  readonly workspaceId: string;
  readonly itemRef: ZoteroItemRef;
  readonly addedAt: string;
  readonly sortOrder: number;
}

export interface WorkspaceDataGateway {
  createWorkspace(input: CreateWorkspaceInput): Promise<Workspace>;
  getWorkspace(id: string): Promise<Workspace | null>;
  listWorkspaces(): Promise<readonly Workspace[]>;
  updateWorkspace(input: UpdateWorkspaceInput): Promise<Workspace>;
  setWorkspaceStatus(input: SetWorkspaceStatusInput): Promise<Workspace>;
  deleteWorkspace(id: string): Promise<boolean>;
  getLastActiveWorkspace(): Promise<Workspace | null>;
  setLastActiveWorkspace(workspaceId: string | null): Promise<Workspace | null>;
  addWorkspaceZoteroPaper(
    workspaceId: string,
    itemRef: ZoteroItemRef,
  ): Promise<StoredWorkspaceZoteroPaper>;
  removeWorkspaceZoteroPaper(workspaceId: string, itemRef: ZoteroItemRef): Promise<boolean>;
  listWorkspaceZoteroPapers(workspaceId: string): Promise<readonly StoredWorkspaceZoteroPaper[]>;
}
