// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  createWorkspaceSchema,
  deleteWorkspaceSchema,
  setWorkspaceStatusSchema,
  workspaceIdSchema,
  workspaceZoteroPaperInputSchema,
} from '../../src/main/ipc/workspace-schemas';

const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440000';
const ITEM_REF = {
  serverId: 'ServerIdentity01',
  library: { type: 'user', id: '0' },
  itemKey: 'PAPERAA2',
};

describe('Workspace IPC validation', () => {
  it('accepts bounded domain inputs', () => {
    expect(
      createWorkspaceSchema.parse({ name: 'Research', description: '', researchGoal: '' }),
    ).toEqual({
      name: 'Research',
      description: '',
      researchGoal: '',
    });
    expect(workspaceIdSchema.parse(WORKSPACE_ID)).toBe(WORKSPACE_ID);
    expect(
      workspaceZoteroPaperInputSchema.parse({ workspaceId: WORKSPACE_ID, itemRef: ITEM_REF }),
    ).toBeDefined();
  });

  it('rejects empty and oversized text, illegal status, and missing delete confirmation', () => {
    expect(() =>
      createWorkspaceSchema.parse({ name: ' ', description: '', researchGoal: '' }),
    ).toThrow();
    expect(() =>
      createWorkspaceSchema.parse({ name: 'x'.repeat(201), description: '', researchGoal: '' }),
    ).toThrow();
    expect(() =>
      setWorkspaceStatusSchema.parse({ id: WORKSPACE_ID, rowVersion: 1, status: 'deleted' }),
    ).toThrow();
    expect(() =>
      deleteWorkspaceSchema.parse({ id: WORKSPACE_ID, confirmation: 'DELETE' }),
    ).toThrow();
  });

  it('does not allow renderer-controlled network or file parameters', () => {
    expect(() =>
      workspaceZoteroPaperInputSchema.parse({
        workspaceId: WORKSPACE_ID,
        itemRef: ITEM_REF,
        protocol: 'http:',
        host: '127.0.0.1',
        port: 23119,
        url: 'http://127.0.0.1:9999/private',
        filePath: 'C:\\private.pdf',
      }),
    ).toThrow();
    expect(() =>
      workspaceZoteroPaperInputSchema.parse({
        workspaceId: WORKSPACE_ID,
        itemRef: { ...ITEM_REF, library: { type: 'user', id: '../storage' } },
      }),
    ).toThrow();
  });
});
