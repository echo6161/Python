import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LibraryDatabase } from '../../src/main/database/library-database';
import { sha256 } from '../../src/main/knowledge/deterministic-chunker';
import type { EmbeddingProvider } from '../../src/main/knowledge/embedding-provider';
import { KnowledgeEngineService } from '../../src/main/knowledge/knowledge-engine-service';
import type {
  ExtractedKnowledgeChunk,
  KnowledgeSourceDescriptor,
  KnowledgeSourceProvider,
} from '../../src/main/knowledge/knowledge-source';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Research Knowledge Engine integration', () => {
  it('indexes page-aware mixed sources with keyword fallback and Workspace isolation', async () => {
    const fixture = await createFixture();
    const otherWorkspace = await fixture.database.createWorkspace({
      name: 'Other workspace',
      description: '',
      researchGoal: '',
    });
    const provider = new MutableSourceProvider(mixedSources(fixture.workspace.id));
    const service = new KnowledgeEngineService(fixture.database, provider);
    await service.initialize();

    await service.runIndex({
      workspaceId: fixture.workspace.id,
      requestId: randomUUID(),
      mode: 'incremental',
    });
    const ready = await waitForStatus(service, fixture.workspace.id, 'ready');
    expect(ready).toMatchObject({ sourceCount: 4, chunkCount: 4, embeddingProvider: null });

    const page = await service.search({
      workspaceId: fixture.workspace.id,
      query: 'clipping',
      sourceTypes: ['paper', 'code', 'question', 'link'],
    });
    expect(page.mode).toBe('keyword');
    expect(page.results.map(({ sourceType }) => sourceType).sort()).toEqual([
      'code',
      'link',
      'paper',
      'question',
    ]);
    expect(page.results.find(({ sourceType }) => sourceType === 'paper')).toMatchObject({
      citation: 'PPO paper, p. 3',
      provenance: { sourceType: 'paper', pageNumber: 3 },
    });
    expect(page.results.every(({ snippet }) => snippet.length <= 520)).toBe(true);

    await expect(
      service.search({ workspaceId: otherWorkspace.id, query: 'clipping' }),
    ).resolves.toMatchObject({ results: [], total: 0 });
    await fixture.database.close();
  });

  it('performs incremental add/change/delete, survives restart, and removes rebuildable data', async () => {
    const fixture = await createFixture();
    const first = source(
      'question',
      'question:a',
      'alpha initial',
      questionProvenance('question:a'),
    );
    const unchanged = source('code', 'code:a', 'stable alpha code', codeProvenance('code:a'));
    const provider = new MutableSourceProvider([first, unchanged]);
    const service = new KnowledgeEngineService(fixture.database, provider);
    await service.initialize();
    await runAndWait(service, fixture.workspace.id, 'incremental');
    expect(provider.extractions).toEqual({ 'code:a': 1, 'question:a': 1 });

    provider.sources = [
      { ...first, fingerprint: sha256('temporarily offline'), transientUnavailable: true },
      unchanged,
    ];
    await runAndWait(service, fixture.workspace.id, 'incremental');
    expect(provider.extractions).toEqual({ 'code:a': 1, 'question:a': 1 });
    expect(
      await service.search({ workspaceId: fixture.workspace.id, query: 'initial' }),
    ).toMatchObject({ total: 1 });

    provider.sources = [
      source('question', 'question:a', 'alpha changed', questionProvenance('question:a')),
      unchanged,
      source('link', 'link:new', 'alpha new link', linkProvenance('link:new')),
    ];
    await runAndWait(service, fixture.workspace.id, 'incremental');
    expect(provider.extractions).toEqual({ 'code:a': 1, 'link:new': 1, 'question:a': 2 });
    expect(
      await service.search({ workspaceId: fixture.workspace.id, query: 'initial' }),
    ).toMatchObject({ total: 0 });
    expect(
      await service.search({
        workspaceId: fixture.workspace.id,
        query: 'alpha',
        sourceTypes: [],
      }),
    ).toMatchObject({ total: 0 });

    provider.sources = [unchanged];
    await runAndWait(service, fixture.workspace.id, 'incremental');
    expect(
      await service.search({ workspaceId: fixture.workspace.id, query: 'changed' }),
    ).toMatchObject({ total: 0 });
    await fixture.database.close();

    const reopened = new LibraryDatabase(fixture.databasePath);
    const restarted = new KnowledgeEngineService(reopened, provider);
    await restarted.initialize();
    expect(
      await restarted.search({ workspaceId: fixture.workspace.id, query: 'stable' }),
    ).toMatchObject({ total: 1 });
    expect(await restarted.removeIndex(fixture.workspace.id)).toBe(true);
    expect(await restarted.getStatus(fixture.workspace.id)).toMatchObject({
      status: 'unindexed',
      chunkCount: 0,
    });
    await restarted.runIndex({
      workspaceId: fixture.workspace.id,
      requestId: randomUUID(),
      mode: 'rebuild',
    });
    await waitForStatus(restarted, fixture.workspace.id, 'ready');
    expect(provider.extractions['code:a']).toBe(2);
    await reopened.close();
  });

  it('cancels active extraction and recovers an interrupted persisted job', async () => {
    const fixture = await createFixture();
    const provider = new MutableSourceProvider([blockingSource()]);
    const service = new KnowledgeEngineService(fixture.database, provider);
    await service.initialize();
    const requestId = randomUUID();
    await service.runIndex({ workspaceId: fixture.workspace.id, requestId, mode: 'incremental' });
    expect(await service.cancelIndex(requestId)).toBe(true);
    await waitForStatus(service, fixture.workspace.id, 'cancelled');

    await fixture.database.beginKnowledgeIndex({
      workspaceId: fixture.workspace.id,
      requestId: randomUUID(),
      indexVersion: 'interrupted-test',
      embeddingProvider: null,
      totalSources: 1,
      startedAt: new Date().toISOString(),
    });
    await fixture.database.close();
    const reopened = new LibraryDatabase(fixture.databasePath);
    const recovered = new KnowledgeEngineService(reopened, new MutableSourceProvider([]));
    await recovered.initialize();
    expect(await recovered.getStatus(fixture.workspace.id)).toMatchObject({
      status: 'cancelled',
      lastErrorCode: 'INTERRUPTED',
    });
    await reopened.close();
  });

  it('uses an explicit test embedding provider for hybrid retrieval', async () => {
    const fixture = await createFixture();
    const provider = new MutableSourceProvider([
      source(
        'question',
        'question:alpha',
        'policy optimization',
        questionProvenance('question:alpha'),
      ),
      source('question', 'question:beta', 'value baseline', questionProvenance('question:beta')),
    ]);
    const service = new KnowledgeEngineService(fixture.database, provider, testEmbeddingProvider);
    await service.initialize();
    await runAndWait(service, fixture.workspace.id, 'incremental');
    const page = await service.search({ workspaceId: fixture.workspace.id, query: 'policy' });
    expect(page.mode).toBe('hybrid');
    expect(page.results[0]).toMatchObject({ title: 'question:alpha', semanticScore: 1 });
    await fixture.database.close();
  });
});

class MutableSourceProvider implements KnowledgeSourceProvider {
  public extractions: Record<string, number> = {};
  public constructor(public sources: readonly KnowledgeSourceDescriptor[]) {}
  public discover(workspaceId: string): Promise<readonly KnowledgeSourceDescriptor[]> {
    if (!workspaceId) return Promise.resolve([]);
    return Promise.resolve(
      this.sources.map((descriptor) => ({
        ...descriptor,
        extract: async (signal: AbortSignal) => {
          this.extractions[descriptor.sourceIdentity] =
            (this.extractions[descriptor.sourceIdentity] ?? 0) + 1;
          return descriptor.extract(signal);
        },
      })),
    );
  }
}

function source(
  sourceType: KnowledgeSourceDescriptor['sourceType'],
  identity: string,
  content: string,
  provenance: ExtractedKnowledgeChunk['provenance'],
): KnowledgeSourceDescriptor {
  return {
    sourceType,
    sourceIdentity: identity,
    snapshotIdentity: `${identity}:${sha256(content)}`,
    title: identity,
    fingerprint: sha256(content),
    sourceProvenance: { identity },
    extract: () =>
      Promise.resolve({
        unavailableReason: null,
        chunks: [{ content, citation: citationFor(sourceType), provenance }],
      }),
  };
}

function mixedSources(workspaceId: string): readonly KnowledgeSourceDescriptor[] {
  return [
    source('paper', 'paper:a', 'PPO clipping objective', {
      sourceType: 'paper',
      sourceIdentity: 'paper:a',
      snapshotIdentity: 'paper-snapshot',
      indexedAt: '',
      itemRef: {
        serverId: 'server-identity',
        library: { type: 'user', id: '1' },
        itemKey: 'ABCD2345',
      },
      attachmentKey: 'BCDE2345',
      pageNumber: 3,
    }),
    source('code', 'code:a', 'clipping implementation', codeProvenance('code:a')),
    source(
      'question',
      'question:a',
      'Does clipping constrain KL?',
      questionProvenance('question:a'),
    ),
    source('link', 'link:a', 'clipping correspondence', linkProvenance('link:a')),
  ].map((descriptor) => ({ ...descriptor, sourceProvenance: { workspaceId } }));
}

function questionProvenance(identity: string): ExtractedKnowledgeChunk['provenance'] {
  return {
    sourceType: 'question',
    sourceIdentity: identity,
    snapshotIdentity: `${identity}:snapshot`,
    indexedAt: '',
    questionId: randomUUID(),
    status: 'investigating',
  };
}

function codeProvenance(identity: string): ExtractedKnowledgeChunk['provenance'] {
  return {
    sourceType: 'code',
    sourceIdentity: identity,
    snapshotIdentity: `${identity}:snapshot`,
    indexedAt: '',
    repositoryId: randomUUID(),
    repositoryName: 'fixture',
    language: 'typescript',
    relativePath: 'src/policy.ts',
    startLine: 10,
    endLine: 18,
  };
}

function linkProvenance(identity: string): ExtractedKnowledgeChunk['provenance'] {
  return {
    sourceType: 'link',
    sourceIdentity: identity,
    snapshotIdentity: `${identity}:snapshot`,
    indexedAt: '',
    linkId: randomUUID(),
    itemRef: {
      serverId: 'server-identity',
      library: { type: 'user', id: '1' },
      itemKey: 'ABCD2345',
    },
    repositoryId: randomUUID(),
    relativePath: 'src/policy.ts',
    startLine: 10,
    endLine: 18,
    pageNumber: 3,
  };
}

function citationFor(type: KnowledgeSourceDescriptor['sourceType']): string {
  return type === 'paper' ? 'PPO paper, p. 3' : `${type} fixture`;
}

function blockingSource(): KnowledgeSourceDescriptor {
  const descriptor = source(
    'question',
    'question:blocking',
    'blocking',
    questionProvenance('question:blocking'),
  );
  return {
    ...descriptor,
    extract: (signal) =>
      new Promise((resolve) =>
        signal.addEventListener('abort', () => resolve({ unavailableReason: null, chunks: [] }), {
          once: true,
        }),
      ),
  };
}

const testEmbeddingProvider: EmbeddingProvider = {
  id: 'test-embedding-v1',
  dimensions: 2,
  embed: (texts) =>
    Promise.resolve(texts.map((text) => (text.includes('policy') ? [1, 0] : [0, 1]))),
};

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'papermind-knowledge-'));
  roots.push(root);
  const databasePath = path.join(root, 'library.sqlite3');
  const database = new LibraryDatabase(databasePath);
  const workspace = await database.createWorkspace({
    name: 'Knowledge',
    description: '',
    researchGoal: '',
  });
  return { database, databasePath, workspace };
}

async function runAndWait(
  service: KnowledgeEngineService,
  workspaceId: string,
  mode: 'incremental' | 'rebuild',
) {
  await service.runIndex({ workspaceId, requestId: randomUUID(), mode });
  return waitForStatus(service, workspaceId, 'ready');
}

async function waitForStatus(
  service: KnowledgeEngineService,
  workspaceId: string,
  target: 'ready' | 'cancelled',
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = await service.getStatus(workspaceId);
    if (status.status === target) return status;
    if (status.status === 'failed') throw new Error(status.lastErrorMessage ?? 'Index failed');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${target}.`);
}
