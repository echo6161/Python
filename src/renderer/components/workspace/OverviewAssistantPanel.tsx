import { useState } from 'react';
import { ArrowRight, MessageSquareText, Send, Square } from 'lucide-react';

import type { KnowledgeSourceType } from '../../../shared/contracts/knowledge';
import type { Workspace } from '../../../shared/contracts/workspace';
import { useResearchChatController } from './research-chat/use-research-chat-controller';

const sourceTypes: readonly KnowledgeSourceType[] = ['paper', 'code', 'question', 'link'];

export function OverviewAssistantPanel({
  onOpen,
  workspace,
}: {
  readonly onOpen: () => void;
  readonly workspace: Workspace;
}) {
  const [query, setQuery] = useState('');
  const controller = useResearchChatController(workspace.id, null);
  const messages = controller.conversation?.messages.slice(-4) ?? [];
  const provider = controller.capabilities?.providers.find(
    ({ id }) => id === controller.capabilities?.providerId,
  );
  const providerAvailable = provider?.configured ?? false;
  const active = Boolean(controller.requestId);

  const primaryAction = async () => {
    if (controller.preview) {
      const sent = await controller.send();
      if (sent) setQuery('');
      return;
    }
    if (query.trim()) await controller.prepare(query.trim(), sourceTypes);
  };

  return (
    <section
      className="overview-rail-panel overview-ai-assistant"
      aria-labelledby="overview-ai-title"
    >
      <header className="overview-rail-header">
        <div>
          <MessageSquareText aria-hidden="true" className="size-3.5" />
          <h2 id="overview-ai-title">AI Assistant</h2>
          <span>{provider?.name ?? 'No provider'}</span>
        </div>
        <button type="button" onClick={onOpen}>
          Open chat <ArrowRight aria-hidden="true" className="size-3.5" />
        </button>
      </header>

      <div className="overview-ai-thread" aria-label="Recent Research Chat messages">
        {messages.length ? (
          messages.map((message) => (
            <article className={`overview-ai-message is-${message.role}`} key={message.id}>
              <span>{message.role === 'user' ? 'You' : 'PaperMind AI'}</span>
              <p>{message.content || (message.status === 'streaming' ? 'Generating...' : '')}</p>
              <small>{message.status}</small>
            </article>
          ))
        ) : (
          <div className="overview-ai-empty">
            <strong>Ask from reviewed Workspace evidence</strong>
            <p>Paper, code, question, and link sources are reviewed before sending.</p>
          </div>
        )}
      </div>

      {controller.error ? (
        <p className="overview-ai-error" role="alert">
          {controller.error}
        </p>
      ) : null}
      {controller.preview ? (
        <p className="overview-ai-preview" role="status">
          {controller.preview.sources.length} sources ready for review.
        </p>
      ) : null}

      <div className="overview-ai-composer">
        <textarea
          aria-label="Ask Overview AI Assistant"
          disabled={active}
          placeholder="Ask about this Workspace..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {active ? (
          <button
            aria-label="Cancel AI response"
            type="button"
            onClick={() => void controller.cancel()}
          >
            <Square aria-hidden="true" className="size-3.5" />
          </button>
        ) : (
          <button
            aria-label={controller.preview ? 'Send reviewed question' : 'Review AI sources'}
            disabled={
              controller.preparing || (!controller.preview && !query.trim()) || !providerAvailable
            }
            title={providerAvailable ? undefined : 'Connect an AI provider in Settings'}
            type="button"
            onClick={() => void primaryAction()}
          >
            <Send aria-hidden="true" className="size-3.5" />
          </button>
        )}
      </div>
    </section>
  );
}
