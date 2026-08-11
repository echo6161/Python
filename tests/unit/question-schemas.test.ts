// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  addCodeEvidenceSchema,
  addZoteroEvidenceSchema,
  createQuestionSchema,
  deleteQuestionSchema,
  reorderEvidenceSchema,
  setQuestionStatusSchema,
} from '../../src/main/ipc/question-schemas';

const WORKSPACE_ID = '550e8400-e29b-41d4-a716-446655440001';
const QUESTION_ID = '550e8400-e29b-41d4-a716-446655440002';
const REPOSITORY_ID = '550e8400-e29b-41d4-a716-446655440003';
const EVIDENCE_ID = '550e8400-e29b-41d4-a716-446655440004';
const ITEM_REF = {
  serverId: 'ServerIdentity01',
  library: { type: 'user' as const, id: '0' },
  itemKey: 'PAPERAA2',
};
const CODE = {
  workspaceId: WORKSPACE_ID,
  questionId: QUESTION_ID,
  repositoryId: REPOSITORY_ID,
  sourceSnapshotIdentity: 'content:' + 'a'.repeat(64),
  language: 'typescript' as const,
  relativePath: 'src/research.ts',
  symbolKind: 'function' as const,
  symbolName: 'evaluateEvidence',
  startLine: 10,
  endLine: 15,
  contentHash: 'b'.repeat(64),
  note: '',
};

describe('Question IPC validation', () => {
  it('accepts bounded Question and typed Evidence inputs', () => {
    expect(
      createQuestionSchema.parse({
        workspaceId: WORKSPACE_ID,
        title: 'Question?',
        description: '',
        priority: 'high',
      }),
    ).toBeDefined();
    expect(
      addZoteroEvidenceSchema.parse({
        workspaceId: WORKSPACE_ID,
        questionId: QUESTION_ID,
        itemRef: ITEM_REF,
        pageNumber: 3,
        note: '',
      }),
    ).toBeDefined();
    expect(addCodeEvidenceSchema.parse(CODE)).toBeDefined();
  });

  it('rejects empty/oversized Questions, illegal status, and missing delete confirmation', () => {
    expect(() =>
      createQuestionSchema.parse({
        workspaceId: WORKSPACE_ID,
        title: ' ',
        description: '',
        priority: 'normal',
      }),
    ).toThrow();
    expect(() =>
      createQuestionSchema.parse({
        workspaceId: WORKSPACE_ID,
        title: 'x'.repeat(301),
        description: '',
        priority: 'normal',
      }),
    ).toThrow();
    expect(() =>
      setQuestionStatusSchema.parse({
        id: QUESTION_ID,
        workspaceId: WORKSPACE_ID,
        status: 'archived',
        rowVersion: 1,
      }),
    ).toThrow();
    expect(() =>
      deleteQuestionSchema.parse({
        workspaceId: WORKSPACE_ID,
        questionId: QUESTION_ID,
        confirmation: 'DELETE',
      }),
    ).toThrow();
  });

  it('rejects traversal, absolute paths, inconsistent symbols, line inversions, and duplicate order', () => {
    for (const relativePath of [
      '../secret.txt',
      '/etc/passwd',
      'C:\\private.txt',
      '\\\\server\\share',
    ]) {
      expect(() => addCodeEvidenceSchema.parse({ ...CODE, relativePath })).toThrow();
    }
    expect(() => addCodeEvidenceSchema.parse({ ...CODE, symbolName: null })).toThrow();
    expect(() => addCodeEvidenceSchema.parse({ ...CODE, startLine: 20, endLine: 10 })).toThrow();
    expect(() =>
      reorderEvidenceSchema.parse({
        workspaceId: WORKSPACE_ID,
        questionId: QUESTION_ID,
        evidenceIds: [EVIDENCE_ID, EVIDENCE_ID],
      }),
    ).toThrow();
  });

  it('does not accept renderer-controlled URL, localhost, protocol, or file parameters', () => {
    expect(() =>
      addZoteroEvidenceSchema.parse({
        workspaceId: WORKSPACE_ID,
        questionId: QUESTION_ID,
        itemRef: ITEM_REF,
        note: '',
        url: 'http://127.0.0.1:23119/api',
        protocol: 'file:',
        filePath: 'C:\\private.pdf',
      }),
    ).toThrow();
    expect(() =>
      addCodeEvidenceSchema.parse({
        ...CODE,
        host: 'localhost',
        port: 22,
        command: 'git show',
        filePath: 'C:\\private.txt',
      }),
    ).toThrow();
  });
});
