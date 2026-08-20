# PaperMind V1 Acceptance Matrix

Status vocabulary: `PASSED`, `FAILED`, `UNVERIFIED`. Checked on Windows 11,
2026-08-20. Evidence must be reproducible from repository commands.

| Area | Status | Evidence / disposition |
| --- | --- | --- |
| Fresh database and migration 1-15 | PASSED | `library-database.test.ts`, packaged fresh-root smoke |
| Phase 2-style real upgrade fixture | PASSED | `library-database.test.ts` preserves legacy paper/file/author/settings |
| Migration idempotency/checksums | PASSED | repeat-open migration tests |
| Backup and restore | PASSED | SQLite backup/restore integration test and restored row equality |
| Legacy Paper/PDF retention | PASSED | legacy upgrade and full reader E2E |
| Code index incremental/rebuild/recovery | PASSED | Code Intelligence lifecycle tests |
| Knowledge incremental/cancel/recovery/remove | PASSED | Research Knowledge integration tests |
| Research Graph deterministic rebuild/isolation | PASSED | `research-graph.test.ts` |
| Agent cancel/timeout/injection/limits | PASSED | Research Agent integration/unit tests |
| IPC and Renderer privilege boundary | PASSED | schema/security tests; no generic invoke exposed |
| Filesystem/root/symlink/path traversal | PASSED | Repository security and bridge fixtures |
| Network/auth/credential boundary | PASSED | base URL, secret-store, Codex lifecycle tests; secret scan |
| Outbound URL/path derivation | PASSED | Cross-tool fixed-node tests and fallback E2E |
| Seven-page Windows responsive matrix | PASSED | 21 Phase 20 screenshots and overflow assertions |
| Empty/loading/error/confirmation states | PASSED | four required state baselines plus fallback/cancel states |
| Keyboard/focus/semantic label sample | PASSED | V1 E2E, dialog focus tests, existing unit/E2E roles |
| Actual Windows packaged application | PASSED | `npm run package`, `npm run dist`, isolated packaged smoke with migrations 1-15 |
| Windows installer signature / publisher identity | FAILED | `Get-AuthenticodeSignature` reports `NotSigned`; accepted only for the revised test-artifact scope |
| Windows release identity and metadata | FAILED | default Electron icon and missing author; non-blocking for local user acceptance only |
| GitHub Actions downloadable artifacts | UNVERIFIED | manual, read-only workflow added; it has not been pushed or executed remotely |
| macOS Apple Silicon and Intel package smoke | UNVERIFIED | `macos-15` / `macos-15-intel` jobs defined; real runner results are required |
| macOS downloaded first launch | UNVERIFIED | unsigned test package requires checksum verification and Gatekeeper approval |
| Linux AppImage build and smoke | UNVERIFIED | not included in the user-revised Windows/macOS test-artifact target |
| Real Zotero/VS Code/GitHub/Obsidian user workflow | UNVERIFIED | deterministic adapters/fallback tested; user apps not exercised here |
| Real paid/provider AI request | UNVERIFIED | not authorized; deterministic provider tests passed |
| CI reproducibility | UNVERIFIED | workflow is locally parsed and formatted but has no completed GitHub run |

The revised target is downloadable Windows/macOS user-acceptance artifacts, not a
public signed release. Windows local acceptance may proceed. Overall readiness
remains blocked until both macOS architectures build and pass packaged smoke on
real GitHub runners and a downloaded macOS artifact completes first-launch smoke.
