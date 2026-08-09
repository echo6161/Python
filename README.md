# PaperMind

PaperMind is a local-first desktop workspace for reading and managing research papers. Phase 5 adds a Main-process OpenAI Provider, operating-system-backed credential storage, selected-text translation and explanation, scoped follow-up chat, streaming, cancellation, and local conversation history. Every request has an outgoing-content review step, and full PDFs are never uploaded in this phase. Vector retrieval, online DOI lookup, Obsidian export, and Git synchronization are not implemented yet.

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

## Process Boundaries

- **Main** (`src/main`): Electron lifecycle, controlled PDF protocol, AI Provider requests, secure credential access, exports, navigation policy, permissions, and the IPC handler whitelist.
- **Metadata Worker** (`src/main/metadata`): bounded, timeout-controlled local PDF metadata and text extraction; it cannot access renderer state.
- **Database Worker** (`src/main/database`): owns the only SQLite connection, migrations, and repositories.
- **Preload** (`src/preload`): exposes fixed library, reader, and AI intent methods through `contextBridge`; it never exposes a credential read method.
- **Renderer** (`src/renderer`): React UI without Node.js, file-system, child-process, database, or provider access.
- **Shared** (`src/shared`): serializable contracts and the logging interface used across process boundaries.

The BrowserWindow baseline is `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `webSecurity: true`. New privileged operations require a named IPC contract and Main-side validation.

## Project Structure

```text
src/
  main/       Electron Main process, local metadata extraction, and security policy
  preload/    Minimal contextBridge API
  renderer/   React library management, virtualized PDF reader, search, and annotations
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
