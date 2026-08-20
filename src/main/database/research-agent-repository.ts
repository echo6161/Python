import type Database from 'better-sqlite3';

import type { AiError } from '../../shared/contracts/ai';
import type { KnowledgeProvenance, KnowledgeSourceType } from '../../shared/contracts/knowledge';
import type {
  ResearchAgentProposal,
  ResearchAgentRun,
  ResearchAgentRunStatus,
  ResearchAgentRunSummary,
  ResearchAgentTerminationReason,
  ResearchAgentToolName,
} from '../../shared/contracts/research-agent';
import { LibraryError } from '../library/errors';
import type {
  AppendStoredAgentStepInput,
  CompleteStoredAgentRunInput,
  CreateStoredAgentRunInput,
} from '../research-agent/research-agent-data-gateway';

interface RunRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly goal: string;
  readonly status: ResearchAgentRunStatus;
  readonly termination_reason: ResearchAgentTerminationReason | null;
  readonly answer_markdown: string;
  readonly uncertainty: string;
  readonly provider_id: 'codex' | 'openai';
  readonly model_name: string;
  readonly maximum_steps: number;
  readonly maximum_tool_calls: number;
  readonly maximum_context_characters: number;
  readonly timeout_ms: number;
  readonly used_steps: number;
  readonly used_tool_calls: number;
  readonly used_context_characters: number;
  readonly error_code: AiError['code'] | null;
  readonly error_message: string | null;
  readonly error_retryable: number | null;
  readonly created_at: string;
  readonly started_at: string;
  readonly completed_at: string | null;
}

interface StepRow {
  readonly id: string;
  readonly ordinal: number;
  readonly tool_name: ResearchAgentToolName;
  readonly status: 'cancelled' | 'failed' | 'running' | 'succeeded';
  readonly input_summary: string;
  readonly output_summary: string;
  readonly error_code: string | null;
  readonly error_message: string | null;
  readonly started_at: string;
  readonly completed_at: string | null;
}

interface CitationRow {
  readonly alias: string;
  readonly chunk_id: string;
  readonly source_type: KnowledgeSourceType;
  readonly title: string;
  readonly snippet: string;
  readonly citation: string;
  readonly stale: number;
  readonly unavailable_reason: string | null;
  readonly provenance_json: string;
}

interface ProposalRow {
  readonly id: string;
  readonly run_id: string;
  readonly workspace_id: string;
  readonly title: string;
  readonly body_markdown: string;
  readonly reason: string;
  readonly status: 'accepted' | 'pending' | 'rejected';
  readonly downstream_proposal_id: string | null;
  readonly created_at: string;
  readonly reviewed_at: string | null;
  readonly row_version: number;
}

const RUN_SELECT = `SELECT id, workspace_id, goal, status, termination_reason, answer_markdown,
  uncertainty, provider_id, model_name, maximum_steps, maximum_tool_calls,
  maximum_context_characters, timeout_ms, used_steps, used_tool_calls,
  used_context_characters, error_code, error_message, error_retryable, created_at, started_at,
  completed_at FROM research_agent_runs`;

export class ResearchAgentRepository {
  public constructor(private readonly database: Database.Database) {}

  public markInterrupted(completedAt: string): number {
    return this.database
      .prepare(
        `UPDATE research_agent_runs SET status = 'failed', termination_reason = 'provider_error',
         error_code = 'PROVIDER', error_message = 'The Agent run was interrupted by an application restart.',
         error_retryable = 1, completed_at = ? WHERE status = 'running'`,
      )
      .run(completedAt).changes;
  }

  public create(input: CreateStoredAgentRunInput): ResearchAgentRun {
    this.requireWorkspace(input.workspaceId);
    this.database
      .prepare(
        `INSERT INTO research_agent_runs
         (id, workspace_id, goal, status, termination_reason, answer_markdown, uncertainty,
          provider_id, model_name, maximum_steps, maximum_tool_calls, maximum_context_characters,
          timeout_ms, used_steps, used_tool_calls, used_context_characters, error_code,
          error_message, error_retryable, created_at, started_at, completed_at)
         VALUES (?, ?, ?, 'running', NULL, '', '', ?, ?, ?, ?, ?, ?, 0, 0, 0,
          NULL, NULL, NULL, ?, ?, NULL)`,
      )
      .run(
        input.id,
        input.workspaceId,
        input.goal,
        input.providerId,
        input.model,
        input.budget.maximumSteps,
        input.budget.maximumToolCalls,
        input.budget.maximumContextCharacters,
        input.budget.timeoutMs,
        input.createdAt,
        input.createdAt,
      );
    return this.requireRun(input.workspaceId, input.id);
  }

  public appendStep(input: AppendStoredAgentStepInput): ResearchAgentRun {
    this.requireRunning(input.workspaceId, input.runId);
    this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO research_agent_trace_steps
           (id, run_id, workspace_id, ordinal, tool_name, status, input_summary, output_summary,
            error_code, error_message, started_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.id,
          input.runId,
          input.workspaceId,
          input.ordinal,
          input.toolName,
          input.status,
          input.inputSummary.slice(0, 1000),
          input.outputSummary.slice(0, 2000),
          input.errorCode,
          input.errorMessage?.slice(0, 1000) ?? null,
          input.startedAt,
          input.completedAt,
        );
      this.database
        .prepare(
          `UPDATE research_agent_runs SET used_steps = used_steps + 1,
           used_tool_calls = used_tool_calls + 1 WHERE id = ? AND workspace_id = ?`,
        )
        .run(input.runId, input.workspaceId);
    })();
    return this.requireRun(input.workspaceId, input.runId);
  }

  public complete(input: CompleteStoredAgentRunInput): ResearchAgentRun {
    return this.database.transaction(() => {
      this.requireRunning(input.workspaceId, input.runId);
      this.database
        .prepare(
          `UPDATE research_agent_runs SET status = ?, termination_reason = ?, answer_markdown = ?,
           uncertainty = ?, used_steps = ?, used_tool_calls = ?, used_context_characters = ?,
           error_code = ?, error_message = ?, error_retryable = ?, completed_at = ?
           WHERE id = ? AND workspace_id = ? AND status = 'running'`,
        )
        .run(
          input.status,
          input.terminationReason,
          input.answerMarkdown.slice(0, 2_000_000),
          input.uncertainty.slice(0, 4000),
          input.usage.steps,
          input.usage.toolCalls,
          input.usage.contextCharacters,
          input.error?.code ?? null,
          input.error?.message.slice(0, 1000) ?? null,
          input.error ? Number(input.error.retryable) : null,
          input.completedAt,
          input.runId,
          input.workspaceId,
        );
      const insertCitation = this.database.prepare(
        `INSERT INTO research_agent_citations
         (run_id, workspace_id, alias, chunk_id, source_type, title, snippet, citation, stale,
          unavailable_reason, provenance_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const citation of input.citations)
        insertCitation.run(
          input.runId,
          input.workspaceId,
          citation.alias,
          citation.chunkId,
          citation.sourceType,
          citation.title.slice(0, 1000),
          citation.snippet.slice(0, 2000),
          citation.citation.slice(0, 1000),
          Number(citation.stale),
          citation.unavailableReason?.slice(0, 1000) ?? null,
          JSON.stringify(citation.provenance),
        );
      const insertProposal = this.database.prepare(
        `INSERT INTO research_agent_proposals
         (id, run_id, workspace_id, kind, title, body_markdown, reason, status,
          downstream_proposal_id, created_at, reviewed_at, row_version)
         VALUES (?, ?, ?, 'memory', ?, ?, ?, 'pending', NULL, ?, NULL, 1)`,
      );
      for (const proposal of input.proposals)
        insertProposal.run(
          proposal.id,
          input.runId,
          input.workspaceId,
          proposal.title.slice(0, 300),
          proposal.bodyMarkdown.slice(0, 100000),
          proposal.reason.slice(0, 4000),
          proposal.createdAt,
        );
      return this.requireRun(input.workspaceId, input.runId);
    })();
  }

  public updateContextUsage(
    workspaceId: string,
    runId: string,
    contextCharacters: number,
  ): ResearchAgentRun {
    this.requireRunning(workspaceId, runId);
    this.database
      .prepare(
        `UPDATE research_agent_runs SET used_context_characters = ?
         WHERE workspace_id = ? AND id = ? AND status = 'running'`,
      )
      .run(contextCharacters, workspaceId, runId);
    return this.requireRun(workspaceId, runId);
  }

  public get(workspaceId: string, runId: string): ResearchAgentRun | null {
    const row = this.database
      .prepare(`${RUN_SELECT} WHERE workspace_id = ? AND id = ?`)
      .get(workspaceId, runId) as RunRow | undefined;
    return row ? this.mapRun(row) : null;
  }

  public list(workspaceId: string): readonly ResearchAgentRunSummary[] {
    this.requireWorkspace(workspaceId);
    const rows = this.database
      .prepare(`${RUN_SELECT} WHERE workspace_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`)
      .all(workspaceId) as RunRow[];
    return rows.map((row) => {
      const run = this.mapRun(row);
      return {
        id: run.id,
        workspaceId: run.workspaceId,
        goal: run.goal,
        status: run.status,
        terminationReason: run.terminationReason,
        toolCalls: run.usage.toolCalls,
        citationCount: run.citations.length,
        proposalCount: run.proposals.length,
        createdAt: run.createdAt,
        completedAt: run.completedAt,
      };
    });
  }

  public reviewProposal(input: {
    readonly workspaceId: string;
    readonly runId: string;
    readonly proposalId: string;
    readonly status: 'accepted' | 'rejected';
    readonly downstreamProposalId: string | null;
    readonly rowVersion: number;
    readonly reviewedAt: string;
  }): ResearchAgentProposal {
    const result = this.database
      .prepare(
        `UPDATE research_agent_proposals SET status = ?, downstream_proposal_id = ?,
         reviewed_at = ?, row_version = row_version + 1
         WHERE id = ? AND run_id = ? AND workspace_id = ? AND status = 'pending'
         AND row_version = ?`,
      )
      .run(
        input.status,
        input.downstreamProposalId,
        input.reviewedAt,
        input.proposalId,
        input.runId,
        input.workspaceId,
        input.rowVersion,
      );
    if (result.changes !== 1)
      throw new LibraryError('CONFLICT', 'The Agent proposal changed or was already reviewed.');
    return this.requireProposal(input.workspaceId, input.runId, input.proposalId);
  }

  private mapRun(row: RunRow): ResearchAgentRun {
    const steps = this.database
      .prepare(
        `SELECT id, ordinal, tool_name, status, input_summary, output_summary, error_code,
         error_message, started_at, completed_at FROM research_agent_trace_steps
         WHERE run_id = ? ORDER BY ordinal`,
      )
      .all(row.id) as StepRow[];
    const citations = this.database
      .prepare(
        `SELECT alias, chunk_id, source_type, title, snippet, citation, stale,
         unavailable_reason, provenance_json FROM research_agent_citations
         WHERE run_id = ? ORDER BY alias`,
      )
      .all(row.id) as CitationRow[];
    const proposals = this.database
      .prepare(
        `SELECT id, run_id, workspace_id, title, body_markdown, reason, status,
         downstream_proposal_id, created_at, reviewed_at, row_version
         FROM research_agent_proposals WHERE run_id = ? ORDER BY created_at, id`,
      )
      .all(row.id) as ProposalRow[];
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      goal: row.goal,
      status: row.status,
      terminationReason: row.termination_reason,
      answerMarkdown: row.answer_markdown,
      uncertainty: row.uncertainty,
      providerId: row.provider_id,
      model: row.model_name,
      budget: {
        maximumSteps: row.maximum_steps,
        maximumToolCalls: row.maximum_tool_calls,
        maximumContextCharacters: row.maximum_context_characters,
        timeoutMs: row.timeout_ms,
      },
      usage: {
        steps: row.used_steps,
        toolCalls: row.used_tool_calls,
        contextCharacters: row.used_context_characters,
      },
      trace: steps.map((step) => ({
        id: step.id,
        ordinal: step.ordinal,
        toolName: step.tool_name,
        status: step.status,
        inputSummary: step.input_summary,
        outputSummary: step.output_summary,
        errorCode: step.error_code,
        errorMessage: step.error_message,
        startedAt: step.started_at,
        completedAt: step.completed_at,
      })),
      citations: citations.map((citation) => ({
        alias: citation.alias,
        chunkId: citation.chunk_id,
        sourceType: citation.source_type,
        title: citation.title,
        snippet: citation.snippet,
        citation: citation.citation,
        stale: Boolean(citation.stale),
        unavailableReason: citation.unavailable_reason,
        provenance: JSON.parse(citation.provenance_json) as KnowledgeProvenance,
      })),
      proposals: proposals.map(mapProposal),
      error:
        row.error_code && row.error_message
          ? {
              code: row.error_code,
              message: row.error_message,
              retryable: Boolean(row.error_retryable),
            }
          : null,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    };
  }

  private requireRun(workspaceId: string, runId: string): ResearchAgentRun {
    const run = this.get(workspaceId, runId);
    if (!run) throw new LibraryError('NOT_FOUND', 'The Agent run does not exist.');
    return run;
  }

  private requireRunning(workspaceId: string, runId: string): void {
    const row = this.database
      .prepare('SELECT status FROM research_agent_runs WHERE workspace_id = ? AND id = ?')
      .get(workspaceId, runId) as { readonly status: string } | undefined;
    if (!row) throw new LibraryError('NOT_FOUND', 'The Agent run does not exist.');
    if (row.status !== 'running')
      throw new LibraryError('CONFLICT', 'The Agent run is already complete.');
  }

  private requireProposal(workspaceId: string, runId: string, proposalId: string) {
    const row = this.database
      .prepare(
        `SELECT id, run_id, workspace_id, title, body_markdown, reason, status,
         downstream_proposal_id, created_at, reviewed_at, row_version
         FROM research_agent_proposals WHERE workspace_id = ? AND run_id = ? AND id = ?`,
      )
      .get(workspaceId, runId, proposalId) as ProposalRow | undefined;
    if (!row) throw new LibraryError('NOT_FOUND', 'The Agent proposal does not exist.');
    return mapProposal(row);
  }

  private requireWorkspace(workspaceId: string): void {
    if (!this.database.prepare('SELECT 1 FROM workspaces WHERE id = ?').get(workspaceId))
      throw new LibraryError('NOT_FOUND', 'The Workspace does not exist.');
  }
}

function mapProposal(row: ProposalRow): ResearchAgentProposal {
  return {
    id: row.id,
    runId: row.run_id,
    workspaceId: row.workspace_id,
    kind: 'memory',
    title: row.title,
    bodyMarkdown: row.body_markdown,
    reason: row.reason,
    status: row.status,
    downstreamProposalId: row.downstream_proposal_id,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    rowVersion: row.row_version,
  };
}
