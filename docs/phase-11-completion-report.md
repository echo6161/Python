# Phase 11 Completion Report

- Phase: 11 - Research Questions & Evidence
- Status: implementation complete; final quality evidence is recorded below
- Date: 2026-08-11

## Delivered

- Additive `0007` migration, Question repository/service, Database Worker gateway,
  typed shared contracts, bounded schemas, fixed IPC handlers, and minimal preload.
- Workspace-isolated Question CRUD with explicit research status, priority,
  independent archive/restore, optimistic concurrency, confirmed delete, and restart
  persistence.
- Typed Zotero paper/page/text-anchor and repository snapshot/file/symbol/line
  Evidence with user note, provenance identity, ordering, add/remove, and navigation.
- Runtime stale/unavailable resolution that preserves historical source identity and
  never silently updates an Evidence location.
- Workspace Questions list/detail UI, paper and indexed-symbol pickers, source/status
  distinction, lifecycle controls, empty/loading/error states, reordering, removal,
  and user-triggered navigation.
- Migration, domain, persistence, isolation, security schema, stale/unavailable,
  navigation, and UI tests independent of a real Zotero library or user repository.

## Ownership and non-goals

Zotero owns bibliography/PDFs and Git/source folders own code. PaperMind owns only
Questions, Evidence links, notes, lifecycle, and ordering. Phase 11 does not copy
external content, write Zotero or repositories, create a generic graph, invoke AI,
or add Note, Experiment, Memory, RAG, embedding, or Agent features. Legacy Paper/PDF
and all Phase 6-10 data remain compatible and are not destructively migrated.

## Validation summary

- `npm run format:check`, `npm run lint`, and `npm run typecheck` passed.
- Full Vitest passed: 41 files and 174 tests.
- Production build passed. Vite retains the existing bundle-size warning.
- Electron E2E passed: 6 workflows, including Question creation, restart restore,
  status update, Workspace archive/delete, and existing legacy/integration flows.
- Workspace screenshots at the default viewport and 1100 by 680 were inspected;
  the Question list/detail/Evidence layout had no horizontal overflow or incoherent
  overlap.
- Unpacked packaging was not completed: `electron-builder` built the application,
  then its external Windows helper download timed out twice (about two and five
  minutes) without producing `release`. The spawned download processes were stopped.
- No credential-shaped content, user PDF, SQLite database, dependency directory, or
  generated build output was added to Git. `dist` and `node_modules` remain ignored.
- A real user Zotero item and local repository were not modified for manual Evidence
  creation. Their behavior is covered by fake-service, trusted-index fixture, IPC,
  and Electron UI tests; live external-source verification remains manual.
