// @vitest-environment node

import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import type { AiProviderSettings } from '../../src/shared/contracts/ai';
import { LibraryDatabase } from '../../src/main/database/library-database';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function createHarness() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'papermind-ai-database-test-'));
  temporaryRoots.push(root);
  const databasePath = path.join(root, 'library.sqlite3');
  const database = new LibraryDatabase(databasePath);
  const paperId = randomUUID();
  const now = new Date().toISOString();
  await database.createImportedPaper({
    paperId,
    paperFileId: randomUUID(),
    fallbackTitle: 'Local AI test paper',
    metadata: [],
    pages: [],
    pageCount: 1,
    textExtractionStatus: 'succeeded',
    extractionErrorCode: null,
    sha256: 'a'.repeat(64),
    relativePath: 'papers/aa/managed.pdf',
    internalFilename: 'managed.pdf',
    originalFilename: 'source.pdf',
    byteSize: 128,
    importedAt: now,
  });
  return { database, databasePath, paperId };
}

function turnInput(paperId: string, conversationId: string | null, userContent: string) {
  return {
    conversationId,
    paperId,
    title: 'Selection assistant',
    providerId: 'openai' as const,
    model: 'gpt-5-mini',
    userContent,
  };
}

describe('AI database integration', () => {
  it('persists settings and terminal conversation states across restart without storing a key', async () => {
    const { database, databasePath, paperId } = await createHarness();
    const apiKeySentinel = 'phase5-database-secret-sentinel';
    const settingsWithUnexpectedSecret = {
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5-mini',
      temperature: 0.2,
      maxOutputTokens: 800,
      saveHistoryByDefault: true,
      apiKey: apiKeySentinel,
    } as AiProviderSettings;

    await expect(database.saveAiSettings(settingsWithUnexpectedSecret)).resolves.toEqual({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5-mini',
      temperature: 0.2,
      maxOutputTokens: 800,
      saveHistoryByDefault: true,
    });

    const completedTurn = await database.createAiTurn(
      turnInput(paperId, null, 'Translate the selected sentence.'),
    );
    await database.finalizeAiMessage({
      messageId: completedTurn.assistantMessageId,
      status: 'complete',
      content: 'Completed translation',
      providerRequestId: 'request-complete',
      inputTokens: 12,
      outputTokens: 8,
    });

    const cancelledTurn = await database.createAiTurn(
      turnInput(paperId, completedTurn.conversation.id, 'Explain this term.'),
    );
    await database.finalizeAiMessage({
      messageId: cancelledTurn.assistantMessageId,
      status: 'cancelled',
      content: 'Partial explanation',
      providerRequestId: null,
      inputTokens: null,
      outputTokens: null,
    });

    const failedTurn = await database.createAiTurn(
      turnInput(paperId, completedTurn.conversation.id, 'Follow up locally.'),
    );
    await database.finalizeAiMessage({
      messageId: failedTurn.assistantMessageId,
      status: 'failed',
      content: '',
      providerRequestId: null,
      inputTokens: null,
      outputTokens: null,
    });

    const interruptedTurn = await database.createAiTurn(
      turnInput(paperId, completedTurn.conversation.id, 'This response is interrupted.'),
    );
    expect(interruptedTurn.conversation.messages.at(-1)?.status).toBe('streaming');
    await database.close();

    const reopened = new LibraryDatabase(databasePath);
    expect(await reopened.markStaleAiMessages()).toBe(1);
    expect(await reopened.getAiSettings()).toEqual({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5-mini',
      temperature: 0.2,
      maxOutputTokens: 800,
      saveHistoryByDefault: true,
    });
    const persisted = await reopened.getAiConversation(completedTurn.conversation.id);
    expect(persisted?.messages.filter(({ role }) => role === 'assistant')).toMatchObject([
      { status: 'complete', content: 'Completed translation' },
      { status: 'cancelled', content: 'Partial explanation' },
      { status: 'failed', content: '' },
      { status: 'failed', content: '' },
    ]);
    expect(await reopened.getLatestAiConversation(paperId)).toEqual(persisted);
    await reopened.close();

    const rawDatabase = new BetterSqlite3(databasePath, { readonly: true });
    const persistedText = JSON.stringify([
      ...rawDatabase.prepare('SELECT key, value_json, updated_at FROM settings').all(),
      ...rawDatabase.prepare('SELECT * FROM ai_conversations').all(),
      ...rawDatabase.prepare('SELECT * FROM ai_messages').all(),
    ]);
    rawDatabase.close();
    expect(persistedText).not.toContain(apiKeySentinel);
    expect(persistedText).not.toContain('apiKey');
  });

  it('rejects cross-paper continuation and a second terminal transition', async () => {
    const { database, paperId } = await createHarness();
    const turn = await database.createAiTurn(turnInput(paperId, null, 'Initial request'));
    await database.finalizeAiMessage({
      messageId: turn.assistantMessageId,
      status: 'complete',
      content: 'Done',
      providerRequestId: null,
      inputTokens: null,
      outputTokens: null,
    });

    await expect(
      database.finalizeAiMessage({
        messageId: turn.assistantMessageId,
        status: 'cancelled',
        content: 'Too late',
        providerRequestId: null,
        inputTokens: null,
        outputTokens: null,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      database.createAiTurn(
        turnInput(randomUUID(), turn.conversation.id, 'Invalid cross-paper request'),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await database.close();
  });
});
