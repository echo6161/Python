# Phase 12 Completion Report

- Phase: 12 - Paper-Code Linking
- Status: implementation complete; live external-source manual verification remains
- Date: 2026-08-11

## Delivered

- Additive `0008` migration, PaperCodeLink repository/gateway/service, Database
  Worker protocol, strict IPC schemas, fixed handlers, and typed preload namespace.
- Stable paper identity and location using Zotero server/library/item/version plus
  page, label, and optional text quote anchor.
- Stable code identity and location using RepositoryRef, commit/content snapshot,
  repository-relative path, optional symbol, exact lines, and content hash.
- Finite `implements`, `corresponds_to`, `extends`, and `uses` relations; manual or
  future user-confirmed AI provenance; optimistic edit and confirmed delete.
- Same-Workspace paper/repository membership checks and exact trusted Phase 10 index
  validation before insertion. Renderer cannot assign provenance.
- Independent paper/code stale and unavailable states. Historical identities and
  locations are retained and never silently moved to current repository content.
- Manual paper -> code search -> line preview -> save workflow, Workspace link list,
  editing/deletion, paper-row Related Code, source-viewer Related Papers, and
  controlled Zotero/VS Code navigation.
- Migration, persistence, restart, isolation, validation, stale, navigation,
  ownership, security-schema, and UI tests using only fakes and temporary fixtures.

## AI candidate decision

The Phase 5 AI gateway supports selected-text translation, explanation, and chat. It
does not expose a Workspace-scoped, repository-index-aware, typed code-match contract.
Phase 12 therefore does not adapt it for suggestions. No unconfirmed suggestion is
written to `paper_code_links`, and Renderer cannot claim `ai_proposed_confirmed`
provenance. An AI candidate workflow requires a later explicit design with transient
proposal IDs, bounded source scope, reason/citation output, and confirm/reject tests.

## Ownership and deletion

Zotero remains authoritative for bibliography/PDFs and Git/source folders remain
authoritative for code. PaperMind stores only the user-confirmed relationship and
provenance. Deleting a link removes one PaperMind row only. Removing or deleting a
PaperMind RepositoryRef preserves a historical link as unavailable; it never modifies
the repository. Legacy Paper/PDF, Question, and Evidence data are unchanged.

## Validation evidence

- `npm run format:check`: passed.
- `npm run lint`: passed with zero warnings.
- `npm run typecheck`: passed for Main, Renderer, and tests.
- `npm run test`: passed, 44 files and 182 tests.
- `npm run build`: passed; Vite reports the existing large-chunk performance warning.
- `npm run test:e2e`: passed, 6 Electron workflows.
- Phase 12 integration tests cover create/update/delete, filters, restart, both
  navigation directions, cross-Workspace rejection, stale snapshots, missing
  sources, invalid lines, and preservation of external references.
- Phase 12 UI tests cover manual search/preview/save, edit/delete, stale display,
  source navigation, and Related Papers in the source viewer.

## Remaining manual verification

The automated suite does not depend on a user's real Zotero library or repository.
A live user-environment pass remains: open Zotero, link an indexed repository, create
a paper/page to code/line link, navigate both ways, change repository content/HEAD,
refresh, and confirm the stored link becomes stale without changing location. No
real Zotero item, PDF, repository file, or Git state was modified during this phase.

## Known risk

The Renderer entry bundle is 855.84 kB minified and 242.13 kB gzip. This is a Vite
warning, not a build failure, but route/component lazy loading should be handled in a
separate approved optimization phase rather than hiding the warning threshold.
