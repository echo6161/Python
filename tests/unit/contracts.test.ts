import { describe, expect, it } from 'vitest';

import { IPC_CHANNELS } from '../../src/shared/contracts/app';
import { LIBRARY_IPC_CHANNELS } from '../../src/shared/contracts/library';
import { READER_IPC_CHANNELS } from '../../src/shared/contracts/reader';

describe('IPC contract', () => {
  it('contains only fixed application, library, and reader channels', () => {
    expect(IPC_CHANNELS).toEqual({
      appGetInfo: 'app:get-info',
    });
    expect(LIBRARY_IPC_CHANNELS).toEqual({
      chooseAndImportPdfs: 'dialog:choose-pdfs',
      importDroppedPdfs: 'papers:import-dropped',
      listPapers: 'papers:list',
      getPaper: 'papers:get',
      updatePaperDetails: 'papers:update-details',
      updatePaperMetadata: 'papers:update-metadata',
      updatePaperOrganization: 'papers:update-organization',
      batchUpdatePapers: 'papers:batch-update',
      listOrganization: 'library:list-organization',
      createTag: 'tags:create',
      deleteTag: 'tags:delete',
      createCollection: 'collections:create',
      deleteCollection: 'collections:delete',
      removePaper: 'papers:remove',
    });
    expect(Object.isFrozen(IPC_CHANNELS)).toBe(true);
    expect(Object.isFrozen(LIBRARY_IPC_CHANNELS)).toBe(true);
    expect(READER_IPC_CHANNELS).toEqual({
      getPdfAccess: 'papers:get-pdf-access',
      getReadingState: 'reader:get-state',
      saveReadingState: 'reader:save-state',
      listAnnotations: 'annotations:list',
      createAnnotation: 'annotations:create',
      updateAnnotation: 'annotations:update',
      deleteAnnotation: 'annotations:delete',
      exportAnnotations: 'annotations:export',
    });
    expect(Object.isFrozen(READER_IPC_CHANNELS)).toBe(true);
  });
});
