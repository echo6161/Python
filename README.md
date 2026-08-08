# PaperMind

PaperMind is a local-first desktop workspace for reading and managing research papers. Phase 4 adds offline PDF metadata and first-page extraction, explicit source/confidence labels, user confirmation, authors, tags, flat collections, favorites, reading status, field filters, local full-text filtering, sorting, and bounded batch updates. The virtualized PDF.js reader and persistent annotations remain available. AI, online DOI lookup, Obsidian, and Git synchronization are not implemented yet.

## Prerequisites

- Node.js `24.19.0` LTS (see `.node-version`)
- npm `11` or a compatible version bundled with Node.js 24
- Git

## Install

```powershell
npm install
```

The locked SQLite package includes platform-specific Node-API binaries and is validated in the real Electron runtime. No API key is required. `.env.example` contains only a non-secret logging preference. Never commit `.env` files or credentials.

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

- **Main** (`src/main`): Electron lifecycle, controlled PDF protocol, exports, navigation policy, permissions, and the IPC handler whitelist.
- **Metadata Worker** (`src/main/metadata`): bounded, timeout-controlled local PDF metadata and text extraction; it cannot access renderer state.
- **Database Worker** (`src/main/database`): owns the only SQLite connection, migrations, and repositories.
- **Preload** (`src/preload`): exposes fixed library and reader methods through `contextBridge`.
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
