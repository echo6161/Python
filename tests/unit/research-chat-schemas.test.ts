// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { invokeResearchChatValidated } from '../../src/main/ipc/research-chat-ipc';
import { openKnowledgeResultOutputSchema } from '../../src/main/ipc/knowledge-schemas';
import {
  openResearchChatCitationSchema,
  prepareResearchChatContextSchema,
  startResearchChatTurnSchema,
  researchChatTurnAcceptedSchema,
} from '../../src/main/ipc/research-chat-schemas';
import { ZoteroBridgeError } from '../../src/main/zotero/zotero-errors';

const id = '550e8400-e29b-41d4-a716-446655440000';

describe('Research Chat IPC schemas', () => {
  it('accepts only domain-specific context and citation inputs', () => {
    expect(
      prepareResearchChatContextSchema.parse({
        workspaceId: id,
        questionId: null,
        query: 'clipping evidence',
        sourceTypes: ['paper', 'code'],
      }),
    ).toMatchObject({ query: 'clipping evidence' });
    expect(
      openResearchChatCitationSchema.parse({
        workspaceId: id,
        conversationId: id,
        messageId: id,
        alias: 'S1',
      }),
    ).toMatchObject({ alias: 'S1' });
  });

  it('rejects arbitrary endpoints, source payloads, duplicate aliases, and malformed ids', () => {
    expect(() =>
      prepareResearchChatContextSchema.parse({
        workspaceId: id,
        questionId: null,
        query: 'query',
        sourceTypes: ['paper'],
        url: 'http://localhost:23119/arbitrary',
      }),
    ).toThrow();
    expect(() =>
      startResearchChatTurnSchema.parse({
        contextId: id,
        selectedAliases: ['S1', 'S1'],
        conversationId: null,
        sources: [{ snippet: 'renderer supplied' }],
      }),
    ).toThrow();
    expect(() =>
      openResearchChatCitationSchema.parse({
        workspaceId: id,
        conversationId: id,
        messageId: id,
        alias: '../secret',
      }),
    ).toThrow();
  });

  it('accepts a completed IPC handshake from the Codex provider', () => {
    expect(
      researchChatTurnAcceptedSchema.parse({
        requestId: id,
        assistantMessageId: id,
        conversation: {
          id,
          workspaceId: id,
          questionId: null,
          title: 'Explain DQN',
          providerId: 'codex',
          model: 'gpt-5.6-sol',
          messages: [],
          createdAt: '2026-08-13T06:08:22.000Z',
          updatedAt: '2026-08-13T06:08:22.000Z',
        },
      }).conversation.providerId,
    ).toBe('codex');
  });

  it('preserves a safe Zotero launch failure when opening a citation', async () => {
    const mainFrame = {};
    const event = { senderFrame: mainFrame, sender: { mainFrame } } as never;

    await expect(
      invokeResearchChatValidated(event, openKnowledgeResultOutputSchema, () =>
        Promise.reject(
          new ZoteroBridgeError(
            'ZOTERO_LAUNCH_FAILED',
            'Zotero could not be opened. Repair or reinstall Zotero so zotero:// links use the current application.',
          ),
        ),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'ZOTERO_LAUNCH_FAILED' },
    });
  });
});
