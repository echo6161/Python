import type {
  BatchPaperUpdate,
  CreateCollectionInput,
  CreateTagInput,
  PaperDetailsUpdate,
  PaperListQuery,
  PaperMetadataUpdate,
  PaperOrganizationUpdate,
} from '../../shared/contracts/library';
import type {
  CreateAnnotationInput,
  SaveReadingStateInput,
  UpdateAnnotationInput,
} from '../../shared/contracts/reader';
import type { AiProviderSettings } from '../../shared/contracts/ai';
import type {
  CreateWorkspaceInput,
  SetWorkspaceStatusInput,
  UpdateWorkspaceInput,
} from '../../shared/contracts/workspace';
import type { ZoteroItemRef } from '../../shared/contracts/zotero';
import type { CreateAiTurnInput, FinalizeAiMessageInput } from '../ai/ai-data-gateway';
import type { ImportedPaperRecord, PaperTextExtractionRecord } from '../library/paper-data-gateway';

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
      readonly method: 'updatePaperDetails';
      readonly payload: PaperDetailsUpdate;
    }
  | {
      readonly id: number;
      readonly method: 'updatePaperMetadata';
      readonly payload: PaperMetadataUpdate;
    }
  | {
      readonly id: number;
      readonly method: 'updatePaperOrganization';
      readonly payload: PaperOrganizationUpdate;
    }
  | {
      readonly id: number;
      readonly method: 'batchUpdatePapers';
      readonly payload: BatchPaperUpdate;
    }
  | { readonly id: number; readonly method: 'listOrganization'; readonly payload: null }
  | { readonly id: number; readonly method: 'createTag'; readonly payload: CreateTagInput }
  | { readonly id: number; readonly method: 'deleteTag'; readonly payload: { readonly id: string } }
  | {
      readonly id: number;
      readonly method: 'createCollection';
      readonly payload: CreateCollectionInput;
    }
  | {
      readonly id: number;
      readonly method: 'deleteCollection';
      readonly payload: { readonly id: string };
    }
  | {
      readonly id: number;
      readonly method: 'listPendingPaperTextExtractions';
      readonly payload: null;
    }
  | {
      readonly id: number;
      readonly method: 'savePaperTextExtraction';
      readonly payload: PaperTextExtractionRecord;
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
  | { readonly id: number; readonly method: 'getAiSettings'; readonly payload: null }
  | {
      readonly id: number;
      readonly method: 'saveAiSettings';
      readonly payload: AiProviderSettings;
    }
  | {
      readonly id: number;
      readonly method: 'createAiTurn';
      readonly payload: CreateAiTurnInput;
    }
  | {
      readonly id: number;
      readonly method: 'finalizeAiMessage';
      readonly payload: FinalizeAiMessageInput;
    }
  | {
      readonly id: number;
      readonly method: 'getLatestAiConversation';
      readonly payload: { readonly paperId: string };
    }
  | {
      readonly id: number;
      readonly method: 'getAiConversation';
      readonly payload: { readonly conversationId: string };
    }
  | { readonly id: number; readonly method: 'markStaleAiMessages'; readonly payload: null }
  | {
      readonly id: number;
      readonly method: 'createWorkspace';
      readonly payload: CreateWorkspaceInput;
    }
  | {
      readonly id: number;
      readonly method: 'getWorkspace';
      readonly payload: { readonly id: string };
    }
  | { readonly id: number; readonly method: 'listWorkspaces'; readonly payload: null }
  | {
      readonly id: number;
      readonly method: 'updateWorkspace';
      readonly payload: UpdateWorkspaceInput;
    }
  | {
      readonly id: number;
      readonly method: 'setWorkspaceStatus';
      readonly payload: SetWorkspaceStatusInput;
    }
  | {
      readonly id: number;
      readonly method: 'deleteWorkspace';
      readonly payload: { readonly id: string };
    }
  | { readonly id: number; readonly method: 'getLastActiveWorkspace'; readonly payload: null }
  | {
      readonly id: number;
      readonly method: 'setLastActiveWorkspace';
      readonly payload: { readonly workspaceId: string | null };
    }
  | {
      readonly id: number;
      readonly method: 'addWorkspaceZoteroPaper';
      readonly payload: { readonly workspaceId: string; readonly itemRef: ZoteroItemRef };
    }
  | {
      readonly id: number;
      readonly method: 'removeWorkspaceZoteroPaper';
      readonly payload: { readonly workspaceId: string; readonly itemRef: ZoteroItemRef };
    }
  | {
      readonly id: number;
      readonly method: 'listWorkspaceZoteroPapers';
      readonly payload: { readonly workspaceId: string };
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
