# Phase 18 Completion Report

## Status

Complete for Phase 18. The application version is `0.18.0`.

## Delivered

- Audited, owner-scoped, cancellable `ResearchAgentService` with fixed budgets,
  terminal reasons, partial/failure handling, and restart recovery.
- Nine-tool read-only `DomainToolRegistry` with same-run chunk authorization.
- Strict provider envelope, citation binding, prompt-injection boundary, bounded
  trace summaries, uncertainty, and typed Memory proposal.
- Forward-only migration `0014-research-agent`, database Worker gateway, typed
  IPC/preload API, and no Renderer access to Node or external adapters.
- Dense responsive Agent page with answer, live status/cancel, run history,
  budgets, trace summary, sources, and proposal review.
- Proposal forwarding into the existing pending Memory review flow; no canonical
  Memory is written by the Agent.

## Automated evidence

- `tests/integration/research-agent.test.ts`: happy path, injection, allowlist,
  partial failure, all budgets, hung-tool cancellation/timeout, concurrent start,
  owner-close cancellation, restart recovery, invalid provider output, citation
  deduplication, isolation, proposal reference recovery, and canonical Memory
  separation.
- `tests/unit/domain-tool-registry.test.ts`: invalid arguments, arbitrary path/
  URL rejection, and same-run/matching-type chunk authorization.
- `tests/unit/research-agent-schemas.test.ts`: bounded IPC inputs.
- `tests/unit/workspace-research-agent-page.test.tsx`: dense run and proposal UI.
- `tests/e2e/research-agent.spec.ts`: real Electron multi-source run, cancellation,
  proposal boundary, three viewports, screenshots, and SQLite assertions.

## Security and ownership

No generic shell, filesystem, SQL, HTTP, localhost, Git, Zotero, Obsidian, or
dynamic tool API was added. The provider cannot choose tools, arguments, budgets,
Workspace, or writes. Trace stores summaries rather than raw source content or
absolute paths. Existing Phase 1-17 data remains intact.

## Screenshot evidence

See [phase-18-screenshot-matrix.md](./phase-18-screenshot-matrix.md).

## Command evidence

- `npm run format:check`: passed.
- `npm run lint`: passed with zero warnings.
- `npm run typecheck`: passed for Main, Renderer, and tests.
- `npm run test`: passed, 64 files and 275 tests.
- `npm run test:e2e`: passed the production build and all 14 Electron workflows;
  Vite transformed 1,856 modules.
- `npm run package`: passed after explicit network permission. Electron Builder
  produced `release/win-unpacked/PaperMind.exe` for Windows x64 and completed the
  configured signing steps.
- Packaged-app smoke test: passed with an isolated temporary library; the actual
  executable opened a `PaperMind` window, rendered the product and `v0.18.0`, and
  closed normally through Playwright.
- `git diff --check`: passed. Sensitive/artifact scans are recorded in the final
  phase report.

The full E2E run regenerated the tracked Phase 15-17 screenshots because the
visible application version is now `0.18.0`. After explicit user authorization,
all 12 unrelated historical screenshots were restored to the Phase 17 commit;
only the Phase 18 screenshot matrix remains in this phase's diff.

## Completion audit additions

- Every tool now has a centrally enforced Zod input schema, including no-input
  inspect/list operations.
- Per-owner initialization locks reject concurrent starts; owner destruction and
  shutdown also cancel provider initialization.
- Abort-aware tool races terminate even when an underlying read Promise never
  resolves. The attempted step is audited as cancelled and late results are ignored.
- The context budget counts both escaped tool results and the exact citation
  excerpts sent to the provider. Truncation preserves block boundaries.
- Provider citation aliases are deduplicated before persistence.
- Memory proposal forwarding repairs missing citation references on retry before
  marking the Agent proposal accepted.

## Non-goals preserved

No multi-Agent coordination, background infinite loop, code execution,
experiments, external write, global UI rewrite, or Phase 19 feature was added.
