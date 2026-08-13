import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AiAssistantSidebar,
  type AiTaskDraft,
} from '../../src/renderer/components/AiAssistantSidebar';
import type {
  AiApi,
  AiCapabilities,
  AiConversation,
  AiStreamEvent,
} from '../../src/shared/contracts/ai';

const paperId = '550e8400-e29b-41d4-a716-446655440000';
const conversationId = '550e8400-e29b-41d4-a716-446655440010';
const assistantMessageId = '550e8400-e29b-41d4-a716-446655440012';

const capabilities: AiCapabilities = {
  providerId: 'openai',
  settings: {
    providerId: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    codexProxyUrl: null,
    model: 'gpt-5.6',
    temperature: 0.2,
    maxOutputTokens: 2_000,
    saveHistoryByDefault: true,
  },
  credential: { configured: true, persistence: 'secure', backend: 'dpapi' },
  providers: [
    {
      id: 'openai',
      name: 'OpenAI API',
      status: 'connected',
      available: true,
      configured: true,
      version: null,
      plan: null,
      models: [],
      capabilities: ['Streaming'],
      limitations: [],
      lastError: null,
    },
    {
      id: 'codex',
      name: 'ChatGPT account via Codex',
      status: 'not_configured',
      available: true,
      configured: false,
      version: '0.147.0',
      plan: null,
      models: [],
      capabilities: ['Official ChatGPT sign-in'],
      limitations: [],
      lastError: null,
    },
  ],
  gate: { verdict: 'supported', checkedAt: '2026-08-12', integration: 'official-codex-app-server' },
  selectionOnlyByDefault: true,
};

const acceptedConversation: AiConversation = {
  id: conversationId,
  paperId,
  title: 'Question',
  providerId: 'openai',
  model: 'gpt-5.6',
  messages: [
    {
      id: '550e8400-e29b-41d4-a716-446655440011',
      role: 'user',
      content: 'What is the contribution?',
      status: 'complete',
      createdAt: '2026-08-08T00:00:00.000Z',
    },
    {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      createdAt: '2026-08-08T00:00:01.000Z',
    },
  ],
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:01.000Z',
  persisted: true,
};

function installAiApi(overrides: Partial<AiApi> = {}) {
  let streamListener: ((event: AiStreamEvent) => void) | null = null;
  const unsubscribe = vi.fn();
  const startTask = vi.fn<AiApi['startTask']>().mockResolvedValue({
    ok: true,
    value: {
      requestId: 'request-1',
      conversation: acceptedConversation,
      assistantMessageId,
    },
  });
  const cancelTask = vi.fn<AiApi['cancelTask']>().mockResolvedValue({
    ok: true,
    value: { requestId: 'request-1' },
  });
  const openChatGptBridge = vi.fn<AiApi['openChatGptBridge']>().mockResolvedValue({
    ok: true,
    value: {
      copied: true,
      destinationUrl: 'https://chatgpt.com/',
      opened: true,
      promptCharacterCount: 512,
    },
  });
  const api: AiApi = {
    getCapabilities: vi.fn().mockResolvedValue({ ok: true, value: capabilities }),
    refreshProviders: vi.fn(),
    selectProvider: vi.fn(),
    startCodexLogin: vi.fn(),
    cancelCodexLogin: vi.fn(),
    logoutCodex: vi.fn(),
    updateSettings: vi.fn(),
    setApiKey: vi.fn(),
    deleteApiKey: vi.fn(),
    getConversation: vi.fn().mockResolvedValue({ ok: true, value: null }),
    openChatGptBridge,
    startTask,
    cancelTask,
    onStreamEvent: vi.fn((listener: (event: AiStreamEvent) => void) => {
      streamListener = listener;
      return unsubscribe;
    }),
    ...overrides,
  };
  Object.defineProperty(window, 'paperMind', {
    configurable: true,
    value: { ai: api },
  });
  return {
    cancelTask,
    emit: (event: AiStreamEvent) => streamListener?.(event),
    openChatGptBridge,
    startTask,
    unsubscribe,
  };
}

describe('AiAssistantSidebar', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reviews a general question, streams plain text, and keeps markup inert', async () => {
    const { emit, startTask } = installAiApi();
    render(<AiAssistantSidebar paperId={paperId} onOpenSettings={vi.fn()} />);
    await screen.findByText(
      'Select PDF text for translation or explanation, or ask a general question below.',
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Ask AI assistant' }), {
      target: { value: 'What is the contribution?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review AI request' }));
    expect(screen.getByText('No PDF text is attached.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Send to api.openai.com' }));

    await waitFor(() => expect(startTask).toHaveBeenCalledTimes(1));
    expect(startTask).toHaveBeenCalledWith({
      kind: 'chat',
      paperId,
      selection: null,
      prompt: 'What is the contribution?',
      conversationId: null,
      saveHistory: true,
    });

    act(() => {
      emit({
        type: 'delta',
        requestId: 'request-1',
        conversationId,
        assistantMessageId,
        delta: '<strong>Local result</strong>',
      });
    });
    expect(screen.getByText('<strong>Local result</strong>')).toBeDefined();
    expect(document.querySelector('strong')).toBeNull();

    act(() => {
      emit({
        type: 'completed',
        requestId: 'request-1',
        conversationId,
        message: {
          id: assistantMessageId,
          role: 'assistant',
          content: 'Final answer',
          status: 'complete',
          createdAt: '2026-08-08T00:00:02.000Z',
        },
      });
    });
    expect(screen.getByText('Final answer')).toBeDefined();
    expect(screen.queryByText('AI is responding...')).toBeNull();
  });

  it('cancels the active request and ignores stream events for another request', async () => {
    const task: AiTaskDraft = {
      kind: 'translate',
      prompt: null,
      selection: {
        paperId,
        paperTitle: 'Paper',
        pageNumber: 2,
        selectedText: 'Selected sentence',
        textStart: 10,
        textEnd: 27,
      },
    };
    const { cancelTask, emit } = installAiApi();
    render(<AiAssistantSidebar paperId={paperId} pendingTask={task} onOpenSettings={vi.fn()} />);
    await screen.findByRole('dialog', { name: 'Review outgoing AI request' });
    fireEvent.click(screen.getByRole('button', { name: 'Send to api.openai.com' }));
    await screen.findByText('AI is responding...');

    act(() => {
      emit({
        type: 'delta',
        requestId: 'unrelated-request',
        conversationId,
        assistantMessageId,
        delta: 'Must not render',
      });
    });
    expect(screen.queryByText('Must not render')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(cancelTask).toHaveBeenCalledWith('request-1'));
    expect(screen.getByText('Cancelling request...')).toBeDefined();
  });

  it('attaches an ask-about-selection action and waits for the follow-up prompt', async () => {
    const handled = vi.fn();
    const task: AiTaskDraft = {
      kind: 'follow_up',
      prompt: null,
      selection: {
        paperId,
        paperTitle: 'Paper',
        pageNumber: 4,
        selectedText: 'Context for the question',
        textStart: 20,
        textEnd: 44,
      },
    };
    installAiApi();
    render(
      <AiAssistantSidebar
        paperId={paperId}
        pendingTask={task}
        onOpenSettings={vi.fn()}
        onPendingTaskHandled={handled}
      />,
    );

    const input = await screen.findByRole('textbox', { name: 'Ask AI assistant' });
    expect(screen.queryByRole('dialog', { name: 'Review outgoing AI request' })).toBeNull();
    expect(screen.getByText('Page 4 selection attached')).toBeDefined();
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: 'How should I interpret this?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review AI request' }));
    expect((await screen.findByTestId('outgoing-selection')).textContent).toBe(
      'Context for the question',
    );
    expect(handled).not.toHaveBeenCalled();
  });

  it('uses the manual ChatGPT bridge without an API key or provider request', async () => {
    const task: AiTaskDraft = {
      kind: 'translate',
      prompt: null,
      selection: {
        paperId,
        paperTitle: 'Paper',
        pageNumber: 3,
        selectedText: 'Only this selected sentence',
        textStart: 5,
        textEnd: 32,
      },
    };
    const { openChatGptBridge, startTask } = installAiApi({
      getCapabilities: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          ...capabilities,
          credential: { ...capabilities.credential, configured: false },
        },
      }),
    });
    render(<AiAssistantSidebar paperId={paperId} pendingTask={task} onOpenSettings={vi.fn()} />);

    await screen.findByRole('dialog', { name: 'Review outgoing AI request' });
    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt and open ChatGPT' }));

    await waitFor(() =>
      expect(openChatGptBridge).toHaveBeenCalledWith({
        kind: 'translate',
        selection: task.selection,
        prompt: null,
      }),
    );
    expect(startTask).not.toHaveBeenCalled();
    expect(screen.getByText(/Prompt copied\. Paste it into ChatGPT/)).toBeDefined();
  });

  it('shows a classified stream error and removes its subscription on unmount', async () => {
    const { emit, unsubscribe } = installAiApi();
    const view = render(<AiAssistantSidebar paperId={paperId} onOpenSettings={vi.fn()} />);
    await screen.findByRole('textbox', { name: 'Ask AI assistant' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Ask AI assistant' }), {
      target: { value: 'Question' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review AI request' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send to api.openai.com' }));
    await screen.findByText('AI is responding...');

    act(() => {
      emit({
        type: 'error',
        requestId: 'request-1',
        conversationId,
        message: {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          status: 'failed',
          createdAt: '2026-08-08T00:00:02.000Z',
        },
        error: {
          code: 'NETWORK',
          message: 'Network unavailable. Check your connection and try again.',
          retryable: true,
        },
      });
    });
    expect(screen.getByRole('alert').textContent).toContain('Network unavailable');

    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('cancels and clears request state when the selected paper changes', async () => {
    const task: AiTaskDraft = {
      kind: 'translate',
      prompt: null,
      selection: {
        paperId,
        paperTitle: 'Paper',
        pageNumber: 2,
        selectedText: 'Selected sentence',
        textStart: 10,
        textEnd: 27,
      },
    };
    const { cancelTask } = installAiApi();
    const view = render(
      <AiAssistantSidebar
        key={paperId}
        paperId={paperId}
        pendingTask={task}
        onOpenSettings={vi.fn()}
      />,
    );
    await screen.findByRole('dialog', { name: 'Review outgoing AI request' });
    fireEvent.click(screen.getByRole('button', { name: 'Send to api.openai.com' }));
    await screen.findByText('AI is responding...');

    view.rerender(
      <AiAssistantSidebar
        key="550e8400-e29b-41d4-a716-446655440099"
        paperId="550e8400-e29b-41d4-a716-446655440099"
        onOpenSettings={vi.fn()}
      />,
    );

    await waitFor(() => expect(cancelTask).toHaveBeenCalledWith('request-1'));
    expect(screen.queryByText('AI is responding...')).toBeNull();
  });
});
