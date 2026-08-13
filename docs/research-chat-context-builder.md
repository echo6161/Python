# Research Chat and Context Builder

## Boundary

Research Chat preserves the desktop trust path:

`Renderer -> typed preload -> whitelisted IPC -> ResearchChatService -> ContextBuilder/AiGateway -> KnowledgeEngine/Provider`

The Renderer can submit only a Workspace ID, optional Research Question ID,
question text, finite source types, a Main-generated context preview ID, and a
subset of Main-generated source aliases. It cannot submit source text,
provenance, a URL, a provider credential, an arbitrary file path, a tool call,
or a domain mutation. The OpenAI credential remains in the existing Main-only
OS-backed secret store.

Research Chat is read-only. A conversation does not create or update a Research
Question, Evidence, Paper-Code Link, Plan, Note, Memory, Workspace, Zotero item,
repository, or source file.

## Context package

`ResearchChatContextBuilder` asks the Phase 13 retriever for at most 40 ranked
candidates in the selected Workspace and finite source scopes. The production
defaults are:

- 12 included sources;
- 12,000 excerpt/citation characters;
- Phase 13 bounded snippets, never full papers or repositories;
- exact duplicate removal by stable source identity plus normalized snippet;
- deterministic aliases `S1` through `S12` in retrieval order.

Each preview records query, Workspace/Question binding, selected source types,
candidate/included/deduplicated/truncated counts, character budget, keyword or
hybrid mode, Phase 13 index version, completion timestamp, creation time, and a
ten-minute expiry. A preview is bound to the requesting Renderer webContents ID.
Starting a turn accepts only a subset of aliases from that preview.

The persisted turn stores the exact bounded snippets and provenance that were
sent. These are explicitly historical request snapshots, not current or
authoritative copies of Zotero or Git data. Retry reuses that exact snapshot and
does not silently re-run retrieval.

## Prompt and citation binding

The system instruction states that paper, code, Question, and link excerpts are
untrusted data. Source blocks are delimited and identify the only legal citation
aliases. The provider receives no tool definitions and has no filesystem,
network, Zotero, Git, SQLite, or domain-write capability through this flow.

Provider text is not trusted as provenance. After completion, PaperMind extracts
citation-shaped tokens and binds a clickable citation only when the alias exists
in the exact context stored for that assistant message. Unknown tokens remain
visible as unsupported citations and cannot navigate. Citation navigation resolves
the stored chunk ID through Phase 13 `KnowledgeEngineService.openResult`, which
rechecks Workspace ownership and current source availability.

## Persistence

Migration `0010-research-chat.ts` adds independent Workspace chat tables instead
of changing the legacy Phase 5 paper conversation tables:

- `research_chat_conversations` binds Workspace and optional Question;
- `research_chat_messages` stores user/assistant text and terminal state;
- `research_chat_contexts` stores budgets, versions, query, and audit counts;
- `research_chat_context_sources` stores the exact bounded sent snapshots.

An interrupted `streaming` message becomes a retryable failed message on startup.
Conversation history is local plaintext because it is user-created research
content. API keys, credential blobs, provider redirects, and complete external
documents are never stored in these tables.

## Streaming and errors

The existing OpenAI/Mock provider abstraction supplies streaming. Research Chat
adds one active request per Renderer owner, a 90-second timeout, a two-million
character local response ceiling, cancel, retry, provider error mapping, terminal
database writes, and safe shutdown. Provider-unavailable state disables Send but
does not affect local Knowledge search or other non-AI features.

## UI behavior

The Chat tab keeps Workspace/Question binding and source scope above the thread.
The composer first builds a context preview; the user can inspect and deselect
sources before Send. At 1280 CSS pixels and above, the thread and source rail are
simultaneously visible. Below 1280, the rail is an explicit drawer and closes when
generation starts, preserving the answer, citation controls, composer, and Cancel.
The minimum desktop width is 1024 CSS pixels so the specified compact mode is a
real application state rather than screenshot scaling.

## Limits

- Production retrieval remains keyword-only unless the optional Phase 13
  EmbeddingProvider is explicitly configured.
- Research Chat requires an API credential for real provider requests; a ChatGPT
  Plus subscription is not an API credential.
- No Agent loop, tool execution, automatic object creation, full-library prompt,
  or cross-Workspace retrieval is implemented.
