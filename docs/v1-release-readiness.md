# PaperMind V1 Release Readiness

## Conclusion

**READY FOR USER ACCEPTANCE**

The revised Windows/macOS GitHub Actions test-artifact target is verified. This is
not approval for a signed public release.

## Verified GitHub run

- Run: https://github.com/echo6161/Python/actions/runs/32364480272
- Validated commit: `ddd57615d91a1a79d739d6ee4793496f85b6f05e`
- Quality gates: passed.
- Windows x64 package/smoke/upload: passed.
- macOS Apple Silicon package/smoke/upload: passed.
- macOS Intel package/smoke/upload: passed.

Each packaged smoke opened PaperMind `0.20.0`, verified 17 renderer standard-font
files, applied fresh migrations 1-15, and rejected forbidden ASAR content.

| Artifact | ID | Size | GitHub artifact digest | Expires |
| --- | ---: | ---: | --- | --- |
| `papermind-windows-x64-ddd5761...` | `9405106885` | 212,928,315 bytes | `sha256:c15ce4e5cf24175b54122850713a63225b9e31813e908b44a25e24b5885e4370` | 2026-11-18 |
| `papermind-macos-arm64-ddd5761...` | `9405031255` | 529,982,228 bytes | `sha256:e995ac6d31ab48aabfa3865b2fe6529a1a0acddc1c957a26cfab890b3ee5d3f7` | 2026-11-18 |
| `papermind-macos-x64-ddd5761...` | `9405089723` | 554,847,125 bytes | `sha256:5d873e4ddc7981c3375468e646a1f6448e1afda3855e54724d9e7b8b2f52f50b` | 2026-11-18 |

The artifact digest covers GitHub's downloadable archive. Each artifact also
contains `SHA256SUMS.txt` for its packaged DMG/ZIP/EXE files.

## User acceptance remaining

1. Download the artifact matching the Mac architecture from the run page.
2. Verify `SHA256SUMS.txt` before opening the DMG or ZIP.
3. Complete first launch on the target Mac, using Gatekeeper's explicit approval
   for the unsigned test build when required.
4. Exercise the real Zotero, VS Code, GitHub, Obsidian, and selected AI-provider
   workflows needed by that user.

## Accepted test-build limitations

- Windows and macOS artifacts are unsigned and are not trusted public releases.
- macOS may require **System Settings > Privacy & Security > Open Anyway** after
  checking `SHA256SUMS.txt`.
- The package uses the default Electron icon and has no author metadata.
- GitHub Actions artifacts require a signed-in account with repository read access
  and expire after 90 days. Rerun the manual workflow to refresh them.
- Linux remains unverified and is outside this revised Windows/macOS artifact gate.

## Windows RC status

The final run passed formatting, lint, strict type checking, 284 Vitest tests, 16
Electron E2E workflows, the production build, unpacked packaging, NSIS packaging,
ASAR content checks, and an isolated packaged fresh-root smoke. The smoke displayed
`v0.20.0` and applied migrations 1-15.

Local artifacts:

- `release/PaperMind Setup 0.20.0.exe`
- SHA-256:
  `C396FC6A3D6575C7DADED2AFDA306D3542457D8C5E152C6D1CD7195D69F2B780`

The installer is intentionally not published. `release/` is ignored build output,
not release evidence committed to Git.

The GitHub workflow runs only on its dedicated artifact branch or by manual
dispatch, uses read-only repository permissions, runs the Windows quality gates,
builds Windows x64 plus macOS arm64/x64, runs `npm run test:package`, creates
SHA-256 manifests, and uploads 90-day artifacts without creating a Release.
GitHub documents that workflow artifacts require signed-in repository read access;
electron-builder documents the explicit unsigned macOS test-build configuration:

- https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts
- https://www.electron.build/docs/features/code-signing/code-signing-mac/

No GitHub Release, signed-public-release claim, telemetry enablement, or Phase 21
work is implied by this conclusion.
