import type {
  RepositoryAvailability,
  RepositoryKind,
  RepositoryRef,
  RepositoryRemoteSummary,
  WorkspaceRepositoryRef,
} from '../../shared/contracts/repository';

export interface RepositoryObservationInput {
  readonly canonicalRoot: string;
  readonly canonicalKey: string;
  readonly displayName: string;
  readonly kind: RepositoryKind;
  readonly gitRoot: string | null;
  readonly currentBranch: string | null;
  readonly headCommit: string | null;
  readonly remotes: readonly RepositoryRemoteSummary[];
  readonly availability: RepositoryAvailability;
  readonly lastErrorCode: string | null;
  readonly observedAt: string;
}

export interface RepositoryDataGateway {
  createOrUpdateRepository(input: RepositoryObservationInput): Promise<RepositoryRef>;
  getRepository(id: string): Promise<RepositoryRef | null>;
  updateRepositoryObservation(
    id: string,
    input: Omit<RepositoryObservationInput, 'canonicalKey' | 'canonicalRoot' | 'displayName'>,
  ): Promise<RepositoryRef>;
  addWorkspaceRepository(
    workspaceId: string,
    repositoryId: string,
  ): Promise<WorkspaceRepositoryRef>;
  removeWorkspaceRepository(workspaceId: string, repositoryId: string): Promise<boolean>;
  listWorkspaceRepositories(workspaceId: string): Promise<readonly WorkspaceRepositoryRef[]>;
  deleteRepository(id: string): Promise<boolean>;
}
