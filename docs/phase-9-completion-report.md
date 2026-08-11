# Phase 9 Completion Report

- Phase: 9 - Repository Bridge
- Status: implementation complete; quality evidence recorded below
- Date: 2026-08-11

## Delivered

- Additive `RepositoryRef` persistence and a Workspace-to-Repository many-to-many
  association for authorized Git repositories and ordinary source folders.
- Main-process native directory authorization, canonical-root inspection,
  observed Git root/branch/HEAD/sanitized remote state, missing/permission state,
  and explicit refresh.
- Fixed read-only Git execution without a shell, prompts, optional locks, mutable
  commands, or Renderer-controlled arguments.
- Lazy bounded source tree with Git ignore support, default dependency/build/cache/
  generated/credential exclusions, pagination, cancellation, and disabled link
  entries.
- Main-enforced realpath containment, path traversal rejection, no symlink or
  junction following, and safe missing/permission/race handling.
- Bounded UTF-8/UTF-16 source viewer with line numbers and safe React-based syntax
  highlighting; binary, unsupported encoding, large, secret, and excluded files
  fail closed.
- User-triggered VS Code repository/file/line handoff through a fixed
  `vscode://file` URI after authorized-path resolution.
- Fixed typed Repository IPC/preload namespace, strict runtime input/output
  validation, sender-scoped cancellation, minimal Workspace UI, and recovery
  states.

## Ownership and non-goals

The local repository or source folder remains authoritative. PaperMind stores an
authorized canonical root, Workspace association, and explicitly observed Git
diagnostics. It does not copy, edit, delete, index, checkout, commit, pull, push,
merge, reset, or clean repository content. Deleting a PaperMind reference affects
only PaperMind tables. Legacy Paper/PDF and Phase 6-8 data remain unchanged.

No AST, code intelligence, embedding, AI code explanation, Paper-Code Link,
Repository mutation, generic shell/filesystem/URL API, or Phase 10 feature was
implemented.

## Acceptance evidence

1. Git repositories and non-Git source folders link, share across Workspaces,
   persist after restart, and can be removed without local changes:
   `repository-bridge.test.ts` and the Repository Electron E2E passed.
2. Branch, HEAD, sanitized remotes, changed HEAD, missing/moved roots, and stable
   retained references are covered by integration tests and passed.
3. Git ignore, defaults, pagination, UTF-8/UTF-16, binary, invalid encoding,
   oversized files, permission mapping, sensitive files, outside junctions,
   loops, cancellation, and traversal tests passed.
4. Strict IPC schemas reject Renderer-provided roots, URLs, executables, Git args,
   absolute paths, traversal, oversized pages, and invalid VS Code locations.
5. VS Code tests permit only an authorized root or in-root regular file with
   validated line/column. The Electron E2E verifies the exact fixed URI using a
   stubbed external opener, so the test never launches an app without user action.
6. Repository-reference deletion and association removal leave fixture source,
   HEAD, history, and `git status --porcelain` unchanged.

## Validation

- `npm run format:check`: passed.
- `npm run lint`: passed with zero warnings.
- `npm run typecheck`: passed for Main, Renderer, and test projects.
- `npm run test`: 33 files passed, 148 tests passed.
- `npm run build`: passed; Vite retained the existing large-chunk warning.
- `npx playwright test`: 6 Electron scenarios passed, including repository
  selection, browsing, source viewing, restart recovery, HEAD refresh, VS Code
  URI validation, removal, and clean-worktree verification.
- `npm run package`: build passed, but electron-builder's remote Electron download
  first failed with sandbox `EACCES` and then network `ETIMEDOUT`.
- `npx electron-builder --dir --config.electronDist=node_modules/electron/dist`:
  passed using the already installed Electron 43.3.0 distribution; produced
  `release/win-unpacked/PaperMind.exe`.
- The Repository E2E screenshot was inspected at its original resolution. The
  tree, source viewer, state, controls, line numbers, and remaining honest
  placeholders were visible without incoherent overlap.
- A real `vscode://file/D:/code/src/shared/contracts/repository.ts:1:1` handoff
  was invoked after approval; the command succeeded and 15 running VS Code
  processes were observed. The file was not modified.

## Residual risks

- The main Renderer bundle remains about 806 kB minified and triggers the existing
  Vite chunk-size warning.
- Packaging uses Electron's default icon and reports the existing missing package
  author metadata. Release signing, installer distribution, and cross-platform
  validation remain later hardening work.
- The automated VS Code check stubs `shell.openExternal` so regression tests do
  not open external applications; the registered real handler was verified
  separately as described above.
