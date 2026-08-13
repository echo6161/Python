import type { DatabaseMigration } from './types';

export const notesResearchMemoryMigration: DatabaseMigration = {
  version: 12,
  name: 'workspace-notes-research-memory',
  sql: `
    CREATE TABLE workspace_notes (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
      body_markdown TEXT NOT NULL CHECK (length(body_markdown) <= 1000000),
      status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0)
    ) STRICT;

    CREATE INDEX workspace_notes_workspace_updated
      ON workspace_notes(workspace_id, updated_at DESC);

    CREATE TABLE research_memory_entries (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
      body_markdown TEXT NOT NULL CHECK (length(body_markdown) <= 1000000),
      status TEXT NOT NULL CHECK (status IN ('draft', 'confirmed', 'retired')),
      provenance TEXT NOT NULL CHECK (provenance IN ('manual', 'ai-proposed-confirmed')),
      confirmed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0)
    ) STRICT;

    CREATE INDEX research_memory_entries_workspace_updated
      ON research_memory_entries(workspace_id, updated_at DESC);

    CREATE TABLE research_memory_proposals (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      source_note_id TEXT REFERENCES workspace_notes(id) ON DELETE SET NULL,
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
      body_markdown TEXT NOT NULL CHECK (length(body_markdown) BETWEEN 1 AND 1000000),
      reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 1000),
      provider_id TEXT NOT NULL CHECK (provider_id IN ('openai', 'codex')),
      model_name TEXT NOT NULL CHECK (length(model_name) BETWEEN 1 AND 120),
      status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'rejected')),
      confirmed_memory_id TEXT REFERENCES research_memory_entries(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0)
    ) STRICT;

    CREATE INDEX research_memory_proposals_workspace_created
      ON research_memory_proposals(workspace_id, created_at DESC);

    CREATE TABLE research_memory_references (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      note_id TEXT REFERENCES workspace_notes(id) ON DELETE CASCADE,
      memory_id TEXT REFERENCES research_memory_entries(id) ON DELETE CASCADE,
      proposal_id TEXT REFERENCES research_memory_proposals(id) ON DELETE CASCADE,
      knowledge_chunk_id TEXT,
      source_type TEXT NOT NULL CHECK (source_type IN ('paper', 'code', 'question', 'link')),
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 1000),
      citation TEXT NOT NULL CHECK (length(citation) BETWEEN 1 AND 500),
      snippet TEXT NOT NULL CHECK (length(snippet) BETWEEN 1 AND 1200),
      provenance_json TEXT NOT NULL,
      display_order INTEGER NOT NULL CHECK (display_order >= 0),
      created_at TEXT NOT NULL,
      CHECK ((note_id IS NOT NULL) + (memory_id IS NOT NULL) + (proposal_id IS NOT NULL) = 1)
    ) STRICT;

    CREATE UNIQUE INDEX research_memory_references_note_chunk
      ON research_memory_references(note_id, knowledge_chunk_id) WHERE note_id IS NOT NULL;
    CREATE UNIQUE INDEX research_memory_references_memory_chunk
      ON research_memory_references(memory_id, knowledge_chunk_id) WHERE memory_id IS NOT NULL;
    CREATE UNIQUE INDEX research_memory_references_proposal_chunk
      ON research_memory_references(proposal_id, knowledge_chunk_id) WHERE proposal_id IS NOT NULL;

    CREATE TABLE research_memory_exports (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      owner_type TEXT NOT NULL CHECK (owner_type IN ('note', 'memory')),
      owner_id TEXT NOT NULL,
      vault_name TEXT NOT NULL CHECK (length(vault_name) BETWEEN 1 AND 300),
      relative_path TEXT NOT NULL CHECK (length(relative_path) BETWEEN 1 AND 1000),
      content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
      exported_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX research_memory_exports_owner
      ON research_memory_exports(workspace_id, owner_type, owner_id, exported_at DESC);
  `,
};
