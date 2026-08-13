import { describe, expect, it } from 'vitest';

import {
  addResearchReferenceSchema,
  confirmResearchMemoryExportSchema,
  createResearchMemoryProposalSchema,
  updateResearchContentSchema,
} from '../../src/main/ipc/research-memory-schemas';

const id = '550e8400-e29b-41d4-a716-446655440001';

describe('Research Memory IPC schemas', () => {
  it('rejects invalid status, arbitrary paths, extra URL fields and cross-shape input', () => {
    expect(
      updateResearchContentSchema.safeParse({
        workspaceId: id,
        type: 'note',
        id,
        title: 'N',
        bodyMarkdown: '',
        status: 'confirmed',
        rowVersion: 1,
      }).success,
    ).toBe(false);
    expect(
      addResearchReferenceSchema.safeParse({
        workspaceId: id,
        type: 'note',
        id,
        chunkId: id,
        path: 'C:\\secret.txt',
      }).success,
    ).toBe(false);
    expect(
      createResearchMemoryProposalSchema.safeParse({
        workspaceId: id,
        sourceNoteId: id,
        reason: 'Keep',
        url: 'http://127.0.0.1:1',
      }).success,
    ).toBe(false);
    expect(
      confirmResearchMemoryExportSchema.safeParse({
        previewId: id,
        confirmation: 'OVERWRITE',
        path: '/tmp/x',
      }).success,
    ).toBe(false);
  });

  it('accepts only domain-specific bounded inputs', () => {
    expect(
      createResearchMemoryProposalSchema.parse({
        workspaceId: id,
        sourceNoteId: id,
        reason: 'Keep this finding.',
      }),
    ).toEqual({ workspaceId: id, sourceNoteId: id, reason: 'Keep this finding.' });
    expect(
      confirmResearchMemoryExportSchema.parse({ previewId: id, confirmation: 'EXPORT_NEW_FILE' }),
    ).toEqual({ previewId: id, confirmation: 'EXPORT_NEW_FILE' });
  });
});
