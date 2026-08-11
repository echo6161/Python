import path from 'node:path';

import type {
  DeleteRepositoryRefInput,
  OpenRepositoryInVscodeInput,
  RepositoryRef,
  RepositorySourceFile,
  RepositorySourceRequest,
  RepositoryTreePage,
  RepositoryTreeRequest,
  WorkspaceRepositoryInput,
  WorkspaceRepositoryRef,
} from '../../shared/contracts/repository';
import { LibraryError } from '../library/errors';
import type { GitRepositoryClient, RepositoryInspection } from './git-repository-client';
import type { RepositoryDataGateway, RepositoryObservationInput } from './repository-data-gateway';
import { RepositoryError, systemErrorCode } from './repository-errors';
import type { RepositoryFileService } from './repository-file-service';
import type { RepositoryVscodeLauncher } from './repository-vscode-launcher';

export interface RepositoryDirectoryPicker {
  chooseDirectory(): Promise<string | null>;
}

export class RepositoryService {
  public constructor(
    private readonly data: RepositoryDataGateway,
    private readonly git: GitRepositoryClient,
    private readonly files: RepositoryFileService,
    private readonly picker: RepositoryDirectoryPicker,
    private readonly vscode: RepositoryVscodeLauncher,
  ) {}

  public async chooseAndLink(workspaceId: string): Promise<WorkspaceRepositoryRef | null> {
    const selected = await this.picker.chooseDirectory();
    if (!selected) return null;
    const inspected = await this.git.inspectSelectedRoot(selected);
    const repository = await this.data.createOrUpdateRepository(observation(inspected));
    return this.data.addWorkspaceRepository(workspaceId, repository.id);
  }

  public listForWorkspace(workspaceId: string): Promise<readonly WorkspaceRepositoryRef[]> {
    return this.data.listWorkspaceRepositories(workspaceId);
  }

  public async removeFromWorkspace(
    input: WorkspaceRepositoryInput,
  ): Promise<{ readonly removed: boolean }> {
    return {
      removed: await this.data.removeWorkspaceRepository(input.workspaceId, input.repositoryId),
    };
  }

  public async deleteReference(
    input: DeleteRepositoryRefInput,
  ): Promise<{ readonly repositoryId: string }> {
    if (!(await this.data.deleteRepository(input.repositoryId))) {
      throw new LibraryError('NOT_FOUND', 'Repository reference missing.');
    }
    return { repositoryId: input.repositoryId };
  }

  public async refresh(repositoryId: string, signal?: AbortSignal): Promise<RepositoryRef> {
    const repository = await this.requireRepository(repositoryId);
    try {
      const inspected = await this.git.inspectExistingRoot(repository.canonicalRoot, signal);
      return await this.data.updateRepositoryObservation(
        repository.id,
        refreshObservation(inspected),
      );
    } catch (error) {
      if (error instanceof RepositoryError && error.code === 'REPOSITORY_CANCELLED') throw error;
      const availability = availabilityForError(error);
      return await this.data.updateRepositoryObservation(repository.id, {
        kind: repository.kind,
        gitRoot: repository.gitRoot,
        currentBranch: repository.currentBranch,
        headCommit: repository.headCommit,
        remotes: repository.remotes,
        availability,
        lastErrorCode: repositoryErrorCode(error),
        observedAt: new Date().toISOString(),
      });
    }
  }

  public async listTree(
    request: RepositoryTreeRequest,
    signal?: AbortSignal,
  ): Promise<RepositoryTreePage> {
    const repository = await this.requireRepository(request.repositoryId);
    return this.files.listTree(
      repository.id,
      repository.canonicalRoot,
      repository.kind,
      request,
      signal,
    );
  }

  public async readSource(
    request: RepositorySourceRequest,
    signal?: AbortSignal,
  ): Promise<RepositorySourceFile> {
    const repository = await this.requireRepository(request.repositoryId);
    return this.files.readSource(
      repository.id,
      repository.canonicalRoot,
      request.relativePath,
      signal,
    );
  }

  public async openInVscode(
    input: OpenRepositoryInVscodeInput,
  ): Promise<{ readonly opened: boolean }> {
    const repository = await this.requireRepository(input.repositoryId);
    const target = input.relativePath
      ? await this.files.resolveFile(repository.canonicalRoot, input.relativePath)
      : await this.files.resolveRoot(repository.canonicalRoot);
    await this.vscode.open(target, input.line, input.column);
    return { opened: true };
  }

  private async requireRepository(id: string): Promise<RepositoryRef> {
    const repository = await this.data.getRepository(id);
    if (!repository) throw new LibraryError('NOT_FOUND', 'Repository reference missing.');
    return repository;
  }
}

function observation(inspection: RepositoryInspection): RepositoryObservationInput {
  const now = new Date().toISOString();
  return {
    ...refreshObservation(inspection),
    canonicalRoot: inspection.canonicalRoot,
    canonicalKey: canonicalKey(inspection.canonicalRoot),
    displayName: path.basename(inspection.canonicalRoot) || inspection.canonicalRoot,
    observedAt: now,
  };
}

function refreshObservation(
  inspection: RepositoryInspection,
): Omit<RepositoryObservationInput, 'canonicalKey' | 'canonicalRoot' | 'displayName'> {
  return {
    kind: inspection.kind,
    gitRoot: inspection.gitRoot,
    currentBranch: inspection.currentBranch,
    headCommit: inspection.headCommit,
    remotes: inspection.remotes,
    availability: 'available',
    lastErrorCode: null,
    observedAt: new Date().toISOString(),
  };
}

function canonicalKey(root: string): string {
  const normalized = path.normalize(root);
  return process.platform === 'win32' || process.platform === 'darwin'
    ? normalized.toLocaleLowerCase()
    : normalized;
}

function availabilityForError(error: unknown): RepositoryRef['availability'] {
  const code = error instanceof RepositoryError ? error.code : systemErrorCode(error);
  if (code === 'FILE_NOT_FOUND' || code === 'ENOENT' || code === 'ENOTDIR') return 'missing';
  if (code === 'PERMISSION_DENIED' || code === 'EACCES' || code === 'EPERM') {
    return 'permission_denied';
  }
  return 'unavailable';
}

function repositoryErrorCode(error: unknown): string {
  if (error instanceof RepositoryError) return error.code;
  return systemErrorCode(error) ?? 'REPOSITORY_INSPECTION_FAILED';
}
