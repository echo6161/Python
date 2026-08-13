// @vitest-environment node

import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { AiAssistantService } from '../../src/main/ai/ai-assistant-service';
import { AiSecretStore, type SafeStorageAdapter } from '../../src/main/ai/secret-store';
import { LibraryDatabase } from '../../src/main/database/library-database';
import { sha256 } from '../../src/main/knowledge/deterministic-chunker';
import { KnowledgeEngineService } from '../../src/main/knowledge/knowledge-engine-service';
import type {
  KnowledgeSourceDescriptor,
  KnowledgeSourceProvider,
} from '../../src/main/knowledge/knowledge-source';
import { ResearchChatService } from '../../src/main/research-chat/research-chat-service';
import type { ResearchChatStreamEvent } from '../../src/shared/contracts/research-chat';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Research Chat integration', () => {
  it('persists auditable paper and code citations with Workspace and Question isolation', async () => {
    const fixture = await createFixture();
    const question = await fixture.database.createQuestion({
      workspaceId: fixture.workspaceId,
      title: 'Does clipping constrain KL?',
      description: '',
      priority: 'high',
    });
    const service = await createService(fixture, { delayMs: 1 });
    const preview = await service.prepareContext(
      {
        workspaceId: fixture.workspaceId,
        questionId: question.id,
        query: 'clipped',
        sourceTypes: ['paper', 'code'],
      },
      7,
    );
    expect(preview.sources.map(({ sourceType }) => sourceType).sort()).toEqual(['code', 'paper']);

    const terminal = terminalEvent();
    const accepted = await service.startTurn(
      {
        contextId: preview.id,
        selectedAliases: preview.sources.map(({ alias }) => alias),
        conversationId: null,
      },
      7,
      terminal.emit,
    );
    const completed = await terminal.promise;
    expect(completed.type).toBe('completed');

    const persisted = await fixture.database.getLatestResearchChatConversation(
      fixture.workspaceId,
      question.id,
    );
    expect(persisted).toMatchObject({
      id: accepted.conversation.id,
      workspaceId: fixture.workspaceId,
    });
    expect(
      persisted?.messages
        .at(-1)
        ?.citations.map(({ source }) => source.sourceType)
        .sort(),
    ).toEqual(['code', 'paper']);
    expect(persisted?.messages.at(-1)?.unsupportedCitations).toEqual([]);
    const completedMessage = persisted?.messages.at(-1);
    const firstCitation = completedMessage?.citations[0];
    if (!completedMessage || !firstCitation)
      throw new Error('Completed citation fixture is missing.');
    await expect(
      service.openCitation({
        workspaceId: fixture.workspaceId,
        conversationId: accepted.conversation.id,
        messageId: completedMessage.id,
        alias: firstCitation.alias,
      }),
    ).resolves.toMatchObject({ target: firstCitation.source.sourceType });
    await expect(
      service.openCitation({
        workspaceId: fixture.workspaceId,
        conversationId: accepted.conversation.id,
        messageId: completedMessage.id,
        alias: 'S999',
      }),
    ).rejects.toThrow('does not contain');

    const other = await fixture.database.createWorkspace({
      name: 'Other',
      description: '',
      researchGoal: '',
    });
    await expect(service.getLatestConversation(other.id, question.id)).rejects.toThrow(
      'unavailable',
    );
    await expect(
      fixture.database.getResearchChatConversation(other.id, accepted.conversation.id),
    ).resolves.toBeNull();

    await service.shutdown();
    await fixture.database.close();
    const raw = new BetterSqlite3(fixture.databasePath, { readonly: true });
    expect(
      raw.prepare('SELECT count(*) AS count FROM research_chat_context_sources').get(),
    ).toEqual({ count: 2 });
    expect(
      raw
        .prepare("SELECT count(*) AS count FROM research_chat_messages WHERE role = 'assistant'")
        .get(),
    ).toEqual({ count: 1 });
    expect(raw.prepare('SELECT count(*) AS count FROM research_questions').get()).toEqual({
      count: 1,
    });
    expect(raw.prepare('SELECT count(*) AS count FROM paper_code_links').get()).toEqual({
      count: 0,
    });
    raw.close();

    const reopened = new LibraryDatabase(fixture.databasePath);
    expect(await reopened.getMigrationVersions()).toContain(10);
    expect(
      (await reopened.getLatestResearchChatConversation(fixture.workspaceId, question.id))
        ?.messages,
    ).toHaveLength(2);
    await reopened.close();
  });

  it('cancels, retries from the exact stored context, and does not require a paid API in tests', async () => {
    const fixture = await createFixture();
    const slow = await createService(fixture, { delayMs: 100 });
    const preview = await slow.prepareContext(
      {
        workspaceId: fixture.workspaceId,
        questionId: null,
        query: 'clipped',
        sourceTypes: ['paper', 'code'],
      },
      9,
    );
    const terminal = terminalEvent();
    const accepted = await slow.startTurn(
      {
        contextId: preview.id,
        selectedAliases: preview.sources.map(({ alias }) => alias),
        conversationId: null,
      },
      9,
      terminal.emit,
    );
    slow.cancelTurn(accepted.requestId, 9);
    expect((await terminal.promise).type).toBe('cancelled');
    await slow.shutdown();

    const fast = await createService(fixture, { delayMs: 1 });
    const retried = terminalEvent();
    await fast.retryTurn(
      {
        workspaceId: fixture.workspaceId,
        conversationId: accepted.conversation.id,
        assistantMessageId: accepted.assistantMessageId,
      },
      10,
      retried.emit,
    );
    expect((await retried.promise).type).toBe('completed');
    const conversation = await fixture.database.getResearchChatConversation(
      fixture.workspaceId,
      accepted.conversation.id,
    );
    expect(conversation?.messages.filter(({ role }) => role === 'user')).toHaveLength(1);
    expect(conversation?.messages.filter(({ role }) => role === 'assistant')).toHaveLength(2);
    expect(conversation?.messages.at(-1)?.citations).toHaveLength(2);
    await fast.shutdown();
    await fixture.database.close();
  });

  it('reports provider unavailable before creating a persistent turn', async () => {
    const fixture = await createFixture();
    const assistant = new AiAssistantService(
      fixture.database,
      new AiSecretStore({ userDataPath: fixture.root, safeStorage }),
    );
    const service = new ResearchChatService(
      fixture.database,
      fixture.knowledge,
      fixture.database,
      assistant,
    );
    await service.initialize();
    const preview = await service.prepareContext(
      {
        workspaceId: fixture.workspaceId,
        questionId: null,
        query: 'clipped',
        sourceTypes: ['paper', 'code'],
      },
      12,
    );
    await expect(
      service.startTurn(
        {
          contextId: preview.id,
          selectedAliases: preview.sources.map(({ alias }) => alias),
          conversationId: null,
        },
        12,
        () => undefined,
      ),
    ).rejects.toThrow('Configure an OpenAI API key');
    await expect(
      fixture.database.getLatestResearchChatConversation(fixture.workspaceId, null),
    ).resolves.toBeNull();
    await service.shutdown();
    await fixture.database.close();
  });
});

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'papermind-research-chat-'));
  roots.push(root);
  const databasePath = path.join(root, 'library.sqlite3');
  const database = new LibraryDatabase(databasePath);
  const workspace = await database.createWorkspace({
    name: 'Research Chat',
    description: '',
    researchGoal: 'Audit clipping',
  });
  const knowledge = new KnowledgeEngineService(database, new FixedSources(workspace.id));
  await knowledge.initialize();
  await knowledge.runIndex({ workspaceId: workspace.id, requestId: randomUUID(), mode: 'rebuild' });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = await knowledge.getStatus(workspace.id);
    if (status.status === 'ready') break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return { root, databasePath, database, knowledge, workspaceId: workspace.id };
}

async function createService(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  mockProviderOptions: { readonly delayMs: number },
) {
  const assistant = new AiAssistantService(
    fixture.database,
    new AiSecretStore({ userDataPath: fixture.root, safeStorage }),
    { useMockProvider: true, mockProviderOptions },
  );
  const service = new ResearchChatService(
    fixture.database,
    fixture.knowledge,
    fixture.database,
    assistant,
  );
  await service.initialize();
  return service;
}

function terminalEvent() {
  let emit: (event: ResearchChatStreamEvent) => void = () => undefined;
  const promise = new Promise<ResearchChatStreamEvent>((resolve) => {
    emit = (event) => {
      if (event.type !== 'delta') resolve(event);
    };
  });
  return { promise, emit };
}

class FixedSources implements KnowledgeSourceProvider {
  public constructor(private readonly workspaceId: string) {}
  public discover(workspaceId: string): Promise<readonly KnowledgeSourceDescriptor[]> {
    if (workspaceId !== this.workspaceId) return Promise.resolve([]);
    return Promise.resolve([paperSource(), codeSource()]);
  }
}

function paperSource(): KnowledgeSourceDescriptor {
  const content = 'The clipped surrogate objective bounds the probability ratio.';
  return {
    sourceType: 'paper',
    sourceIdentity: 'paper:ppo',
    snapshotIdentity: 'paper:v1',
    title: 'PPO clipping objective',
    fingerprint: sha256(content),
    sourceProvenance: {},
    extract: () =>
      Promise.resolve({
        unavailableReason: null,
        chunks: [
          {
            content,
            citation: 'PPO paper, p. 3',
            provenance: {
              sourceType: 'paper',
              sourceIdentity: 'paper:ppo',
              snapshotIdentity: 'paper:v1',
              indexedAt: '',
              itemRef: {
                serverId: 'ServerIdentity01',
                library: { type: 'user', id: '0' },
                itemKey: 'PAPERAA2',
              },
              attachmentKey: 'PDFATT22',
              pageNumber: 3,
            },
          },
        ],
      }),
  };
}

function codeSource(): KnowledgeSourceDescriptor {
  const content = 'The clipped objective is implemented by clippedObjective in the policy loss.';
  return {
    sourceType: 'code',
    sourceIdentity: 'code:policy',
    snapshotIdentity: 'commit:abc',
    title: 'src/policy.ts',
    fingerprint: sha256(content),
    sourceProvenance: {},
    extract: () =>
      Promise.resolve({
        unavailableReason: null,
        chunks: [
          {
            content,
            citation: 'repo/src/policy.ts:42-58',
            provenance: {
              sourceType: 'code',
              sourceIdentity: 'code:policy',
              snapshotIdentity: 'commit:abc',
              indexedAt: '',
              repositoryId: randomUUID(),
              repositoryName: 'fixture',
              language: 'typescript',
              relativePath: 'src/policy.ts',
              startLine: 42,
              endLine: 58,
            },
          },
        ],
      }),
  };
}

const safeStorage: SafeStorageAdapter = {
  isAsyncEncryptionAvailable: () => Promise.resolve(false),
  encryptStringAsync: (value) => Promise.resolve(Buffer.from(value)),
  decryptStringAsync: (value) =>
    Promise.resolve({ result: value.toString(), shouldReEncrypt: false }),
};
