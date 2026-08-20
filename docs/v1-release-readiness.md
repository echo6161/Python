# PaperMind V1 Release Readiness

## Conclusion

**BLOCKED**

The local Windows `0.20.0` RC is suitable for user acceptance testing. The revised
delivery target is manually generated GitHub Actions test artifacts for Windows
and macOS, not a signed public release. That target is not yet verified.

## Blocking items

1. `.github/workflows/v1-downloadable-builds.yml` has not been committed, pushed,
   or executed by GitHub Actions.
2. macOS Apple Silicon and Intel packages have not yet passed the real-runner
   packaged smoke.
3. A downloaded macOS artifact has not completed first-launch user acceptance.

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

No upload, release publication, telemetry enablement, or Phase 21 work is allowed
by this conclusion.
