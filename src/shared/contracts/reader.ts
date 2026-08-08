import type { ApiResult } from './library';

export const READER_IPC_CHANNELS = Object.freeze({
  getPdfAccess: 'papers:get-pdf-access',
  getReadingState: 'reader:get-state',
  saveReadingState: 'reader:save-state',
  listAnnotations: 'annotations:list',
  createAnnotation: 'annotations:create',
  updateAnnotation: 'annotations:update',
  deleteAnnotation: 'annotations:delete',
  exportAnnotations: 'annotations:export',
});

export type ReaderIpcChannels = typeof READER_IPC_CHANNELS;
export type AnnotationType = 'highlight' | 'underline';
export type AnnotationColor = 'yellow' | 'green' | 'blue' | 'pink';
export type AnnotationExportFormat = 'markdown' | 'json';

export interface BoundingRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Annotation {
  readonly id: string;
  readonly paperId: string;
  readonly paperFileId: string;
  readonly pageNumber: number;
  readonly selectedText: string;
  readonly textQuotePrefix: string;
  readonly textQuoteSuffix: string;
  readonly textStart: number;
  readonly textEnd: number;
  readonly boundingRects: readonly BoundingRect[];
  readonly annotationType: AnnotationType;
  readonly color: AnnotationColor;
  readonly comment: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
}

export interface CreateAnnotationInput {
  readonly paperId: string;
  readonly pageNumber: number;
  readonly selectedText: string;
  readonly textQuotePrefix: string;
  readonly textQuoteSuffix: string;
  readonly textStart: number;
  readonly textEnd: number;
  readonly boundingRects: readonly BoundingRect[];
  readonly annotationType: AnnotationType;
  readonly color: AnnotationColor;
  readonly comment: string | null;
}

export interface UpdateAnnotationInput {
  readonly id: string;
  readonly rowVersion: number;
  readonly annotationType: AnnotationType;
  readonly color: AnnotationColor;
  readonly comment: string | null;
}

export interface DeleteAnnotationInput {
  readonly id: string;
  readonly rowVersion: number;
}

export interface ReadingState {
  readonly paperId: string;
  readonly pageNumber: number;
  readonly scale: number;
  readonly updatedAt: string;
}

export interface SaveReadingStateInput {
  readonly paperId: string;
  readonly pageNumber: number;
  readonly scale: number;
}

export interface PdfAccess {
  readonly url: string;
}

export interface AnnotationExportRequest {
  readonly paperId: string;
  readonly format: AnnotationExportFormat;
}

export interface AnnotationExportResult {
  readonly cancelled: boolean;
  readonly filename: string | null;
  readonly annotationCount: number;
}

export interface ReaderApi {
  getPdfAccess(paperId: string): Promise<ApiResult<PdfAccess>>;
  getReadingState(paperId: string): Promise<ApiResult<ReadingState | null>>;
  saveReadingState(input: SaveReadingStateInput): Promise<ApiResult<ReadingState>>;
  listAnnotations(paperId: string): Promise<ApiResult<readonly Annotation[]>>;
  createAnnotation(input: CreateAnnotationInput): Promise<ApiResult<Annotation>>;
  updateAnnotation(input: UpdateAnnotationInput): Promise<ApiResult<Annotation>>;
  deleteAnnotation(input: DeleteAnnotationInput): Promise<ApiResult<{ readonly id: string }>>;
  exportAnnotations(input: AnnotationExportRequest): Promise<ApiResult<AnnotationExportResult>>;
}
