# Phase 17 Completion Report

## Status

Complete for Phase 17. The canonical application version is `0.17.0`.

## Delivered

- Workspace-owned `ResearchPlan`, `PlanTask`, dependencies, typed references,
  completion evidence, version history, and pending proposal persistence.
- Manual create/update/delete/retire, task CRUD/reorder/status/dependency,
  explicit evidence-bearing completion, stale source states, and history UI.
- AI Generate/Adapt proposal with deterministic Mock coverage, strict JSON,
  editable preview, add/update/keep/conflict labels, reject, and explicit confirm.
- Compact Overview summary and responsive Plan workspace with a 1024 detail drawer.
- Forward-only migration `0013-adaptive-research-plan` and typed preload/IPC.

## Data and security

- SQLite remains in the database Worker.
- The Renderer receives only domain-specific methods and typed reference targets.
- No source content, credentials, arbitrary file paths, URLs, shell, or network
  endpoint is exposed through Plan IPC.
- Plan deletion affects only PaperMind Plan tables. External sources remain owned
  by Zotero, Git, Questions, and Memory.

## Automated evidence

- `tests/integration/research-plan.test.ts`: manual lifecycle, ordering,
  dependency blocked state, cycles, isolation, completion evidence, orphaned
  sources, restart, proposal confirmation, completed-task preservation, retire,
  and ownership-safe delete semantics.
- `tests/unit/research-plan-schemas.test.ts`: bounded input, confirmations,
  duplicate ids, blocked reason, and typed-reference security boundary.
- `tests/unit/workspace-research-plan-page.test.tsx`: dense summary, blocked reason,
  manual state transition, pending diff, explicit proposal confirmation,
  required-title feedback, in-app task-deletion focus restoration, and
  stale-refresh ordering protection.
- `tests/e2e/research-plan.spec.ts`: real Electron IPC/UI, fake provider,
  responsive viewports, no horizontal overflow, proposal reject flow, and
  deleting the last task followed by immediate replacement and direct database
  verification without an application restart.

## Screenshot evidence

See [phase-17-screenshot-matrix.md](./phase-17-screenshot-matrix.md).

## Command evidence

- `npm run lint`: passed with zero warnings.
- `npm run format:check`: passed; all checked files match Prettier style.
- `npm run typecheck`: passed for main, Renderer, and test TypeScript projects.
- `npm run test`: passed, 60 test files and 257 tests.
- `npm run build`: passed; Vite transformed 1,853 modules and emitted the
  production Renderer plus compiled Main/preload output.
- `npx playwright test tests/e2e/research-plan.spec.ts`: passed, three real
  Electron workflows covering three viewports, the pending proposal flow,
  delete -> status change -> add task, and delete-only-task -> required-title
  validation -> add replacement -> database persistence without restarting.
- `npm run test:e2e`: passed all 13 real Electron workflows across the existing
  PDF, Workspace, Repository, Knowledge, Chat, Notes/Memory, and Plan surfaces.
- `npm run package`: passed after explicit network permission; Electron Builder
  produced `release/win-unpacked/PaperMind.exe` for Windows x64.
- `git diff --check`: passed. Secret and tracked-artifact scans found no API
  keys, tokens, private keys, user PDFs, SQLite databases, dependencies, or
  build output in Git. Only `.env.example` is tracked.

The first packaging attempt was blocked by restricted network access while
downloading Electron. It was rerun with explicit permission and succeeded.

## Phase 17 acceptance fix

Manual acceptance found that deleting the selected task could leave later Plan
actions waiting until restart. Local mutations now return immediately after the
database transaction instead of waiting for external source hydration. The UI
reselects the next available task, releases its operation lock, and refreshes
external availability in the background. Monotonic request/version guards stop
an earlier empty refresh from replacing a newer task state, and lifecycle guards
ignore responses from a previous Workspace or unmounted page. A fault-injection
integration test, forced out-of-order unit test, and real Electron regression
test cover the sequence.

The acceptance screenshot also exposed two interaction problems. Both plan and
task deletion used visually identical trash icons, and an empty task title
silently disabled an unstyled action. The controls now read `Delete plan` and
`Delete task`, task dialog actions have explicit working/disabled styles, and an
empty submission displays `Task title is required.` without issuing IPC.

Windows acceptance then showed that closing the native task deletion
`window.confirm` could leave the Electron Renderer without keyboard focus until
the user pressed Alt. Task deletion now uses an application-owned `alertdialog`:
Cancel restores the original Delete task control, successful deletion focuses
the surviving Task action, and the new-task title receives focus explicitly.
The confirmation dialog traps Tab focus, and the task form ignores Enter/Escape
during Windows Chromium IME composition.
The Electron regression performs delete -> Enter -> keyboard typing -> submit
without `fill()`, a restart, or Alt, then verifies the replacement in SQLite.

### Windows focus-fix revalidation

- `npm run lint`, `npm run typecheck`, and `npm run format:check`: passed.
- `npm run test`: passed, 60 files and 257 tests.
- `npm run build:node` and `npm run build:renderer`: passed; Vite transformed
  1,854 modules.
- `npx playwright test`: passed all 13 Electron workflows. The last-task test
  uses keyboard Enter/type rather than Playwright `fill()` after deletion.
- The default `npm run build` cleanup could not remove
  `release/win-unpacked/dxcompiler.dll` because the previously packaged app was
  still running. No process was terminated automatically. The same compiled
  output was packaged successfully with
  `electron-builder --dir --config.directories.output=release-phase17-fix`,
  producing `release-phase17-fix/win-unpacked/PaperMind.exe`.

## Non-goals preserved

No Agent, internet research, code execution, experiment execution, Zotero write,
or Phase 18 functionality was implemented.

## Residual risks

- Electron Builder reports that the application author and custom icon are not
  configured; the packaged application therefore uses the default Electron icon.
- AI proposal confirmation validates sources before applying changes, but adding
  proposed source references follows the canonical task update rather than being
  one database transaction. A process interruption at that exact boundary can
  leave confirmed tasks without their optional proposed references; history and
  a later manual add remain available.
- The deterministic Mock provider is the automated AI baseline. Real-provider
  quality depends on the configured provider and was not invoked during tests.
