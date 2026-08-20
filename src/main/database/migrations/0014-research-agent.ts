import type { DatabaseMigration } from './types';

export const researchAgentMigration: DatabaseMigration = {
  version: 14,
  name: 'research-agent',
  sql: `
    CREATE TABLE research_agent_runs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      goal TEXT NOT NULL CHECK (length(goal) BETWEEN 1 AND 4000),
      status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'partial', 'cancelled', 'timeout', 'failed')),
      termination_reason TEXT CHECK (termination_reason IS NULL OR termination_reason IN ('completed', 'cancelled', 'timeout', 'max_steps', 'max_tool_calls', 'max_context', 'tool_error', 'provider_error')),
      answer_markdown TEXT NOT NULL CHECK (length(answer_markdown) <= 2000000),
      uncertainty TEXT NOT NULL CHECK (length(uncertainty) <= 4000),
      provider_id TEXT NOT NULL CHECK (provider_id IN ('codex', 'openai')),
      model_name TEXT NOT NULL CHECK (length(model_name) BETWEEN 1 AND 120),
      maximum_steps INTEGER NOT NULL CHECK (maximum_steps BETWEEN 1 AND 20),
      maximum_tool_calls INTEGER NOT NULL CHECK (maximum_tool_calls BETWEEN 1 AND 20),
      maximum_context_characters INTEGER NOT NULL CHECK (maximum_context_characters BETWEEN 1000 AND 50000),
      timeout_ms INTEGER NOT NULL CHECK (timeout_ms BETWEEN 1000 AND 300000),
      used_steps INTEGER NOT NULL DEFAULT 0 CHECK (used_steps >= 0),
      used_tool_calls INTEGER NOT NULL DEFAULT 0 CHECK (used_tool_calls >= 0),
      used_context_characters INTEGER NOT NULL DEFAULT 0 CHECK (used_context_characters >= 0),
      error_code TEXT,
      error_message TEXT,
      error_retryable INTEGER,
      created_at TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT
    ) STRICT;
    CREATE INDEX research_agent_runs_workspace_created
      ON research_agent_runs(workspace_id, created_at DESC);

    CREATE TABLE research_agent_trace_steps (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES research_agent_runs(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
      tool_name TEXT NOT NULL CHECK (tool_name IN ('inspect_workspace', 'search_knowledge', 'read_paper_pages', 'search_code', 'read_code', 'list_questions', 'list_notes_memory', 'inspect_plan', 'list_links')),
      status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'cancelled', 'failed')),
      input_summary TEXT NOT NULL CHECK (length(input_summary) <= 1000),
      output_summary TEXT NOT NULL CHECK (length(output_summary) <= 2000),
      error_code TEXT,
      error_message TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE(run_id, ordinal)
    ) STRICT;

    CREATE TABLE research_agent_citations (
      run_id TEXT NOT NULL REFERENCES research_agent_runs(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      alias TEXT NOT NULL CHECK (length(alias) BETWEEN 2 AND 20),
      chunk_id TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK (source_type IN ('paper', 'code', 'question', 'link')),
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 1000),
      snippet TEXT NOT NULL CHECK (length(snippet) <= 2000),
      citation TEXT NOT NULL CHECK (length(citation) BETWEEN 1 AND 1000),
      stale INTEGER NOT NULL CHECK (stale IN (0, 1)),
      unavailable_reason TEXT,
      provenance_json TEXT NOT NULL,
      PRIMARY KEY(run_id, alias)
    ) STRICT;

    CREATE TABLE research_agent_proposals (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES research_agent_runs(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind = 'memory'),
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
      body_markdown TEXT NOT NULL CHECK (length(body_markdown) BETWEEN 1 AND 100000),
      reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 4000),
      status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
      downstream_proposal_id TEXT,
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0)
    ) STRICT;
    CREATE INDEX research_agent_proposals_workspace_status
      ON research_agent_proposals(workspace_id, status, created_at DESC);
  `,
};
