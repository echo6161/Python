import { describe, expect, it } from 'vitest';

import { IPC_CHANNELS } from '../../src/shared/contracts/app';
import { LIBRARY_IPC_CHANNELS } from '../../src/shared/contracts/library';

describe('IPC contract', () => {
  it('contains only fixed application and Phase 2 library channels', () => {
    expect(IPC_CHANNELS).toEqual({
      appGetInfo: 'app:get-info',
    });
    expect(LIBRARY_IPC_CHANNELS).toEqual({
      chooseAndImportPdfs: 'dialog:choose-pdfs',
      importDroppedPdfs: 'papers:import-dropped',
      listPapers: 'papers:list',
      getPaper: 'papers:get',
      updatePaperMetadata: 'papers:update-metadata',
      removePaper: 'papers:remove',
    });
    expect(Object.isFrozen(IPC_CHANNELS)).toBe(true);
    expect(Object.isFrozen(LIBRARY_IPC_CHANNELS)).toBe(true);
  });
});
