import type { PaperListQuery, PaperMetadataUpdate } from '../../shared/contracts/library';
import type {
  CreateAnnotationInput,
  SaveReadingStateInput,
  UpdateAnnotationInput,
} from '../../shared/contracts/reader';
import type { ImportedPaperRecord } from '../library/paper-data-gateway';

export type DatabaseWorkerRequest =
  | { readonly id: number; readonly method: 'listPapers'; readonly payload: PaperListQuery }
  | { readonly id: number; readonly method: 'getPaper'; readonly payload: { readonly id: string } }
  | {
      readonly id: number;
      readonly method: 'findPaperByHash';
      readonly payload: { readonly sha256: string };
    }
  | {
      readonly id: number;
      readonly method: 'createImportedPaper';
      readonly payload: ImportedPaperRecord;
    }
  | {
      readonly id: number;
      readonly method: 'updatePaperMetadata';
      readonly payload: PaperMetadataUpdate;
    }
  | {
      readonly id: number;
      readonly method: 'removePaperRecord';
      readonly payload: { readonly id: string };
    }
  | {
      readonly id: number;
      readonly method: 'getManagedPaperFile';
      readonly payload: { readonly paperId: string };
    }
  | {
      readonly id: number;
      readonly method: 'listAnnotations';
      readonly payload: { readonly paperId: string };
    }
  | {
      readonly id: number;
      readonly method: 'createAnnotation';
      readonly payload: CreateAnnotationInput;
    }
  | {
      readonly id: number;
      readonly method: 'updateAnnotation';
      readonly payload: UpdateAnnotationInput;
    }
  | {
      readonly id: number;
      readonly method: 'deleteAnnotation';
      readonly payload: { readonly id: string; readonly rowVersion: number };
    }
  | {
      readonly id: number;
      readonly method: 'getReadingState';
      readonly payload: { readonly paperId: string };
    }
  | {
      readonly id: number;
      readonly method: 'saveReadingState';
      readonly payload: SaveReadingStateInput;
    }
  | {
      readonly id: number;
      readonly method: 'backupTo';
      readonly payload: { readonly destinationPath: string };
    }
  | {
      readonly id: number;
      readonly method: 'restoreFrom';
      readonly payload: { readonly sourcePath: string };
    }
  | { readonly id: number; readonly method: 'getMigrationVersions'; readonly payload: null }
  | { readonly id: number; readonly method: 'close'; readonly payload: null };

export type DatabaseWorkerResponse =
  | { readonly id: number; readonly ok: true; readonly value: unknown }
  | {
      readonly id: number;
      readonly ok: false;
      readonly error: { readonly code?: string; readonly message: string };
    };

export interface DatabaseWorkerData {
  readonly databasePath: string;
}
