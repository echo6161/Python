import { describe, expect, it } from 'vitest';

import { IPC_CHANNELS } from '../../src/shared/contracts/app';
import { AI_IPC_CHANNELS } from '../../src/shared/contracts/ai';
import { LIBRARY_IPC_CHANNELS } from '../../src/shared/contracts/library';
import { READER_IPC_CHANNELS } from '../../src/shared/contracts/reader';
import { ZOTERO_IPC_CHANNELS } from '../../src/shared/contracts/zotero';
import { WORKSPACE_IPC_CHANNELS } from '../../src/shared/contracts/workspace';

describe('IPC contract', () => {
  it('contains only fixed application, library, reader, and AI channels', () => {
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
    expect(AI_IPC_CHANNELS).toEqual({
      getCapabilities: 'ai:get-capabilities',
      updateSettings: 'settings:update-ai',
      setApiKey: 'secrets:set-provider-key',
      deleteApiKey: 'secrets:delete-provider-key',
      getConversation: 'ai:get-conversation',
      openChatGptBridge: 'ai:open-chatgpt-bridge',
      startTask: 'ai:start-task',
      cancelTask: 'ai:cancel-task',
      streamEvent: 'events:ai-stream',
    });
    expect(Object.isFrozen(AI_IPC_CHANNELS)).toBe(true);
    expect(ZOTERO_IPC_CHANNELS).toEqual({
      detect: 'zotero:detect',
      listItems: 'zotero:list-items',
      searchItems: 'zotero:search-items',
      cancelRequest: 'zotero:cancel-request',
      getItem: 'zotero:get-item',
      listCollections: 'zotero:list-collections',
      listCollectionItems: 'zotero:list-collection-items',
      listAttachments: 'zotero:list-attachments',
      findPrimaryPdf: 'zotero:find-primary-pdf',
      resolvePdfAvailability: 'zotero:resolve-pdf-availability',
    });
    expect(Object.isFrozen(ZOTERO_IPC_CHANNELS)).toBe(true);
    expect(WORKSPACE_IPC_CHANNELS).toEqual({
      create: 'workspaces:create',
      get: 'workspaces:get',
      list: 'workspaces:list',
      update: 'workspaces:update',
      setStatus: 'workspaces:set-status',
      delete: 'workspaces:delete',
      getLastActive: 'workspaces:get-last-active',
      setLastActive: 'workspaces:set-last-active',
      addPaper: 'workspaces:add-zotero-paper',
      removePaper: 'workspaces:remove-zotero-paper',
      listPapers: 'workspaces:list-zotero-papers',
    });
    expect(Object.isFrozen(WORKSPACE_IPC_CHANNELS)).toBe(true);
  });
});
