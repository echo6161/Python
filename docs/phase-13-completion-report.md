# Phase 13 Completion Report

- Phase: 13 - Research Knowledge Engine
- Status: implementation and fixture verification complete; live Zotero PDF pass remains manual
- Date: 2026-08-11

## Delivered

- Additive migration 0009 with Workspace index lifecycle, derived sources, exact
  chunk citations/provenance, optional vectors, and trigger-maintained FTS5.
- KnowledgeSource, extractor, indexer/service, retriever, and optional
  EmbeddingProvider boundaries. Production defaults to offline keyword retrieval.
- Page-aware Zotero PDF extraction through the fixed Local API and bounded PDF
  Worker without scanning storage or copying the source PDF.
- Reuse of Phase 10 code chunks plus Workspace Questions and confirmed Paper-Code
  Links. Unconfirmed AI proposals are not a source.
- Deterministic bounded chunking, SHA-256 fingerprints, versioned incremental
  updates, progress, cancellation, retry, crash recovery, removal, and rebuild.
- Workspace-isolated keyword and test-provider hybrid retrieval with bounded
  snippets, finite source types, scores, citations, and exact provenance.
- Typed preload and strict fixed IPC. No Renderer URL, localhost, filesystem, SQL,
  provider endpoint, or generic fetch capability was added.
- Dense responsive Knowledge page with query/scopes first, compact index status,
  mixed results, source detail, exact navigation, and 1024px drawer behavior.

## Ownership and privacy

Zotero owns bibliography and PDFs; Git/local source owns code; PaperMind owns its
Questions and confirmed links. `knowledge_*` rows are local derived data only.
Removing or rebuilding them changes no authoritative source. No model is downloaded,
no text is uploaded, and no paid API is called. Code navigation refuses to open an
old line against a changed snapshot.

## Automated evidence

- Full Vitest suite covers migration, page extraction, chunk determinism,
  incremental add/change/delete, transient-offline preservation, restart,
  Workspace isolation, keyword fallback, deterministic hybrid ordering,
  cancellation, interrupted recovery, remove/rebuild, schemas, and UI.
- Full Electron Playwright suite covers all existing workflows plus the four-state
  Phase 13 screenshot matrix at 1536x1024, 1280x800, and 1024x768.
- Fixed retrieval baseline: `phase-13-retrieval-evaluation.md`.
- Architecture and limits: `research-knowledge-engine.md`.

## Quality gates

- `npm run format:check`: passed; all configured files matched Prettier style.
- `npm run lint`: passed with zero warnings.
- `npm run typecheck`: passed for Main, Renderer, and tests.
- `npm run test`: passed, 48 files and 194 tests.
- `npm run build`: passed; renderer build completed without a large-chunk warning.
- `npm exec playwright -- test`: passed, 7 Electron workflows including the
  three responsive mixed-result viewports and the unindexed/provider-unavailable
  screenshot state.
- `git diff --check`: passed. Sensitive-pattern and artifact-path scans found no
  `.env`, credential, Token, user PDF, SQLite database, `node_modules`, build cache,
  or generated test-report path in the change set. The four PNG files under
  `docs/screenshots/phase-13` are intentional review artifacts.

## Manual verification still required

Automated tests intentionally do not use the user's Zotero Library. A live pass
should start Zotero, add a local-PDF item to a Workspace, run Update, search text
known to be on a specific page, open the citation, and confirm Zotero opens that
attachment/page. Then stop Zotero and confirm an incremental attempt fails safely
without erasing the last completed local results.

## Non-goals preserved

No AI answer, chat, Agent loop, Notes, Memory, Plan, Experiments, global UI rewrite,
Zotero write, repository write, unconfirmed proposal indexing, or Phase 14 behavior
was implemented.
