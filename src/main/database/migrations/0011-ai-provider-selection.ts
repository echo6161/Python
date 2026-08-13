import type { DatabaseMigration } from './types';

export const aiProviderSelectionMigration: DatabaseMigration = {
  version: 11,
  name: 'official-codex-provider-selection',
  sql: `
    ALTER TABLE research_chat_conversations
      ADD COLUMN generation_provider_id TEXT NOT NULL DEFAULT 'openai'
      CHECK (generation_provider_id IN ('openai', 'codex'));
  `,
};
