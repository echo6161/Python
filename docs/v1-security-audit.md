# V1 Security Audit

## Result

No Critical or High application security issue was found in the audited Phase
6-19 boundaries. Public release remains blocked by platform/signing verification,
not by a known runtime privilege escalation.

## Evidence

- Renderer remains sandboxed with `nodeIntegration=false`,
  `contextIsolation=true`, `sandbox=true`, fixed navigation/CSP/permission policy.
- Preload exports domain methods, not generic IPC, SQL, fetch, shell, or file APIs.
- Zotero host/port/routes are fixed in Main; raw payload and paths do not cross IPC.
- Repository operations enforce authorized canonical roots, relative paths,
  symlink containment, binary/size/encoding limits, and fixed Git argv.
- Credentials remain in OS-backed/session secret storage; tracked-file, ASAR,
  release-tree, and diff scans contain no credential material, user PDF, database,
  or `.env` (the tracked `.env.example` is non-secret documentation only).
- AI/Agent source blocks are untrusted and escaped; tools are fixed, validated,
  scoped, bounded, cancellable, and audit summarized.
- Cross-tool actions re-resolve canonical Graph nodes. GitHub is limited to clean
  `github.com` remotes; Obsidian requires an export audit; no URL crosses preload.
- `npm audit --omit=dev --audit-level=high` reported zero vulnerabilities. Direct
  dependency licenses were enumerated; all declared MIT, Apache-2.0, ISC, or
  BlueOak-1.0.0.
- The packaged ASAR contains the 17 renderer PDF standard-font files and no
  `.env`, PDF, SQLite/database, or build-cache file.
- The downloadable-build workflow runs only on its dedicated artifact branch or by
  manual dispatch, has `contents: read`, uses no secrets, does not run on pull
  requests, and only uploads fixed release globs plus a checksum manifest. It
  cannot create a GitHub Release.
- GitHub run `32364480272` confirmed that all four jobs completed with read-only
  permissions and uploaded only the three expected platform artifacts.

## Residual risks

- No independent penetration test or OS assistive security review was performed.
- Real external applications and paid providers were not invoked.
- Signing/notarization and auto-update trust chains are not established.
