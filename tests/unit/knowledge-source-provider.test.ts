import { describe, expect, it, vi } from 'vitest';

import { chunkText } from '../../src/main/knowledge/deterministic-chunker';
import { WorkspaceKnowledgeSourceProvider } from '../../src/main/knowledge/workspace-knowledge-source-provider';
import type { Workspace } from '../../src/shared/contracts/workspace';
import type {
  ZoteroAttachment,
  ZoteroItemDetails,
  ZoteroItemRef,
} from '../../src/shared/contracts/zotero';

const workspace: Workspace = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Knowledge',
  description: '',
  researchGoal: '',
  status: 'active',
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
  rowVersion: 1,
};
const itemRef: ZoteroItemRef = {
  serverId: 'ServerIdentity01',
  library: { type: 'user', id: '0' },
  itemKey: 'PAPERAA2',
};
const attachment: ZoteroAttachment = {
  ref: { ...itemRef, itemKey: 'PDFATT22' },
  parentItemRef: itemRef,
  title: 'PDF',
  filename: 'paper.pdf',
  contentType: 'application/pdf',
  linkMode: 'imported_file',
  isPdf: true,
  pdf: { hasPdf: true, state: 'available', storageMode: 'stored' },
  version: 7,
};
const item: ZoteroItemDetails = {
  ref: itemRef,
  itemType: 'journalArticle',
  title: 'Tracked paper',
  creators: [],
  date: '2026',
  year: 2026,
  publication: null,
  pdf: attachment.pdf,
  version: 4,
  doi: null,
  abstract: null,
  url: null,
  tags: [],
  collections: [],
};

describe('Workspace Knowledge source extraction', () => {
  it('extracts Zotero PDF text by page without exposing the resolved file path', async () => {
    const extract = vi.fn().mockResolvedValue({
      status: 'complete',
      pageCount: 2,
      title: emptyCandidate(),
      authors: emptyCandidate(),
      abstract: emptyCandidate(),
      doi: emptyCandidate(),
      pages: [
        { pageNumber: 1, text: 'Introduction and motivation.', status: 'complete' },
        { pageNumber: 2, text: 'A deterministic clipping objective.', status: 'complete' },
      ],
      issues: [],
    });
    const provider = new WorkspaceKnowledgeSourceProvider(
      {
        getWorkspace: () => Promise.resolve(workspace),
        listWorkspaceZoteroPapers: () =>
          Promise.resolve([
            { workspaceId: workspace.id, itemRef, addedAt: workspace.createdAt, sortOrder: 0 },
          ]),
      },
      { listWorkspaceRepositories: () => Promise.resolve([]) },
      { listCodeChunksForKnowledge: () => Promise.resolve([]) },
      { listQuestions: () => Promise.resolve([]) },
      { listPaperCodeLinks: () => Promise.resolve([]) },
      {
        getItem: () => Promise.resolve(item),
        findPrimaryPdf: () => Promise.resolve(attachment),
        resolvePrimaryPdfFile: () =>
          Promise.resolve({ attachment, filePath: 'C:\\private\\zotero.pdf' }),
      },
      { extract },
    );
    const [source] = await provider.discover(workspace.id, new AbortController().signal);
    const result = await source?.extract(new AbortController().signal);
    expect(extract).toHaveBeenCalledWith('C:\\private\\zotero.pdf', expect.any(AbortSignal));
    expect(result?.chunks).toHaveLength(2);
    expect(result?.chunks[1]).toMatchObject({
      citation: 'Tracked paper, p. 2',
      provenance: { sourceType: 'paper', pageNumber: 2, attachmentKey: 'PDFATT22' },
    });
    expect(JSON.stringify(result)).not.toContain('C:\\private');
  });

  it('keeps unavailable PDFs as explicit empty sources', async () => {
    const provider = new WorkspaceKnowledgeSourceProvider(
      {
        getWorkspace: () => Promise.resolve(workspace),
        listWorkspaceZoteroPapers: () =>
          Promise.resolve([
            { workspaceId: workspace.id, itemRef, addedAt: workspace.createdAt, sortOrder: 0 },
          ]),
      },
      { listWorkspaceRepositories: () => Promise.resolve([]) },
      { listCodeChunksForKnowledge: () => Promise.resolve([]) },
      { listQuestions: () => Promise.resolve([]) },
      { listPaperCodeLinks: () => Promise.resolve([]) },
      {
        getItem: () =>
          Promise.resolve({
            ...item,
            pdf: { hasPdf: true, state: 'not_local', storageMode: 'stored' },
          }),
        findPrimaryPdf: () =>
          Promise.resolve({
            ...attachment,
            pdf: { hasPdf: true, state: 'not_local', storageMode: 'stored' },
          }),
        resolvePrimaryPdfFile: vi.fn(),
      },
      { extract: vi.fn() },
    );
    const [source] = await provider.discover(workspace.id, new AbortController().signal);
    await expect(source?.extract(new AbortController().signal)).resolves.toMatchObject({
      unavailableReason: 'The Zotero PDF is not downloaded locally.',
      chunks: [],
    });
  });
});

describe('deterministic Knowledge chunking', () => {
  it('is stable, bounded, and overlaps long text', () => {
    const text = Array.from(
      { length: 500 },
      (_, index) => `Sentence ${String(index)} explains policy optimization.`,
    ).join(' ');
    const first = chunkText(text);
    const second = chunkText(text);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(1);
    expect(first.every(({ content }) => content.length <= 1_800)).toBe(true);
    expect(new Set(first.map(({ contentHash }) => contentHash)).size).toBe(first.length);
  });
});

function emptyCandidate() {
  return { value: null, source: 'none', confidence: 'unconfirmed' } as const;
}
