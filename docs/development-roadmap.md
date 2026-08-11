# PaperMind Development Roadmap

- Status: authoritative from Phase 5.5 (2026-08-10)
- Rule: start a phase only after explicit user approval; complete and report it before entering another phase
- Product direction: AI-native Research Workspace and Research Control Plane

## 1. Roadmap Principles

1. `Workspace` is the future root domain. Existing Paper/PDF features remain a compatibility subsystem.
2. Integrate with external sources of truth through stable references and bounded adapters; do not rebuild or silently copy them.
3. Preserve the Electron boundary: Renderer -> typed preload -> whitelisted IPC -> Main domain service -> adapter/persistence.
4. Use forward-only additive migrations. Never destroy Phase 1-5 user data to introduce the Workspace model.
5. Agent capabilities are typed, validated, bounded, auditable, and domain-specific. Generic shell, SQL, filesystem, and network tools are prohibited.
6. Every phase begins with code, Git, and documentation inspection and ends with applicable lint, typecheck, tests, build, manual verification, Git status, and a stop for approval.

## 2. Completed Foundation

| Phase | Delivered foundation | Status |
| --- | --- | --- |
| 0 | Initial requirements, Electron architecture, data/security models | Historical baseline; future direction superseded by Phase 5.5 |
| 1 | Electron + React + TypeScript application, hardening, test/build/package foundation | Completed |
| 2 | SQLite migrations, managed PDF storage, import, paper CRUD | Completed compatibility subsystem |
| 3 | PDF reader, search, selection, persistent annotations, reading state, exports | Completed compatibility subsystem |
| 4 | Local metadata extraction/editing, tags, collections, filtering | Completed compatibility subsystem |
| 5 | Secure AI Provider, selected-text translation/explanation/chat, streaming/cancel/error handling | Completed |
| 5.5 | Product, ownership, source-of-truth, architecture, security, and roadmap reorientation | Completed |
| 6 | Read-only Zotero Local API bridge, stable references, metadata/collection/attachment/PDF availability UI | Implemented; validation recorded in Phase 6 report |
| 7 | Workspace persistence, lifecycle, last-active state, and many-to-many Zotero references | Implemented; validation recorded in Phase 7 report |
| 8 | Workspace-first navigation, goals, Zotero picker, reference states, and lifecycle UX | Implemented; validation recorded in Phase 8 report |
| 9 | Read-only Repository Bridge, secure source browsing, observed Git identity, and VS Code handoff | Implemented; validation recorded in Phase 9 report |

## 3. Authoritative Phase Order

```text
Phase 6  Zotero Bridge
  -> Phase 7  Workspace Core
  -> Phase 8  Workspace UI
  -> Phase 9  Repository Integration
  -> Phase 10 Code Intelligence
  -> Phase 11 Research Questions
  -> Phase 12 Paper <-> Code Links
  -> Phase 13 Multi-Paper Knowledge Engine
  -> Phase 14 ChatGPT/Codex Account Integration
  -> Phase 15 Research Notes & Memory
  -> Phase 16 Adaptive Reading Plan
  -> Phase 17 Research Agent
  -> Phase 18 Experiments
  -> Phase 19 Research Graph & Cross-Tool Integration
  -> Phase 20 V1 Hardening
```

The sequence is dependency-driven. A later phase may be planned but must not be implemented early.

## 4. Phase Definitions

### Phase 6: Zotero Bridge

**Depends on:** Phase 5.5 ownership and security decisions.

**Purpose:** establish Zotero as the bibliographic source of truth through a read-oriented integration.

**In scope:** connection discovery/diagnostics, version and availability handling, bounded paginated item/collection/attachment reads, normalized attachment/PDF status, stable Zotero identifiers, typed Main adapter/service/IPC/preload contracts, cancellation/timeouts/errors, mock/integration tests.

**Out of scope:** Zotero writes, duplicate merging, citation editing, copying PDFs by default, creating canonical legacy Paper rows, Workspace CRUD, RAG, repository access, or agent behavior.

**Exit dependency:** Phase 7 can reference Zotero objects without depending on Renderer network access or legacy managed PDF ownership.

**Implementation status:** completed without a database migration. The bridge is
read-only and stateless, uses native Zotero 10+ server identity or an explicitly
marked Zotero 9 user-library fallback, keeps all HTTP and PDF availability
probing in Main, and preserves the Phase 1-5 library unchanged.
Renderer search results use 20-item pages with previous/next controls, while
Main validates a maximum page size of 25 and binds cancellation to the current
Renderer request ID. Item details display normalized metadata and attachment
availability without exposing file locations.

### Phase 7: Workspace Core

**Depends on:** stable Zotero reference identity from Phase 6.

Introduce additive Workspace persistence, lifecycle, goals/state skeleton, external references, provenance primitives, and migrations. Preserve all legacy tables and behavior. Do not build the full Workspace UI or research graph.

**Implementation status:** completed with forward migration 0004. Workspace CRUD,
active/paused/archived state, last-active recovery, and a many-to-many stable
Zotero reference association are available through Main services and typed IPC.
External metadata remains transient and unavailable/stale identities preserve
the local link. Only a Settings-based verification entry is included; Phase 8
remains responsible for the full Workspace shell and navigation.

### Phase 8: Workspace UI

**Depends on:** Phase 7 domain services and contracts.

Make Workspace the application shell and navigation root. Provide creation/selection/status views and embed Zotero resources and legacy library/reader as bounded tools. Do not add repository or agent features.

**Implementation status:** completed. Workspace is the default top-level view
with persisted creation, selection, goal editing, pause/archive/delete UX, and
last-active restoration. The Zotero picker supports bounded search, collection
filtering, pagination, multi-select, deduplication, retry, and typed add actions.
Workspace paper rows resolve transient Zotero metadata and explicit
missing/stale/unavailable states. Legacy Paper/PDF features remain available as
the clearly labelled `Legacy Library`; no legacy data or schema was changed.

### Phase 9: Repository Integration

**Depends on:** Workspace identity and UI.

Add a Main-process read-oriented Git repository adapter, repository/revision references, status diagnostics, explicit folder authorization, and immutable commit identity. Git remains authoritative; no generic shell or automatic mutation.

**Implementation status:** completed with additive migration 0005. Workspaces
may share authorized Git repository or source-folder references. Main owns
canonicalization, fixed read-only Git inspection, lazy ignored tree reads,
bounded text decoding, refresh state, and validated user-triggered VS Code
handoff. Renderer receives no generic filesystem, shell, Git, URL, executable,
or localhost capability. No repository content is copied, indexed, edited, or
deleted, and no Phase 10 code intelligence was introduced.

### Phase 10: Code Intelligence

**Depends on:** repository references and revision identity.

Build bounded language/file indexing and code navigation over authorized repositories with versioned derived indexes. VS Code remains the editor/debugger/execution surface.

### Phase 11: Research Questions

**Depends on:** Workspace Core and usable paper/code references.

Add research goals, questions, hypotheses, state transitions, decision history, and provenance-aware question workflows.

### Phase 12: Paper <-> Code Links

**Depends on:** Zotero references, code intelligence, and research questions.

Create explicit typed links among paper passages/annotations, questions, repository revisions, symbols/files, and rationale. Store links and provenance, not duplicated canonical content.

### Phase 13: Multi-Paper Knowledge Engine

**Depends on:** Workspace questions and referenced evidence anchors.

Add bounded multi-paper extraction, chunking/indexing, retrieval, citation localization, freshness, and evidence comparison. Derived indexes are rebuildable; answers distinguish retrieved evidence from model inference.

### Phase 14: ChatGPT/Codex Account Integration

**Depends on:** established Workspace context and evidence boundaries.

Evaluate and implement only supported account integration or explicit handoff mechanisms. Do not reuse ChatGPT Plus session cookies, automate the consumer UI, or claim Plus includes API access. Maintain the existing manual handoff as fallback.

### Phase 15: Research Notes & Memory

**Depends on:** questions, evidence, and provenance.

Add Workspace-owned research notes and durable memory, revision/provenance rules, and explicit non-overwriting Obsidian export/linking. Obsidian remains authoritative for the user's long-term external vault.

### Phase 16: Adaptive Reading Plan

**Depends on:** questions, multi-paper evidence, and memory.

Generate and maintain reviewable reading priorities from open questions, coverage, recency, and user constraints. Plans are suggestions and never silently change source collections.

### Phase 17: Research Agent

**Depends on:** stable domain services, provenance, reading plans, and approval policy.

Introduce an agent planner/executor using only typed, validated, bounded domain tools. Add budgets, cancellation, audit events, prompt-injection defenses, approval gates, and deterministic test harnesses. No generic shell, SQL, filesystem, or network tool.

### Phase 18: Experiments

**Depends on:** repository identity, questions, agent boundary, and provenance.

Add experiment plans, metadata, code/environment references, run handoffs, results, evidence, and conclusions. Execution remains in authorized external tooling unless a later explicit sandbox design is approved.

### Phase 19: Research Graph & Cross-Tool Integration

**Depends on:** stable links across questions, papers, code, experiments, evidence, and memory.

Materialize/query the research graph and add explicit cross-tool handoffs. This phase is not a general bidirectional sync engine and must respect each system's source of truth.

### Phase 20: V1 Hardening

**Depends on:** approved V1 feature set.

Complete migration/recovery testing, performance/accessibility, privacy review, threat modeling, dependency/license audit, telemetry opt-in decision, cross-platform packaging/signing/notarization, update/release channels, rollback, and user documentation.

## 5. Dependency and Change Rules

- Phase 6 must create a separate Zotero domain boundary; it must not extend `PaperDataGateway` into an integration gateway.
- Phase 7 owns the first Workspace schema. Phase 6 must not invent a temporary Workspace model.
- Phase 9 must establish immutable repository/revision references before code intelligence or evidence links depend on code.
- Phase 11 precedes the knowledge engine so retrieval has an explicit research purpose.
- Phase 13 precedes the Research Agent so the agent consumes tested evidence services rather than inventing retrieval behavior.
- Phase 15 precedes adaptive plans and the agent so durable memory has explicit ownership and provenance.
- Phase 17 precedes experiment orchestration so approval, audit, limits, and cancellation are established first.
- Phase 19 waits until real relationship types exist; no speculative knowledge graph schema is added early.

## 6. Quality Gates for Every Implementation Phase

At minimum, each phase must verify:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

Run Electron runtime tests, Playwright E2E, packaging, migration/backup tests, security tests, and cross-platform CI when the changed surface makes them applicable. Tests must use mocks or local fixtures for external services and must never depend on paid AI calls, private Zotero data, credentials, user PDFs, or live repositories.

## 7. Phase 6 Entry Gate (Satisfied)

Phase 6 started after explicit approval of Phase 5.5. Its implementation confirmed:

1. read-oriented Zotero scope and supported connection mode;
2. stable Zotero reference identifiers;
3. Main-only access and a fixed IPC/preload allowlist;
4. result/byte/time limits, cancellation, and error taxonomy;
5. redacted logging and no credential/session copying;
6. no default PDF copy and no canonical legacy Paper conversion;
7. fixture/mock strategy that does not require the user's Zotero library.
