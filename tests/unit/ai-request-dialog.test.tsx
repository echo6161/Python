import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AiRequestDialog } from '../../src/renderer/components/AiRequestDialog';
import type { AiMessage, AiSelectionScope } from '../../src/shared/contracts/ai';

const selection: AiSelectionScope = {
  paperId: '550e8400-e29b-41d4-a716-446655440000',
  paperTitle: 'Local Paper',
  pageNumber: 7,
  selectedText: 'The exact selected passage.',
  textStart: 42,
  textEnd: 69,
};

const history: readonly AiMessage[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    role: 'user',
    content: 'Prior question',
    status: 'complete',
    createdAt: '2026-08-08T00:00:00.000Z',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    role: 'assistant',
    content: 'Prior answer',
    status: 'complete',
    createdAt: '2026-08-08T00:00:01.000Z',
  },
];

describe('AiRequestDialog', () => {
  it('shows the exact selected range and complete outgoing context before sending', () => {
    const streamingMessage: AiMessage = {
      id: '550e8400-e29b-41d4-a716-446655440003',
      role: 'assistant',
      content: 'Incomplete text must not be replayed',
      status: 'streaming',
      createdAt: '2026-08-08T00:00:02.000Z',
    };
    render(
      <AiRequestDialog
        apiConfigured
        defaultSaveHistory
        destinationHost="api.openai.com"
        history={[...history, streamingMessage]}
        historyPersisted
        isBusy={false}
        isManualBridgeBusy={false}
        kind="follow_up"
        prompt="Why does this matter?"
        selection={selection}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onOpenChatGpt={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Review outgoing AI request' })).toBeDefined();
    expect(screen.getByTestId('outgoing-selection').textContent).toBe(selection.selectedText);
    expect(screen.getByText('Page 7 · offsets 42–69 · 27 characters')).toBeDefined();
    expect(screen.getByText('2 prior messages · 26 characters')).toBeDefined();
    expect(screen.queryByText(streamingMessage.content)).toBeNull();
    expect(screen.getByText('Why does this matter?')).toBeDefined();
    expect(screen.getByText(/The PDF file, file path, annotations, notes/)).toBeDefined();
  });

  it('allows a single request to opt out of local history', () => {
    const onConfirm = vi.fn();
    render(
      <AiRequestDialog
        apiConfigured
        defaultSaveHistory
        destinationHost="api.openai.com"
        history={[]}
        historyPersisted
        isBusy={false}
        isManualBridgeBusy={false}
        kind="translate"
        prompt={null}
        selection={selection}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        onOpenChatGpt={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /Save conversation locally/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send to api.openai.com' }));

    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('reports that no PDF text is attached for general chat', () => {
    render(
      <AiRequestDialog
        apiConfigured
        defaultSaveHistory={false}
        destinationHost="api.openai.com"
        history={[]}
        historyPersisted
        isBusy={false}
        isManualBridgeBusy={false}
        kind="chat"
        prompt="General question"
        selection={null}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onOpenChatGpt={vi.fn()}
      />,
    );

    expect(screen.getByText('No PDF text is attached.')).toBeDefined();
    expect(screen.getByText('0 prior messages · 0 characters')).toBeDefined();
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', {
        name: /Save conversation locally/,
      }).checked,
    ).toBe(false);
  });

  it('excludes ephemeral history when the next turn will be persisted', () => {
    render(
      <AiRequestDialog
        apiConfigured
        defaultSaveHistory
        destinationHost="api.openai.com"
        history={history}
        historyPersisted={false}
        isBusy={false}
        isManualBridgeBusy={false}
        kind="follow_up"
        prompt="Start a saved conversation"
        selection={selection}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onOpenChatGpt={vi.fn()}
      />,
    );

    expect(screen.getByText('0 prior messages · 0 characters')).toBeDefined();
    expect(screen.queryByText('Prior answer')).toBeNull();
  });

  it('offers a manual ChatGPT handoff when no API key is configured', () => {
    const onOpenChatGpt = vi.fn();
    render(
      <AiRequestDialog
        apiConfigured={false}
        defaultSaveHistory
        destinationHost="api.openai.com"
        history={history}
        historyPersisted
        isBusy={false}
        isManualBridgeBusy={false}
        kind="translate"
        prompt={null}
        selection={selection}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onOpenChatGpt={onOpenChatGpt}
      />,
    );

    expect(screen.getByText(/Nothing is uploaded until you paste/)).toBeDefined();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'API key required' }).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt and open ChatGPT' }));
    expect(onOpenChatGpt).toHaveBeenCalledTimes(1);
  });
});
