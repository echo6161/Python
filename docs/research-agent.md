# Research Agent

## Architecture and privilege boundary

Phase 18 adds a Main-process orchestration layer above existing domain services:

```text
Workspace Agent UI
  -> typed preload ResearchAgentApi
  -> whitelisted research-agent:* IPC with strict Zod validation
  -> ResearchAgentService
     -> fixed DomainToolRegistry
     -> Knowledge/Workspace/Question/Memory/Plan/Link data services
     -> existing AiAssistantService provider session
     -> ResearchAgentDataGateway -> database Worker -> SQLite
```

The AI provider does not receive executable tool definitions. Main chooses and
executes a deterministic bounded read plan, then asks the provider to synthesize
only the retained tool results. This is Main-owned orchestration, not provider-
native autonomous tool calling.

## Tool allowlist

The registry contains exactly `inspect_workspace`, `search_knowledge`,
`read_paper_pages`, `search_code`, `read_code`, `list_questions`,
`list_notes_memory`, `inspect_plan`, and `list_links`.

There is no shell, SQL, filesystem, generic fetch, localhost, Git mutation,
Zotero write, Obsidian write, code execution, experiment execution, or dynamic
tool registration. Paper/code reads accept only a Knowledge chunk discovered in
the same run and of the matching source type. The Renderer never supplies a URL,
path, item key, repository root, provider setting, tool name, argument, or budget.

## Budgets and termination

Production limits are fixed in Main: 10 steps, 10 tool calls, 16,000 retained
context characters, 60 seconds, and a two-million-character response ceiling.
Runs terminate as `completed`, `cancelled`, `timeout`, `max_steps`,
`max_tool_calls`, `max_context`, `tool_error`, or `provider_error`. Tool failure
can yield an explicit partial result; it is never labeled success.

Cancellation uses an owner-scoped request ID and `AbortController`. Closing a
Renderer cancels only that owner's active run. Startup marks an interrupted
`running` row failed and retryable instead of pretending it completed.
Provider initialization and every tool Promise participate in the cancellation
boundary. A hung read cannot hold the run or application shutdown open; its late
result is ignored and the attempted step receives a cancelled audit row.

## Injection, citations, and privacy

Source and tool content is entity-escaped, delimited, and labeled untrusted.
Main never parses source text into calls, so injected instructions cannot close a
delimiter, expand the registry, or change arguments. The context budget counts
the exact escaped tool and citation blocks sent to the provider. Provider
citations bind only to a source actually retained in that run. Navigation
resolves the stored chunk through the Workspace-bound Knowledge service.

Trace rows contain only bounded input/output summaries and safe errors. They do
not contain credentials, tokens, absolute paths, raw provider requests, complete
PDF pages, repository files, or unnecessary source excerpts.

## Proposal boundary

The provider may return a typed Memory candidate. It is stored as a pending Agent
proposal and is visibly not canonical Memory. `Send to Memory review` creates an
existing Phase 16 `research_memory_proposals` record with bounded citation
snapshots; it does not create a `research_memory_entries` row. The user must still
review and confirm it in Notes. Rejecting creates no downstream proposal.

## Threat model

| Threat | Control |
| --- | --- |
| Renderer requests arbitrary capabilities | Fixed typed preload methods and strict IPC schemas |
| Model invents a tool or changes limits | Model receives no executable registry; budgets live only in Main |
| Source prompt injection | Untrusted delimiters plus deterministic Main orchestration |
| Cross-Workspace chunk read | Same-run chunk map plus Workspace-bound Knowledge lookup |
| Run continues after cancel/window close | Owner-scoped AbortController and shutdown cancellation |
| Raw sensitive trace | Summary-only bounded audit fields; no absolute path or full content |
| AI silently writes durable knowledge | Agent proposal, then Memory proposal, then separate user confirmation |
