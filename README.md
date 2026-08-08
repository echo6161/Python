# PaperMind

PaperMind is a local-first desktop workspace for reading and managing research papers. The current repository contains the Phase 1 Electron application shell only; PDF, database, AI, Obsidian, and Git synchronization features are intentionally not implemented yet.

## Prerequisites

- Node.js `24.19.0` LTS (see `.node-version`)
- npm `11` or a compatible version bundled with Node.js 24
- Git

## Install

```powershell
npm install
```

No API key is required for Phase 1. `.env.example` contains only a non-secret logging preference. Never commit `.env` files or credentials.

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

- **Main** (`src/main`): Electron lifecycle, window creation, navigation policy, permissions, and the IPC handler whitelist.
- **Preload** (`src/preload`): exposes only `window.paperMind.app.getInfo()` through `contextBridge`.
- **Renderer** (`src/renderer`): React UI without Node.js, file-system, child-process, database, or provider access.
- **Shared** (`src/shared`): serializable contracts and the logging interface used across process boundaries.

The BrowserWindow baseline is `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `webSecurity: true`. New privileged operations require a named IPC contract and Main-side validation.

## Project Structure

```text
src/
  main/       Electron Main process and security policy
  preload/    Minimal contextBridge API
  renderer/   React application shell
  shared/     Cross-process contracts and logging types
tests/
  unit/       Vitest component and security tests
  e2e/        Playwright Electron launch test
docs/         Product, architecture, data, security, and roadmap documents
```

## Local Data

Phase 1 does not create a database or managed paper files. The future default library location is the operating system Documents directory under `PaperMind Library`, as defined in the Phase 0 architecture documents.
