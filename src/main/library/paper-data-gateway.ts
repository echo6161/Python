import type {
  BatchPaperUpdate,
  BatchPaperUpdateResult,
  Collection,
  CreateCollectionInput,
  CreateTagInput,
  LibraryOrganization,
  MetadataConfidence,
  MetadataFieldName,
  MetadataSource,
  PaperDetails,
  PaperDetailsUpdate,
  PaperListQuery,
  PaperListResult,
  PaperMetadataUpdate,
  PaperOrganizationUpdate,
  Tag,
} from '../../shared/contracts/library';
import type {
  Annotation,
  CreateAnnotationInput,
  ReadingState,
  SaveReadingStateInput,
  UpdateAnnotationInput,
} from '../../shared/contracts/reader';

export interface ManagedPaperFileRecord {
  readonly paperId: string;
  readonly paperFileId: string;
  readonly relativePath: string;
  readonly byteSize: number;
  readonly sha256: string;
}

export type ImportedMetadataValue = string | number | readonly string[] | null;

export interface ImportedMetadataField {
  readonly field: MetadataFieldName;
  readonly value: ImportedMetadataValue;
  readonly source: MetadataSource;
  readonly confidence: MetadataConfidence;
}

export interface ImportedDocumentPage {
  readonly pageNumber: number;
  readonly normalizedText: string;
  readonly textHash: string;
}

export interface ImportedPaperRecord {
  readonly paperId: string;
  readonly paperFileId: string;
  readonly fallbackTitle: string;
  readonly metadata: readonly ImportedMetadataField[];
  readonly pages: readonly ImportedDocumentPage[];
  readonly pageCount: number | null;
  readonly textExtractionStatus: 'succeeded' | 'partial' | 'failed';
  readonly extractionErrorCode: string | null;
  readonly sha256: string;
  readonly relativePath: string;
  readonly internalFilename: string;
  readonly originalFilename: string;
  readonly byteSize: number;
  readonly importedAt: string;
}

export interface PendingPaperTextExtraction {
  readonly paperId: string;
  readonly paperFileId: string;
  readonly relativePath: string;
}

export interface PaperTextExtractionRecord {
  readonly paperId: string;
  readonly paperFileId: string;
  readonly pages: readonly ImportedDocumentPage[];
  readonly pageCount: number | null;
  readonly textExtractionStatus: 'succeeded' | 'partial' | 'failed';
  readonly extractionErrorCode: string | null;
  readonly extractedAt: string;
}

export type CreateImportedPaperResult =
  | { readonly status: 'created'; readonly paper: PaperDetails }
  | { readonly status: 'duplicate'; readonly paper: PaperDetails };

export interface PaperDataGateway {
  listPapers(query?: PaperListQuery): Promise<PaperListResult>;
  getPaper(id: string): Promise<PaperDetails | null>;
  findPaperByHash(sha256: string): Promise<PaperDetails | null>;
  createImportedPaper(input: ImportedPaperRecord): Promise<CreateImportedPaperResult>;
  updatePaperDetails(input: PaperDetailsUpdate): Promise<PaperDetails>;
  updatePaperMetadata(input: PaperMetadataUpdate): Promise<PaperDetails>;
  updatePaperOrganization(input: PaperOrganizationUpdate): Promise<PaperDetails>;
  batchUpdatePapers(input: BatchPaperUpdate): Promise<BatchPaperUpdateResult>;
  listOrganization(): Promise<LibraryOrganization>;
  createTag(input: CreateTagInput): Promise<Tag>;
  deleteTag(id: string): Promise<void>;
  createCollection(input: CreateCollectionInput): Promise<Collection>;
  deleteCollection(id: string): Promise<void>;
  listPendingPaperTextExtractions(): Promise<readonly PendingPaperTextExtraction[]>;
  savePaperTextExtraction(input: PaperTextExtractionRecord): Promise<void>;
  removePaperRecord(id: string): Promise<PaperDetails>;
  getManagedPaperFile(paperId: string): Promise<ManagedPaperFileRecord | null>;
  listAnnotations(paperId: string): Promise<readonly Annotation[]>;
  createAnnotation(input: CreateAnnotationInput): Promise<Annotation>;
  updateAnnotation(input: UpdateAnnotationInput): Promise<Annotation>;
  deleteAnnotation(id: string, rowVersion: number): Promise<void>;
  getReadingState(paperId: string): Promise<ReadingState | null>;
  saveReadingState(input: SaveReadingStateInput): Promise<ReadingState>;
  backupTo(destinationPath: string): Promise<void>;
  restoreFrom(sourcePath: string): Promise<void>;
  getMigrationVersions(): Promise<readonly number[]>;
  close(): Promise<void>;
}
