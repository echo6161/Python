// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  createPaperCodeLinkSchema,
  deletePaperCodeLinkSchema,
} from '../../src/main/ipc/paper-code-link-schemas';

const INPUT = {
  workspaceId: '550e8400-e29b-41d4-a716-446655440001',
  itemRef: {
    serverId: 'ServerIdentity01',
    library: { type: 'user' as const, id: '0' },
    itemKey: 'PAPERAA2',
  },
  pageNumber: 3,
  locationLabel: 'Equation 7',
  repositoryId: '550e8400-e29b-41d4-a716-446655440002',
  codeSnapshotIdentity: 'snapshot:trusted',
  language: 'typescript' as const,
  relativePath: 'src/implementation.ts',
  symbolKind: 'function' as const,
  symbolName: 'implementClaim',
  startLine: 10,
  endLine: 20,
  contentHash: 'a'.repeat(64),
  relationType: 'implements' as const,
  label: 'Claim implementation',
  description: '',
};

describe('Paper-Code Link IPC validation', () => {
  it('accepts a bounded manual link and exact delete confirmation', () => {
    expect(createPaperCodeLinkSchema.parse(INPUT)).toBeDefined();
    expect(
      deletePaperCodeLinkSchema.parse({
        workspaceId: INPUT.workspaceId,
        id: '550e8400-e29b-41d4-a716-446655440003',
        confirmation: 'DELETE_LINK',
      }),
    ).toBeDefined();
  });

  it('rejects traversal, inverted ranges, invalid relation and arbitrary capability fields', () => {
    expect(() =>
      createPaperCodeLinkSchema.parse({ ...INPUT, relativePath: '../secret.txt' }),
    ).toThrow();
    expect(() =>
      createPaperCodeLinkSchema.parse({ ...INPUT, startLine: 30, endLine: 20 }),
    ).toThrow();
    expect(() =>
      createPaperCodeLinkSchema.parse({ ...INPUT, relationType: 'probably_similar' }),
    ).toThrow();
    expect(() =>
      createPaperCodeLinkSchema.parse({
        ...INPUT,
        pageNumber: undefined,
        locationLabel: '',
      }),
    ).toThrow();
    expect(() =>
      createPaperCodeLinkSchema.parse({
        ...INPUT,
        url: 'http://127.0.0.1:23119/api',
        filePath: 'C:\\private.txt',
        command: 'git show',
      }),
    ).toThrow();
  });

  it('does not accept AI provenance from Renderer', () => {
    expect(() =>
      createPaperCodeLinkSchema.parse({ ...INPUT, provenance: 'ai_proposed_confirmed' }),
    ).toThrow();
  });
});
