// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { AiAssistantService } from '../../src/main/ai/ai-assistant-service';
import type {
  AiDataGateway,
  CreateAiTurnInput,
  FinalizeAiMessageInput,
} from '../../src/main/ai/ai-data-gateway';
import { AiSecretStore, type SafeStorageAdapter } from '../../src/main/ai/secret-store';
import type {
  AiConversation,
  AiMessage,
  AiProviderSettings,
  AiStreamEvent,
  AiTaskInput,
} from '../../src/shared/contracts/ai';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

class MemoryAiData implements AiDataGateway {
  public settings: AiProviderSettings | null = null;
  public conversations = new Map<string, AiConversation>();
  public createCalls = 0;
  public finalizeCalls = 0;
  public failFinalize = false;

  public getAiSettings() {
    return Promise.resolve(this.settings);
  }

  public saveAiSettings(settings: AiProviderSettings) {
    this.settings = settings;
    return Promise.resolve(settings);
  }

  public createAiTurn(input: CreateAiTurnInput) {
    this.createCalls += 1;
    const now = new Date().toISOString();
    const id =
      input.conversationId ?? `550e8400-e29b-41d4-a716-${String(446655440010 + this.createCalls)}`;
    const prior = this.conversations.get(id);
    const user: AiMessage = {
      id: `550e8400-e29b-41d4-a716-4466554400${String(this.createCalls * 2).padStart(2, '0')}`,
      role: 'user',
      content: input.userContent,
      status: 'complete',
      createdAt: now,
    };
    const assistant: AiMessage = {
      id: `550e8400-e29b-41d4-a716-4466554400${String(this.createCalls * 2 + 1).padStart(2, '0')}`,
      role: 'assistant',
      content: '',
      status: 'streaming',
      createdAt: now,
    };
    const conversation: AiConversation = {
      id,
      paperId: input.paperId,
      title: input.title,
      providerId: 'openai',
      model: input.model,
      messages: [...(prior?.messages ?? []), user, assistant],
      createdAt: prior?.createdAt ?? now,
      updatedAt: now,
      persisted: true,
    };
    this.conversations.set(id, conversation);
    return Promise.resolve({ conversation, assistantMessageId: assistant.id });
  }

  public finalizeAiMessage(input: FinalizeAiMessageInput) {
    this.finalizeCalls += 1;
    if (this.failFinalize) return Promise.reject(new Error('Simulated storage failure'));
    for (const [id, conversation] of this.conversations) {
      const current = conversation.messages.find(
        ({ id: messageId }) => messageId === input.messageId,
      );
      if (!current) continue;
      const updated: AiMessage = { ...current, content: input.content, status: input.status };
      this.conversations.set(id, {
        ...conversation,
        messages: conversation.messages.map((message) =>
          message.id === input.messageId ? updated : message,
        ),
      });
      return Promise.resolve(updated);
    }
    return Promise.reject(new Error('Missing message'));
  }

  public getLatestAiConversation(paperId: string) {
    return Promise.resolve(
      [...this.conversations.values()].reverse().find((item) => item.paperId === paperId) ?? null,
    );
  }

  public getAiConversation(conversationId: string) {
    return Promise.resolve(this.conversations.get(conversationId) ?? null);
  }

  public markStaleAiMessages() {
    return Promise.resolve(0);
  }
}

const safeStorage: SafeStorageAdapter = {
  isAsyncEncryptionAvailable: () => Promise.resolve(true),
  encryptStringAsync: (value) => Promise.resolve(Buffer.from(`encrypted:${value}`, 'utf8')),
  decryptStringAsync: (value) =>
    Promise.resolve({
      result: value.toString('utf8').replace(/^encrypted:/u, ''),
      shouldReEncrypt: false,
    }),
};

async function createSecretStore(): Promise<AiSecretStore> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'papermind-ai-service-'));
  temporaryRoots.push(root);
  return new AiSecretStore({ userDataPath: root, safeStorage, platform: 'win32' });
}

const task: AiTaskInput = {
  kind: 'translate',
  paperId: '550e8400-e29b-41d4-a716-446655440000',
  selection: {
    paperId: '550e8400-e29b-41d4-a716-446655440000',
    paperTitle: 'Paper',
    pageNumber: 2,
    selectedText: 'Exact service selection',
    textStart: 0,
    textEnd: 23,
  },
  prompt: null,
  conversationId: null,
  saveHistory: true,
};

function terminalEventPromise(
  start: (emit: (event: AiStreamEvent) => void) => Promise<unknown>,
): Promise<AiStreamEvent> {
  return new Promise((resolve, reject) => {
    void start((event) => {
      if (event.type !== 'delta') resolve(event);
    }).catch(reject);
  });
}

describe('AiAssistantService', () => {
  it('streams a deterministic mock and persists the completed response', async () => {
    const data = new MemoryAiData();
    const service = new AiAssistantService(data, await createSecretStore(), {
      useMockProvider: true,
    });
    const event = await terminalEventPromise((emit) => service.startTask(task, 7, emit));
    expect(event.type).toBe('completed');
    expect(event.type === 'completed' ? event.message.content : '').toContain(
      'Exact service selection',
    );
    expect(data.createCalls).toBe(1);
    expect((await service.getConversation(task.paperId))?.messages.at(-1)?.status).toBe('complete');
  });

  it('cancels an active generation and persists its terminal state', async () => {
    const data = new MemoryAiData();
    const service = new AiAssistantService(data, await createSecretStore(), {
      useMockProvider: true,
      mockProviderOptions: { delayMs: 100 },
    });
    let requestId = '';
    const terminal = new Promise<AiStreamEvent>((resolve, reject) => {
      void service
        .startTask(task, 9, (event) => {
          if (event.type !== 'delta') resolve(event);
        })
        .then((accepted) => {
          requestId = accepted.requestId;
          service.cancelTask(requestId, 9);
        })
        .catch(reject);
    });
    const event = await terminal;
    expect(requestId).not.toBe('');
    expect(event.type).toBe('cancelled');
    expect((await service.getConversation(task.paperId))?.messages.at(-1)?.status).toBe(
      'cancelled',
    );
  });

  it('keeps a no-save conversation entirely out of the data gateway', async () => {
    const data = new MemoryAiData();
    const service = new AiAssistantService(data, await createSecretStore(), {
      useMockProvider: true,
    });
    const event = await terminalEventPromise((emit) =>
      service.startTask({ ...task, saveHistory: false }, 11, emit),
    );
    expect(event.type).toBe('completed');
    expect(data.createCalls).toBe(0);
    expect((await service.getConversation(task.paperId))?.persisted).toBe(false);
  });

  it('leaves non-AI capabilities available when no API key is configured', async () => {
    const data = new MemoryAiData();
    const service = new AiAssistantService(data, await createSecretStore());
    await expect(service.startTask(task, 3, () => undefined)).rejects.toThrow(
      'Configure an OpenAI API key',
    );
    expect((await service.getCapabilities()).credential.configured).toBe(false);
  });

  it('reports one safe storage error when terminal persistence fails', async () => {
    const data = new MemoryAiData();
    data.failFinalize = true;
    const service = new AiAssistantService(data, await createSecretStore(), {
      useMockProvider: true,
    });
    const event = await terminalEventPromise((emit) => service.startTask(task, 13, emit));
    expect(event.type).toBe('error');
    expect(event.type === 'error' ? event.error.code : '').toBe('STORAGE');
    expect(data.finalizeCalls).toBe(1);
  });

  it('rejects concurrent turns in the same conversation', async () => {
    const data = new MemoryAiData();
    const service = new AiAssistantService(data, await createSecretStore(), {
      useMockProvider: true,
      mockProviderOptions: { delayMs: 100 },
    });
    let resolveTerminal: (event: AiStreamEvent) => void = () => undefined;
    const terminal = new Promise<AiStreamEvent>((resolve) => {
      resolveTerminal = resolve;
    });
    const accepted = await service.startTask(task, 15, (event) => {
      if (event.type !== 'delta') resolveTerminal(event);
    });

    await expect(
      service.startTask({ ...task, conversationId: accepted.conversation.id }, 15, () => undefined),
    ).rejects.toThrow('Wait for the active AI response');
    service.cancelTask(accepted.requestId, 15);
    await expect(terminal).resolves.toMatchObject({ type: 'cancelled' });
  });

  it('starts a new conversation after the configured model changes', async () => {
    const data = new MemoryAiData();
    const service = new AiAssistantService(data, await createSecretStore(), {
      useMockProvider: true,
    });
    const firstTerminal = terminalEventPromise((emit) => service.startTask(task, 17, emit));
    await firstTerminal;
    const first = await service.getConversation(task.paperId);
    expect(first).not.toBeNull();
    data.settings = {
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5.6-sol',
      temperature: 0.2,
      maxOutputTokens: 512,
      saveHistoryByDefault: true,
    };

    await terminalEventPromise((emit) =>
      service.startTask({ ...task, conversationId: first?.id ?? null }, 17, emit),
    );
    expect(data.conversations.size).toBe(2);
    expect((await service.getConversation(task.paperId))?.model).toBe('gpt-5.6-sol');
  });

  it('cancels and settles active work before shutdown returns', async () => {
    const data = new MemoryAiData();
    const service = new AiAssistantService(data, await createSecretStore(), {
      useMockProvider: true,
      mockProviderOptions: { delayMs: 100 },
    });
    await service.startTask(task, 19, () => undefined);
    await service.shutdown();
    expect((await service.getConversation(task.paperId))?.messages.at(-1)?.status).toBe(
      'cancelled',
    );
    await expect(service.startTask(task, 19, () => undefined)).rejects.toThrow('shutting down');
  });
});
