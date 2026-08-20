# PaperMind

PaperMind is an AI-native Research Workspace and Research Control Plane. It coordinates research goals, papers, questions, code, experiments, evidence, conclusions, and durable memory while leaving authoritative data in the tools that own it: Zotero for bibliography/PDFs, Git for code history, VS Code for editing and execution, and Obsidian for long-term knowledge.

The implemented application includes the secure legacy Paper/PDF reader, a Workspace-first Zotero and Repository bridge, Code Intelligence, Questions/Evidence, Paper-Code Links, rebuildable Knowledge search, bounded Research Chat, Notes/Memory, adaptive Plans, a read-only Research Agent, Experiment metadata, a rebuildable Research Graph, and controlled external handoffs. Workspaces retain provenance while Zotero, Git, VS Code, and Obsidian remain authoritative. PaperMind exposes no generic filesystem, shell, SQL, URL, or localhost capability to Renderer, never executes experiments, and never promotes unconfirmed AI output into canonical research data. Full PDFs are never uploaded by default.

Architecture authority: [product vision](docs/product-vision.md), [data ownership](docs/data-ownership.md), [Phase 5.5 audit](docs/phase-5.5-architecture-audit.md), and [development roadmap](docs/development-roadmap.md).

V1 release status and platform limitations are recorded in [V1 release readiness](docs/v1-release-readiness.md) and the [acceptance matrix](docs/v1-acceptance-matrix.md).

## Prerequisites

- Node.js `24.19.0` LTS (see `.node-version`)
- npm `11` or a compatible version bundled with Node.js 24
- Git

## Install

```powershell
npm install
```

The locked SQLite package includes platform-specific Node-API binaries and is validated in the real Electron runtime. An API key is optional; all non-AI features work without one. `.env.example` contains only a non-secret logging preference. Never put credentials in `.env` or commit them to the repository.

## Development

Start the Vite renderer, TypeScript Main/Preload watcher, and Electron window:

```powershell
npm run dev
```

For Zotero Integration, run Zotero 9 or later and enable **Settings → Advanced → Allow other applications on this computer to communicate with Zotero**. Zotero 10+ supplies a native server/database ID; Zotero 9 uses the real non-zero user-library ID returned by the API as an explicitly marked compatibility identity. The application remains usable when Zotero is stopped or the Local API is unavailable.

Build and launch the packaged-mode application locally:

```powershell
npm start
```

## Quality Checks

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Check formatting without changing files:

```powershell
npm run format:check
```

## Packaging

Create an unpacked application directory for local smoke testing:

```powershell
npm run package
```

Create the installer configured for the current platform:

```powershell
npm run dist
```

Production Windows and macOS releases require code-signing credentials supplied by CI. Credentials must never be stored in this repository.

### GitHub test builds

The **V1 downloadable test builds** workflow runs for the dedicated
`codex/phase-20-v1-artifacts` branch and can be triggered manually after it reaches
the default branch. It builds Windows x64, macOS Apple Silicon, and macOS Intel
artifacts, runs a packaged-application smoke test, and keeps the downloads in the
workflow run for 90 days. It does not create a GitHub Release. GitHub requires a
signed-in account with repository read access to download Actions artifacts.

The macOS artifacts are unsigned test builds. After downloading, macOS may block
the first launch; use **System Settings > Privacy & Security > Open Anyway** only
after verifying `SHA256SUMS.txt`. These artifacts are for user acceptance, not
trusted public distribution.

## Process Boundaries

- **Main** (`src/main`): Electron lifecycle, Workspace and integration services, controlled PDF protocol, AI Provider requests, secure credential access, exports, navigation policy, permissions, and the IPC handler whitelist.
- **Metadata Worker** (`src/main/metadata`): bounded, timeout-controlled local PDF metadata and text extraction; it cannot access renderer state.
- **Database Worker** (`src/main/database`): owns the only SQLite connection, migrations, and repositories.
- **Preload** (`src/preload`): exposes fixed library, reader, AI, Zotero, Workspace, and Repository intent methods through `contextBridge`; it never exposes a credential read method or generic filesystem/shell operation.
- **Renderer** (`src/renderer`): React UI without Node.js, file-system, child-process, database, or provider access.
- **Shared** (`src/shared`): serializable contracts and the logging interface used across process boundaries.

The BrowserWindow baseline is `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `webSecurity: true`. New privileged operations require a named IPC contract and Main-side validation.

Repository roots are authorized only through Main's native directory picker.
Git inspection uses fixed read-only commands without a shell; tree and source
reads are lazy, bounded, ignore-aware, reject link traversal, and accept only
repository-relative paths. Removing a PaperMind link never changes local source
or Git history. VS Code handoff occurs only after an explicit user action.

## Project Structure

```text
src/
  main/       Electron Main process, local metadata extraction, and security policy
  preload/    Minimal contextBridge API
  renderer/   Workspace shell, controlled integrations, legacy library, PDF reader, and annotations
  shared/     Cross-process contracts and logging types
tests/
  unit/       Vitest component and security tests
  e2e/        Playwright Electron launch test
docs/         Product, architecture, data, security, and roadmap documents
```

## Local Data

The default library is created automatically in the operating system Documents directory under `PaperMind Library`. It contains `library.sqlite3`, content-addressed managed PDF copies, backups, trash, and a non-secret library manifest. Import always copies a PDF; PaperMind never modifies or deletes the source file.

PDF bytes are streamed from managed copies through a session-authorized `papermind-pdf://` URL with Range support. Renderer never receives a file path and never writes to a PDF. For the implemented schema and rollback behavior, see `docs/database-schema.md`.

## AI Provider

Configure the OpenAI API key and non-secret provider settings in the application Settings view. On Windows and macOS, the key is encrypted through Electron `safeStorage` and stored outside the paper library; on Linux, PaperMind uses a secure desktop backend when available and otherwise keeps the key in memory for the current session only. The key is never returned to the Renderer or stored in SQLite.

The official `https://api.openai.com/v1` endpoint is the default. A different Base URL requires a native warning confirmation and must use public HTTPS on the standard port; local-network targets and redirects are rejected. Requests use the OpenAI Responses API with server-side response storage disabled. Automated tests use the deterministic Mock Provider and never call a paid API. A real API request must be separately and explicitly authorized.

Without an API key, review any selected-text AI task and choose **Copy & open ChatGPT**. Main copies only the selected excerpt, optional question, and fixed task instructions, then opens the fixed `https://chatgpt.com/` URL. No conversation history, PDF file, file path, annotation, note, cookie, or ChatGPT session token is exposed to PaperMind. Nothing is uploaded until the user manually pastes and submits the prompt in ChatGPT.

PaperMind also supports official ChatGPT account sign-in through its isolated bundled Codex
runtime. If browser sign-in succeeds but generation times out because a desktop proxy is not
registered as the Windows system proxy, set **Settings > ChatGPT account via Codex > Local
proxy** to that proxy's loopback HTTP endpoint, for example `http://127.0.0.1:7897`. Only
credential-free `127.0.0.1` or `::1` URLs with an explicit port are accepted; the value is passed
only to the Codex child process.
