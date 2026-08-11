import type {
  CodeFileSearchResult,
  CodeIndexProgress,
  CodeIndexStatus,
  CodeSearchInput,
  CodeSearchPage,
  CodeSymbolSearchResult,
  CodeTextSearchResult,
  RunCodeIndexInput,
} from '../../shared/contracts/code-intelligence';
import type { RepositoryDataGateway } from '../repository/repository-data-gateway';
import { RepositoryError } from '../repository/repository-errors';
import type { CodeIndexDataGateway } from './code-index-data-gateway';
import type { CodeIndexScanner } from './code-index-scanner';
import { CODE_PARSER_VERSION } from './code-parser';
import type { CodeParserClient } from './code-parser-client';

export type CodeIndexProgressListener = (progress: CodeIndexProgress) => void;

export class CodeIntelligenceService {
  public constructor(
    private readonly data: CodeIndexDataGateway,
    private readonly repositories: Pick<RepositoryDataGateway, 'getRepository'>,
    private readonly scanner: Pick<CodeIndexScanner, 'scan'>,
    private readonly parser: Pick<CodeParserClient, 'parseFiles'>,
  ) {}

  public initialize(): Promise<number> {
    return this.data.recoverInterruptedIndexes(new Date().toISOString());
  }

  public async getStatus(repositoryId: string, signal?: AbortSignal): Promise<CodeIndexStatus> {
    const repository = await this.requireRepository(repositoryId);
    const stored = await this.data.getCodeIndexStatus(repositoryId);
    if (!stored) return unindexed(repositoryId);
    if (stored.status === 'indexing') return stored;
    try {
      const current = await this.scanner.scan(repository, signal);
      const stale =
        stored.snapshotIdentity !== current.snapshotIdentity ||
        stored.parserVersion !== CODE_PARSER_VERSION;
      const status = stale
        ? await this.data.markCodeIndexStale(repositoryId, new Date().toISOString())
        : stored;
      return {
        ...status,
        currentSnapshotIdentity: current.snapshotIdentity,
        status: stale ? 'stale' : status.status,
      };
    } catch (error) {
      if (error instanceof RepositoryError && error.code === 'CODE_INDEX_CANCELLED') throw error;
      return { ...stored, currentSnapshotIdentity: null };
    }
  }

  public async runIndex(
    input: RunCodeIndexInput,
    signal?: AbortSignal,
    onProgress?: CodeIndexProgressListener,
  ): Promise<CodeIndexStatus> {
    const repository = await this.requireRepository(input.repositoryId);
    const startedAt = new Date().toISOString();
    await this.data.beginCodeIndex(
      input.repositoryId,
      input.requestId,
      CODE_PARSER_VERSION,
      0,
      startedAt,
    );
    try {
      emit(onProgress, input, 'discovering', 0, 0, null);
      const manifest = await this.scanner.scan(repository, signal, (processed, relativePath) =>
        emit(onProgress, input, 'discovering', processed, 0, relativePath),
      );
      const previous = new Map(
        (await this.data.listCodeFileHashes(input.repositoryId)).map((file) => [
          file.relativePath,
          file.contentHash,
        ]),
      );
      const currentPaths = new Set(manifest.files.map((file) => file.relativePath));
      const changed =
        input.mode === 'rebuild'
          ? manifest.files
          : manifest.files.filter((file) => previous.get(file.relativePath) !== file.contentHash);
      const removed =
        input.mode === 'rebuild'
          ? []
          : [...previous.keys()].filter((relativePath) => !currentPaths.has(relativePath));
      await this.data.updateCodeIndexProgress(
        input.repositoryId,
        input.requestId,
        0,
        manifest.files.length,
        new Date().toISOString(),
      );
      emit(onProgress, input, 'parsing', 0, changed.length, null);
      const parsed =
        changed.length === 0
          ? []
          : await this.parser.parseFiles(changed, signal, (processed, relativePath) => {
              emit(onProgress, input, 'parsing', processed, changed.length, relativePath);
            });
      await this.data.updateCodeIndexProgress(
        input.repositoryId,
        input.requestId,
        manifest.files.length,
        manifest.files.length,
        new Date().toISOString(),
      );
      emit(onProgress, input, 'saving', manifest.files.length, manifest.files.length, null);
      return await this.data.completeCodeIndex({
        repositoryId: input.repositoryId,
        requestId: input.requestId,
        mode: input.mode,
        snapshotIdentity: manifest.snapshotIdentity,
        dirty: manifest.dirty,
        parserVersion: CODE_PARSER_VERSION,
        changedFiles: parsed,
        removedPaths: removed,
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      const failure = {
        repositoryId: input.repositoryId,
        requestId: input.requestId,
        code: error instanceof RepositoryError ? error.code : 'INDEX_FAILED',
        message:
          error instanceof RepositoryError
            ? error.message
            : 'PaperMind could not build the code index.',
        updatedAt: new Date().toISOString(),
      };
      if (error instanceof RepositoryError && error.code === 'CODE_INDEX_CANCELLED') {
        return this.data.cancelCodeIndex(failure);
      }
      await this.data.failCodeIndex(failure);
      throw error;
    }
  }

  public searchFiles(input: CodeSearchInput): Promise<CodeSearchPage<CodeFileSearchResult>> {
    return this.search(input, (query) => this.data.searchCodeFiles(query));
  }

  public searchSymbols(input: CodeSearchInput): Promise<CodeSearchPage<CodeSymbolSearchResult>> {
    return this.search(input, (query) => this.data.searchCodeSymbols(query));
  }

  public searchText(input: CodeSearchInput): Promise<CodeSearchPage<CodeTextSearchResult>> {
    return this.search(input, (query) => this.data.searchCodeText(query));
  }

  private async search<T extends { readonly snapshotIdentity: string }>(
    input: CodeSearchInput,
    operation: (query: CodeSearchInput) => Promise<CodeSearchPage<T>>,
  ): Promise<
    CodeSearchPage<T & { readonly currentSnapshotIdentity: string | null; readonly stale: boolean }>
  > {
    const status = await this.getStatus(input.repositoryId);
    if (!status.snapshotIdentity) {
      throw new RepositoryError('CONFLICT', 'Build the code index before searching.');
    }
    const page = await operation(input);
    return {
      ...page,
      results: page.results.map((result) => ({
        ...result,
        currentSnapshotIdentity: status.currentSnapshotIdentity,
        stale:
          status.status === 'stale' || result.snapshotIdentity !== status.currentSnapshotIdentity,
      })),
    };
  }

  private async requireRepository(id: string) {
    const repository = await this.repositories.getRepository(id);
    if (!repository) throw new RepositoryError('NOT_FOUND', 'Repository reference missing.');
    return repository;
  }
}

function emit(
  listener: CodeIndexProgressListener | undefined,
  input: RunCodeIndexInput,
  phase: CodeIndexProgress['phase'],
  processedFiles: number,
  totalFiles: number,
  currentFile: string | null,
): void {
  listener?.({
    requestId: input.requestId,
    repositoryId: input.repositoryId,
    phase,
    processedFiles,
    totalFiles,
    currentFile,
  });
}

function unindexed(repositoryId: string): CodeIndexStatus {
  return {
    repositoryId,
    status: 'unindexed',
    snapshotIdentity: null,
    currentSnapshotIdentity: null,
    dirty: false,
    parserVersion: CODE_PARSER_VERSION,
    fileCount: 0,
    symbolCount: 0,
    chunkCount: 0,
    processedFiles: 0,
    totalFiles: 0,
    lastErrorCode: null,
    lastErrorMessage: null,
    startedAt: null,
    completedAt: null,
    updatedAt: null,
  };
}
