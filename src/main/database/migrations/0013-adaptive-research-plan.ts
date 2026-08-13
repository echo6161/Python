import type { DatabaseMigration } from './types';

export const adaptiveResearchPlanMigration: DatabaseMigration = {
  version: 13,
  name: 'adaptive-research-plan',
  sql: `
    CREATE TABLE research_plans (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      goal TEXT NOT NULL CHECK (length(goal) BETWEEN 1 AND 4000),
      status TEXT NOT NULL CHECK (status IN ('active', 'retired')),
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0)
    ) STRICT;

    CREATE UNIQUE INDEX research_plans_one_active
      ON research_plans(workspace_id) WHERE status = 'active';
    CREATE INDEX research_plans_workspace_updated
      ON research_plans(workspace_id, updated_at DESC);

    CREATE TABLE plan_tasks (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES research_plans(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
      description TEXT NOT NULL CHECK (length(description) <= 10000),
      status TEXT NOT NULL CHECK (status IN ('todo', 'in_progress', 'blocked', 'done', 'retired')),
      blocked_reason TEXT CHECK (blocked_reason IS NULL OR length(blocked_reason) BETWEEN 1 AND 1000),
      display_order INTEGER NOT NULL CHECK (display_order >= 0),
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
      UNIQUE(plan_id, display_order)
    ) STRICT;

    CREATE INDEX plan_tasks_workspace_plan ON plan_tasks(workspace_id, plan_id);

    CREATE TABLE plan_task_dependencies (
      task_id TEXT NOT NULL REFERENCES plan_tasks(id) ON DELETE CASCADE,
      depends_on_task_id TEXT NOT NULL REFERENCES plan_tasks(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY(task_id, depends_on_task_id),
      CHECK (task_id <> depends_on_task_id)
    ) STRICT;

    CREATE TABLE plan_references (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL REFERENCES plan_tasks(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL CHECK (source_type IN ('paper', 'repository', 'question', 'memory')),
      source_key TEXT NOT NULL,
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 1000),
      citation TEXT NOT NULL CHECK (length(citation) BETWEEN 1 AND 1000),
      target_json TEXT NOT NULL,
      snapshot_identity TEXT,
      display_order INTEGER NOT NULL CHECK (display_order >= 0),
      created_at TEXT NOT NULL,
      UNIQUE(task_id, source_type, source_key)
    ) STRICT;

    CREATE TABLE plan_completion_evidence (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL REFERENCES plan_tasks(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL CHECK (source_type IN ('paper', 'repository', 'question', 'memory')),
      source_key TEXT NOT NULL,
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 1000),
      citation TEXT NOT NULL CHECK (length(citation) BETWEEN 1 AND 1000),
      target_json TEXT NOT NULL,
      snapshot_identity TEXT,
      note TEXT NOT NULL CHECK (length(note) BETWEEN 1 AND 4000),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE research_plan_history (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      plan_id TEXT NOT NULL REFERENCES research_plans(id) ON DELETE CASCADE,
      version INTEGER NOT NULL CHECK (version > 0),
      actor TEXT NOT NULL CHECK (actor IN ('user', 'ai-confirmed')),
      change_kind TEXT NOT NULL CHECK (length(change_kind) BETWEEN 1 AND 80),
      summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 500),
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(plan_id, version)
    ) STRICT;

    CREATE TABLE research_plan_proposals (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      plan_id TEXT REFERENCES research_plans(id) ON DELETE SET NULL,
      base_version INTEGER,
      mode TEXT NOT NULL CHECK (mode IN ('generate', 'adapt')),
      goal TEXT NOT NULL CHECK (length(goal) BETWEEN 1 AND 4000),
      rationale TEXT NOT NULL CHECK (length(rationale) BETWEEN 1 AND 4000),
      changes_json TEXT NOT NULL,
      provider_id TEXT NOT NULL CHECK (provider_id IN ('codex', 'openai')),
      model_name TEXT NOT NULL CHECK (length(model_name) BETWEEN 1 AND 120),
      status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'rejected')),
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0)
    ) STRICT;

    CREATE INDEX research_plan_proposals_workspace_created
      ON research_plan_proposals(workspace_id, created_at DESC);
  `,
};
