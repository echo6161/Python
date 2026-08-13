# Phase 15 Completion Report

## Status

- Official feasibility gate: `SUPPORTED`
- Implementation: complete
- Final readiness: `READY` for user-driven account verification. Source build and
  automated gates pass; unpacked packaging remains unverified because its
  required download is blocked by the current execution environment.

## Delivered

- Official Codex App Server `0.147.0` adapter behind `AiProvider`, with isolated
  Codex home, OS keyring, strict config, account/model discovery, official browser
  login/logout/cancel, streaming, cancellation, timeout, response validation,
  restart recovery, and fail-closed tool rejection.
- Typed provider status/select/login/cancel/logout IPC and minimal preload API.
- Additive migration 0011 for selected/generation provider provenance; legacy AI
  settings and conversations default to OpenAI without destructive rewrites.
- Compact provider settings UI covering connected, not connected, expired,
  offline, version mismatch, login pending/cancelled, and error states.
- Deterministic transport/service/UI/E2E tests and five responsive/status screenshots.

## Verification

- Lint: passed, zero warnings.
- Format: passed.
- Typecheck: main, Renderer, and tests passed with strict settings.
- Vitest: 53 files, 214 tests passed.
- Build: Main TypeScript and Vite production build passed.
- Electron E2E: 9 tests passed, including the Phase 15 responsive state matrix.
- Package: blocked. `electron-builder --dir` reached Windows packaging, then the
  sandbox denied the required GitHub download (`connect EACCES ...:443`). The
  escalation request was rejected because the current Codex usage limit was hit.
- Real login/generation: not run. This requires the user's browser interaction;
  no password should be supplied to PaperMind or the developer.

## Security Review

- No token, API key, password, Cookie, private endpoint, private key, user PDF,
  SQLite database, `node_modules`, build output, or test cache is tracked.
- Renderer cannot supply a URL, protocol, host, port, path, command, or cookie to
  the Codex IPC. The validated `https://chatgpt.com` login URL stays in Main.
- Codex inherits an allowlisted environment without token/API-key variables.
  History, analytics, updates, agents, MCP, and web search are disabled.
- Tests use no real account, private Library, paid API, or network.

## Remaining Manual Checks

1. Run unpacked packaging when the official Electron asset download is available.
2. In Settings, choose ChatGPT account via Codex and complete the official browser
   login without sharing credentials.
3. Verify discovered plan/models, switch to Codex, send one minimal reviewed
   Research Chat request, cancel one request, restart PaperMind, then sign out.
4. Confirm the isolated OS-keyring credential survives restart and that sign-out
   does not affect another Codex client profile.

No Phase 16 work was started.

## Post-completion Login Fix (2026-08-13)

Manual login exposed an IPC validation defect: the official protocol defines
`loginId` as an opaque string, while PaperMind incorrectly required a UUID. The
browser could open before output validation failed, producing the misleading
library error shown by the UI. The schema and client validation now accept a
bounded opaque identifier, reject control characters/URL-shaped values, preserve
safe login failure reasons, avoid a fast-completion notification race, and use a
Codex-specific fallback error message. Post-fix format, lint, strict typecheck,
all 53 Vitest files (215 tests), and the production build pass. Electron E2E was
not re-verified in the corrective run because both the full and Phase 15-only
runs stalled while launching the Electron window in the managed Windows host;
the processes were stopped without modifying application data.

A second manual retry exposed an independent destination allowlist defect. A
redacted probe against the bundled official runtime confirmed that version
`0.147.0` returns an HTTPS authorization URL on `auth.openai.com`, while the
initial implementation incorrectly required `chatgpt.com`. The Main-only
allowlist now uses the exact observed official host and continues to reject URL
credentials, non-default ports, arbitrary hosts, and any Renderer-supplied URL.
After this correction, format, lint, strict typecheck, all 53 Vitest files (219
tests), and the production build pass.

The first user-driven Research Chat request then exposed a pinned-runtime
protocol change: version `0.147.0` rejects the former nested `readOnly.access`
shape. The adapter now negotiates experimental protocol support, discovers and
requires a generated `papermind-research-read-only` permission profile, creates
ephemeral threads with that profile, and sends no sandbox override at turn level.
The profile denies broad filesystem and temporary-directory reads, allows only
minimal platform runtime paths plus PaperMind's isolated empty workspace for
reads, blocks local network binding, and permits outbound access only to the
official `chatgpt.com` Codex service.

Direct Codex connectivity can differ from browser login connectivity. PaperMind
therefore accepts an optional credential-free loopback HTTP proxy for the isolated
Codex child. Remote proxy hosts, proxy credentials, paths, queries, and fragments
are rejected. This fixes environments where a desktop proxy is active but Windows
system proxy discovery is disabled, without broadening Renderer access.
Missing, blocked, invalid, or excessively paginated profile results fail closed
rather than falling back to a built-in or broader filesystem scope.

The bundled runtime accepted the generated profile through
`permissionProfile/list`. A real, explicitly authorized, minimal read-only request
through the user's loopback proxy produced the exact `OK.` response and completed
without tools, files, commands, web search, skills, plugins, or subagents.

Post-fix verification passes format, lint, strict typecheck, all 53 Vitest files
(225 tests), the production build, and all 9 Electron E2E tests. Git diff checks
are clean and scans found no credential-shaped value, user PDF, SQLite database,
dependency directory, or build/test output tracked by this change.

The first successful user-driven Codex generation exposed a final IPC output
contract mismatch: the shared Research Chat contract and persistence layer accepted
`codex`, but the Main-process response schema still accepted only `openai`. The
provider completed the request and persisted the answer, while output validation
returned a generic error to Renderer. The response schema now accepts both supported
generation providers, with a dedicated Codex handshake regression test. A read-only
check of non-content metadata confirmed the affected local turn was `complete` with
no provider error. Post-correction format, lint, strict typecheck, all 53 Vitest files
(226 tests), the production build, and all 9 Electron E2E tests pass.

Manual citation navigation then exposed an external Windows integration failure,
not a provenance defect: the machine-wide `zotero://` handler still targeted an
old, missing Zotero installation while the running Zotero executable had moved.
The current user's protocol registration was repaired and the exact indexed
attachment/page opened through both the executable and the system protocol. The
Main-only Zotero launcher now maps future OS protocol failures to the explicit
`ZOTERO_LAUNCH_FAILED` error across Knowledge and Research Chat citation IPC,
without exposing a Renderer URL, file path, executable, or generic shell action.
Post-correction format, lint, strict typecheck, all 53 Vitest files (229 tests),
the production build, and all 9 Electron E2E tests pass.
