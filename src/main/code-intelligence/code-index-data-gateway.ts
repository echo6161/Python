import type {
  CodeLanguage,
  CodeFileSearchResult,
  CodeIndexStatus,
  CodeSearchInput,
  CodeSearchPage,
  CodeSymbolSearchResult,
  CodeTextSearchResult,
} from '../../shared/contracts/code-intelligence';

export interface StoredCodeKnowledgeChunk {
  readonly repositoryId: string;
  readonly relativePath: string;
  readonly language: CodeLanguage;
  readonly snapshotIdentity: string;
  readonly contentHash: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly symbolName: string | null;
  readonly content: string;
}
import type { ParsedCodeFile } from './code-parser';

export interface StoredCodeFileHash {
  readonly relativePath: string;
  readonly contentHash: string;
}

export interface CompleteCodeIndexInput {
  readonly repositoryId: string;
  readonly requestId: string;
  readonly mode: 'incremental' | 'rebuild';
  readonly snapshotIdentity: string;
  readonly dirty: boolean;
  readonly parserVersion: string;
  readonly changedFiles: readonly ParsedCodeFile[];
  readonly removedPaths: readonly string[];
  readonly completedAt: string;
}

export interface CodeIndexFailureInput {
  readonly repositoryId: string;
  readonly requestId: string;
  readonly code: string;
  readonly message: string;
  readonly updatedAt: string;
}

export interface CodeIndexDataGateway {
  recoverInterruptedIndexes(updatedAt: string): Promise<number>;
  getCodeIndexStatus(repositoryId: string): Promise<CodeIndexStatus | null>;
  listCodeFileHashes(repositoryId: string): Promise<readonly StoredCodeFileHash[]>;
  beginCodeIndex(
    repositoryId: string,
    requestId: string,
    parserVersion: string,
    totalFiles: number,
    startedAt: string,
  ): Promise<CodeIndexStatus>;
  updateCodeIndexProgress(
    repositoryId: string,
    requestId: string,
    processedFiles: number,
    totalFiles: number,
    updatedAt: string,
  ): Promise<void>;
  completeCodeIndex(input: CompleteCodeIndexInput): Promise<CodeIndexStatus>;
  cancelCodeIndex(input: CodeIndexFailureInput): Promise<CodeIndexStatus>;
  failCodeIndex(input: CodeIndexFailureInput): Promise<CodeIndexStatus>;
  markCodeIndexStale(repositoryId: string, updatedAt: string): Promise<CodeIndexStatus>;
  searchCodeFiles(input: CodeSearchInput): Promise<CodeSearchPage<CodeFileSearchResult>>;
  searchCodeSymbols(input: CodeSearchInput): Promise<CodeSearchPage<CodeSymbolSearchResult>>;
  searchCodeText(input: CodeSearchInput): Promise<CodeSearchPage<CodeTextSearchResult>>;
  listCodeChunksForKnowledge(repositoryId: string): Promise<readonly StoredCodeKnowledgeChunk[]>;
}
