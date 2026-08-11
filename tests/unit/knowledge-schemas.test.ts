import { describe, expect, it } from 'vitest';

import {
  knowledgeSearchInputSchema,
  openKnowledgeResultSchema,
  removeKnowledgeIndexSchema,
  runKnowledgeIndexSchema,
} from '../../src/main/ipc/knowledge-schemas';

const workspaceId = '550e8400-e29b-41d4-a716-446655440001';
const requestId = '550e8400-e29b-41d4-a716-446655440002';

describe('Knowledge IPC schemas', () => {
  it('accepts only domain-specific index and search inputs', () => {
    expect(runKnowledgeIndexSchema.parse({ workspaceId, requestId, mode: 'incremental' })).toEqual({
      workspaceId,
      requestId,
      mode: 'incremental',
    });
    expect(
      knowledgeSearchInputSchema.parse({
        workspaceId,
        query: 'policy',
        sourceTypes: ['paper', 'code'],
      }),
    ).toMatchObject({ query: 'policy' });
    expect(openKnowledgeResultSchema.parse({ workspaceId, chunkId: requestId })).toEqual({
      workspaceId,
      chunkId: requestId,
    });
  });

  it('rejects arbitrary URLs, paths, unknown fields, and missing destructive confirmation', () => {
    expect(() =>
      knowledgeSearchInputSchema.parse({
        workspaceId,
        query: 'policy',
        url: 'http://127.0.0.1:23119',
      }),
    ).toThrow();
    expect(() =>
      openKnowledgeResultSchema.parse({
        workspaceId,
        chunkId: requestId,
        filePath: 'C:\\secret.txt',
      }),
    ).toThrow();
    expect(() =>
      runKnowledgeIndexSchema.parse({ workspaceId, requestId, mode: 'all', host: 'localhost' }),
    ).toThrow();
    expect(() => removeKnowledgeIndexSchema.parse({ workspaceId })).toThrow();
  });
});
