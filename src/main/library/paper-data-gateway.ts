import type {
  PaperDetails,
  PaperListQuery,
  PaperListResult,
  PaperMetadataUpdate,
} from '../../shared/contracts/library';

export interface ImportedPaperRecord {
  readonly paperId: string;
  readonly paperFileId: string;
  readonly title: string;
  readonly sha256: string;
  readonly relativePath: string;
  readonly internalFilename: string;
  readonly originalFilename: string;
  readonly byteSize: number;
  readonly importedAt: string;
}

export type CreateImportedPaperResult =
  | { readonly status: 'created'; readonly paper: PaperDetails }
  | { readonly status: 'duplicate'; readonly paper: PaperDetails };

export interface PaperDataGateway {
  listPapers(query?: PaperListQuery): Promise<PaperListResult>;
  getPaper(id: string): Promise<PaperDetails | null>;
  findPaperByHash(sha256: string): Promise<PaperDetails | null>;
  createImportedPaper(input: ImportedPaperRecord): Promise<CreateImportedPaperResult>;
  updatePaperMetadata(input: PaperMetadataUpdate): Promise<PaperDetails>;
  removePaperRecord(id: string): Promise<PaperDetails>;
  backupTo(destinationPath: string): Promise<void>;
  restoreFrom(sourcePath: string): Promise<void>;
  getMigrationVersions(): Promise<readonly number[]>;
  close(): Promise<void>;
}
