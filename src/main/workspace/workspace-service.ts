import type {
  CreateWorkspaceInput,
  DeleteWorkspaceInput,
  SetLastActiveWorkspaceInput,
  SetWorkspaceStatusInput,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceZoteroPaper,
  WorkspaceZoteroPaperInput,
} from '../../shared/contracts/workspace';
import type {
  ZoteroConnectionStatus,
  ZoteroItemDetails,
  ZoteroItemRef,
} from '../../shared/contracts/zotero';
import { LibraryError } from '../library/errors';
import { ZoteroBridgeError } from '../zotero/zotero-errors';
import type { StoredWorkspaceZoteroPaper, WorkspaceDataGateway } from './workspace-data-gateway';

const WORKSPACE_PAPER_RESOLUTION_CONCURRENCY = 4;

export interface WorkspaceZoteroResolver {
  detectZotero(): Promise<ZoteroConnectionStatus>;
  getItem(ref: ZoteroItemRef): Promise<ZoteroItemDetails>;
}

export class WorkspaceService {
  public constructor(
    private readonly data: WorkspaceDataGateway,
    private readonly zotero: WorkspaceZoteroResolver,
  ) {}

  public create(input: CreateWorkspaceInput): Promise<Workspace> {
    return this.data.createWorkspace(normalizeWorkspaceFields(input));
  }

  public async get(id: string): Promise<Workspace> {
    const workspace = await this.data.getWorkspace(id);
    if (!workspace) throw new LibraryError('NOT_FOUND', 'The Workspace no longer exists.');
    return workspace;
  }

  public list(): Promise<readonly Workspace[]> {
    return this.data.listWorkspaces();
  }

  public update(input: UpdateWorkspaceInput): Promise<Workspace> {
    return this.data.updateWorkspace({
      ...normalizeWorkspaceFields(input),
      id: input.id,
      rowVersion: input.rowVersion,
    });
  }

  public setStatus(input: SetWorkspaceStatusInput): Promise<Workspace> {
    return this.data.setWorkspaceStatus(input);
  }

  public async delete(input: DeleteWorkspaceInput): Promise<{ readonly id: string }> {
    const confirmation: unknown = input.confirmation;
    if (confirmation !== 'DELETE_WORKSPACE') {
      throw new LibraryError('INVALID_INPUT', 'Workspace deletion requires confirmation.');
    }
    const deleted = await this.data.deleteWorkspace(input.id);
    if (!deleted) throw new LibraryError('NOT_FOUND', 'The Workspace no longer exists.');
    return { id: input.id };
  }

  public getLastActive(): Promise<Workspace | null> {
    return this.data.getLastActiveWorkspace();
  }

  public setLastActive(input: SetLastActiveWorkspaceInput): Promise<Workspace | null> {
    return this.data.setLastActiveWorkspace(input.workspaceId);
  }

  public async addPaper(input: WorkspaceZoteroPaperInput): Promise<WorkspaceZoteroPaper> {
    const paper = await this.data.addWorkspaceZoteroPaper(input.workspaceId, input.itemRef);
    const resolved = (await this.resolvePapers([paper]))[0];
    if (!resolved) {
      throw new LibraryError('DATABASE_ERROR', 'The Workspace paper could not be resolved.');
    }
    return resolved;
  }

  public async removePaper(
    input: WorkspaceZoteroPaperInput,
  ): Promise<{ readonly removed: boolean }> {
    return {
      removed: await this.data.removeWorkspaceZoteroPaper(input.workspaceId, input.itemRef),
    };
  }

  public async listPapers(workspaceId: string): Promise<readonly WorkspaceZoteroPaper[]> {
    return this.resolvePapers(await this.data.listWorkspaceZoteroPapers(workspaceId));
  }

  private async resolvePapers(
    papers: readonly StoredWorkspaceZoteroPaper[],
  ): Promise<readonly WorkspaceZoteroPaper[]> {
    if (papers.length === 0) return [];

    let connection: ZoteroConnectionStatus;
    try {
      connection = await this.zotero.detectZotero();
    } catch {
      return papers.map((paper) => resolvedPaper(paper, 'unavailable', null));
    }
    if (!connection.available || !connection.serverIdentity) {
      return papers.map((paper) => resolvedPaper(paper, 'unavailable', null));
    }

    const currentServerId = connection.serverIdentity.serverId;
    return mapConcurrent(papers, WORKSPACE_PAPER_RESOLUTION_CONCURRENCY, async (paper) => {
      if (paper.itemRef.serverId !== currentServerId) {
        return resolvedPaper(paper, 'stale_identity', null);
      }
      try {
        return resolvedPaper(paper, 'available', await this.zotero.getItem(paper.itemRef));
      } catch (error) {
        if (error instanceof ZoteroBridgeError) {
          if (error.code === 'NOT_FOUND') return resolvedPaper(paper, 'missing', null);
          if (error.code === 'ZOTERO_IDENTITY_CHANGED') {
            return resolvedPaper(paper, 'stale_identity', null);
          }
        }
        return resolvedPaper(paper, 'unavailable', null);
      }
    });
  }
}

function normalizeWorkspaceFields(input: CreateWorkspaceInput): CreateWorkspaceInput {
  const name = input.name.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  const description = input.description.trim();
  const researchGoal = input.researchGoal.trim();
  if (!name || name.length > 200) {
    throw new LibraryError('INVALID_INPUT', 'Workspace name must contain 1 to 200 characters.');
  }
  if (description.length > 4_000 || researchGoal.length > 10_000) {
    throw new LibraryError('INVALID_INPUT', 'Workspace text exceeds the supported length.');
  }
  return { name, description, researchGoal };
}

function resolvedPaper(
  paper: StoredWorkspaceZoteroPaper,
  availability: WorkspaceZoteroPaper['availability'],
  item: ZoteroItemDetails | null,
): WorkspaceZoteroPaper {
  return { ...paper, availability, item };
}

async function mapConcurrent<T, U>(
  values: readonly T[],
  concurrency: number,
  map: (value: T) => Promise<U>,
): Promise<readonly U[]> {
  const output = new Array<U>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value !== undefined) output[index] = await map(value);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return output;
}
