# PaperMind Agent Guidance

## Scope and Authority

- Read `docs/product-vision.md`, `docs/data-ownership.md`, `docs/architecture.md`, `docs/security.md`, `docs/development-roadmap.md`, and the current phase request before editing.
- `Workspace` is the target root domain. The Phase 1-5 Paper/PDF library is a supported compatibility and fallback-import subsystem.
- Zotero owns bibliography metadata, source PDFs, annotations, citations, and literature organization. Git owns code/history. VS Code owns editing/debug/execution. Obsidian owns long-term external knowledge.
- Persist stable references, provenance, and explicitly labeled snapshots. Do not silently copy externally authoritative data or present a cache as current truth.

## Engineering Boundary

- Preserve Renderer -> typed preload -> whitelisted IPC -> Main domain service -> adapter/persistence.
- Renderer must not access Node.js, filesystem, SQLite, shell, Git, Zotero API, agent server, arbitrary localhost, or arbitrary network endpoints.
- Give each integration its own contracts, validation, service, adapter, errors, limits, cancellation, and tests. Do not expose generic `invoke`, HTTP, shell, SQL, or filesystem APIs.
- Agent tools must be typed, validated, bounded, auditable, domain-specific, and scoped to an approved Workspace/resource. No generic shell, arbitrary SQL, `readAnyFile`, or unrestricted URL fetch.
- Keep secrets in OS-backed secure storage. Never place credentials, tokens, cookies, private keys, user documents, or external session material in source, SQLite plaintext, logs, fixtures, snapshots, exports, or Git.

## Change Discipline

- Work only on the explicitly approved phase. Do not pre-implement later roadmap phases.
- Inspect code, Git status, and relevant docs before planning. Report conflicts or ambiguous ownership decisions before implementation.
- Preserve unrelated Python/Jupyter content and user changes in this mixed repository.
- Use forward-only additive database migrations; never rewrite an applied migration or delete legacy user data.
- Do not bypass strict TypeScript, lint, tests, security controls, or error handling to make a check pass.
- Run applicable lint, typecheck, tests, build, runtime/E2E, and packaging checks; report actual results and stop after the current phase.
