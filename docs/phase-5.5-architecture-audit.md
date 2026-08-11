# Phase 5.5 Architecture Audit

- Date: 2026-08-10
- Scope: repository state after Phase 5 and manual ChatGPT handoff
- Change policy: documentation and direction only; no business-code or schema changes

## A. Current Architecture Summary

PaperMind is currently a secure, local-first Electron application centered on a managed `Paper` library:

- Renderer: React library/settings shell, paper list/details, PDF reader, annotations, and selected-text AI UI.
- Preload: fixed typed `window.paperMind` APIs for library, reader, settings, and AI use cases.
- Main: whitelisted IPC handlers, library/reader/AI services, managed-file storage, OS credential access, and OpenAI/manual ChatGPT handoff.
- Persistence: a dedicated SQLite Worker with migrations and repositories. The schema root is `papers`; files, metadata, annotations, reading state, notes, and AI conversations depend on it.
- Storage: `PaperMind Library` owns content-addressed PDF copies and their lifecycle.
- Security: `contextIsolation`, sandbox, and `webSecurity` are enabled; `nodeIntegration` is disabled; navigation, windows, and permissions are denied by default.

This architecture is sound for the completed Phase 1-5 compatibility feature set, but its domain model is not yet the target Research Workspace model.

## B. New Product Position

PaperMind becomes an **AI-native Research Workspace and Research Control Plane**. It coordinates intent, references, relationships, provenance, and bounded agents across Zotero, Git/GitHub, VS Code, and Obsidian. The root object becomes `Workspace`; `Paper` becomes one referenced resource type within a research loop.

See [product-vision.md](./product-vision.md).

## C. Data Ownership Matrix

The full matrix is in [data-ownership.md](./data-ownership.md). In short: Zotero owns bibliography/PDF/annotations; Git owns code and history; VS Code owns editing/execution; Obsidian owns durable personal knowledge; PaperMind owns Workspace research state, relationships, memory, experiments, evidence, provenance, and agent state.

## D. Source-of-Truth Matrix

The source-of-truth and freshness matrix is in [data-ownership.md](./data-ownership.md). New integrations must persist references and explicitly labeled snapshots, not unqualified copies of external canonical data.

## E. Audit Questions and Findings

### 1. What is the current root model?

`Paper` is the runtime root. `src/main/database/migrations/0001-initial.ts` creates `papers` first and makes files, authors, collections, tags, annotations, notes, and AI conversations depend on it. The target root is `Workspace`.

### 2. How dominant are Paper and PDF assumptions?

They are pervasive but bounded to recognizable domains. Shared library/reader/AI contracts use `paperId`; the reader resolves only managed paper files; the main UI mounts `LibraryWorkspace`. These assumptions must be adapted incrementally, not globally renamed.

### 3. How coupled is the database?

The schema and repositories are strongly paper-centric. `notes.paper_id` and `ai_conversations.paper_id` are required. `DatabaseWorkerClient` implements both the broad `PaperDataGateway` and `AiDataGateway`, so adding every future domain to this client would create a central coupling point. Migrations and the Worker boundary themselves are reusable.

### 4. How coupled is the Renderer?

`AppView` is only `library | settings`, and `LibraryWorkspace` owns selection, details, reader, and AI composition. The outer `App` and `Sidebar` can accept a Workspace route additively, but the library composition should later become a compatibility tool inside a Workspace-aware shell.

### 5. Is the AI gateway independent?

The provider boundary is reusable: `AiProviderRequest` contains instructions, messages, model settings, cancellation, and stream events rather than a Paper entity. `AiAssistantService`, `AiDataGateway`, shared AI contracts, and persisted conversations are paper-bound and should not be reused wholesale as the Research Agent.

### 6. Are conversations paper-bound?

Yes. `AiTaskInput`, selection scope, conversation records, service validation, repository queries, and the database foreign key require `paperId`. Future Workspace/agent conversations need a separate contextual ownership model and migration; Phase 6 does not need it.

### 7. Does storage assume PDF ownership?

Yes. `library-paths.ts` creates a `papers/` store, and `PaperFileStorage` copies, hashes, commits, trashes, restores, and deletes managed PDFs. This remains valid for legacy/fallback imports. Zotero-linked attachments must be referenced and resolved through Zotero, not copied here by default.

### 8. Which abstractions are reusable?

- Electron hardening and trusted-frame IPC checks.
- Typed shared contracts, runtime validation, and fixed preload methods.
- Domain services behind Main-process adapters.
- Dedicated SQLite Worker, migrations, transactions, and repository testing patterns.
- `AiProvider`, streaming/cancellation/error classification, secret storage, and redacted logging.
- Bounded background metadata/PDF workers for compatibility indexing.

### 9. Can IPC extend safely?

Yes, if new domains receive separate channel constants, schemas, preload namespaces, handlers, and services. Zotero must not be added as generic `invoke`, arbitrary URL fetch, or methods on the broad paper gateway. Worker operation unions may grow, so later domains should have cohesive gateways/handlers rather than one universal data interface.

### 10. Can the UI shell transition to Workspace?

Yes, additively. The simple view switch and sidebar are easy to extend. The internal library workspace is too paper-specific to become the new root unchanged. Phase 8 should introduce the Workspace shell and nest the legacy library/reader where appropriate.

### 11. What is retained, adapted, deprecated, or risky?

See sections G and H below.

## F. Conflict Register

### Critical

- The Phase 0 roadmap names single-paper RAG as Phase 6 and then Obsidian/Git as the next product spine. Following it would immediately implement the wrong subsystem. The authoritative roadmap is replaced in Phase 5.5.
- Phase 0 product/data documents describe PaperMind-owned PDFs, bibliography, collections, and annotations without an external source-of-truth distinction. They are now explicitly historical/superseded.

### High

- No `Workspace`, external reference, repository reference, evidence, provenance, experiment, or research-question entities exist.
- Required paper foreign keys make notes and AI conversations unusable outside one managed Paper.
- Managed storage assumes PaperMind owns PDF copies; using it for Zotero would duplicate authoritative attachments.
- The Renderer and navigation present the library as the application root.

### Medium

- `DatabaseWorkerClient` combines multiple gateways and could become a universal dependency if future domains are added without separation.
- PaperMind collections and editable bibliography metadata overlap with Zotero ownership; they must remain legacy-only for imported files.
- `AiAssistantService` is paper-scoped even though the underlying provider boundary is reusable.
- Existing naming (`PaperMind Library`, `LibraryWorkspace`) can mislead future work if compatibility status is not documented.

### Low

- README and package-era descriptions emphasize reading and managing papers rather than research orchestration.
- The sidebar footer says "Local workspace" but no Workspace domain object exists.

No Critical runtime security defect was found in this audit.

## G. Capabilities to Retain

- Electron Main/preload/Renderer privilege boundary and restrictive BrowserWindow policy.
- Whitelisted typed IPC, runtime validation, and structured errors.
- SQLite Worker and forward-only migration framework.
- Existing library, metadata, PDF reader, annotations, and exports as compatibility/fallback features.
- Local-first persistence, backups, path validation, and atomic managed-file operations.
- AI provider abstraction, OS-backed secrets, streaming, cancellation, mock provider, request scope review, and redacted logging.
- Unit, integration, Electron runtime, E2E, lint, strict TypeScript, and packaging checks.

## H. Capabilities to Adapt or Deprecate

### Adapt

- Add `Workspace` as a new root in Phase 7 without rewriting or dropping legacy Paper tables.
- Treat papers as Zotero/external references in new Workspace flows; retain legacy Paper IDs only for compatibility imports.
- Generalize future notes, conversations, and evidence around explicit context/reference ownership rather than nullable polymorphic fields added ad hoc.
- Present the library/reader as a Workspace resource or compatibility tool after the Workspace UI exists.
- Reuse `AiProvider` beneath a separate Research Service/Agent orchestration layer with typed tools and provenance.

### Deprecate as Primary Direction

- New PaperMind-owned bibliography and collection features that duplicate Zotero.
- Default copying of Zotero attachments into `PaperMind Library`.
- Single-paper RAG as Phase 6 or the central product workflow.
- Paper-bound AI conversation as the only conversation model.
- Direct PaperMind ownership of repository editing, execution, Git history, or Obsidian knowledge.

Deprecation here means "do not extend as the new product core"; it does not authorize deleting working features or user data.

## I. Required Pre-Refactor Before Phase 6

No code or schema refactor is required before Phase 6. The following design constraints are mandatory:

1. Create a separate Zotero adapter, service, contract, IPC namespace, and preload namespace.
2. Keep all Zotero localhost/API access in Main. Renderer supplies intent and bounded query parameters only.
3. Use stable Zotero library/item/attachment/annotation keys and provenance-bearing DTOs.
4. Keep the initial bridge read-oriented; do not copy PDFs or synthesize canonical legacy Paper rows by default.
5. Do not add Zotero operations to `PaperDataGateway` or expose generic HTTP/localhost access.
6. Preserve legacy migrations and data. Any future schema is forward-only and additive.
7. Define connection timeouts, result/page limits, cancellation, error classes, version compatibility, and redacted logs before implementation.

Phase 6 can be stateless except for non-secret connection preferences and an optional clearly labeled disposable cache. Workspace persistence belongs to Phase 7.

## J. Documentation Delivered

- `docs/product-vision.md`
- `docs/data-ownership.md`
- `docs/phase-5.5-architecture-audit.md`
- Reoriented `docs/architecture.md`, `docs/security.md`, and `docs/development-roadmap.md`
- Supersession notices in Phase 0 product/data documents
- Updated `README.md` and contributor-agent guidance in `AGENTS.md`

## K. Code and Database Changes

None. Phase 5.5 intentionally changes product and architecture documentation only.

## L. Phase 6 Safety Decision

**Safe to begin Phase 6 after explicit user approval**, provided its scope is the read-oriented Zotero Bridge and all constraints in section I are accepted. It is not safe to implement the superseded single-paper RAG Phase 6.
