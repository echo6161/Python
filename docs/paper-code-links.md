# Paper-Code Links

## Purpose and ownership

`PaperCodeLink` records a user-confirmed relationship between a precise Zotero paper
location and a precise indexed code location in one Workspace. PaperMind owns the
relationship, label, description, relation type, provenance, and timestamps. Zotero
owns bibliography/PDF content; Git or the authorized source folder owns code.

## Identity and provenance

The paper side stores server/profile identity, library type/id, item key, observed
item version, optional page, location label, and optional exact/prefix/suffix text
anchor. The code side stores RepositoryRef ID, commit/content snapshot identity,
repository-relative file, optional symbol, exact line range, and content hash.

Relations use `implements`, `corresponds_to`, `extends`, or `uses`. Phase 12 creation
is manual, and the service assigns `manual` provenance. `ai_proposed_confirmed` is
reserved in persistence for a future explicitly approved candidate workflow, but it
cannot be submitted by Renderer and no unconfirmed suggestion is stored.

## Creation and validation

1. The user chooses an existing Workspace Zotero paper and optional paper location.
2. The user searches a Workspace repository through Phase 10's bounded file, symbol,
   or text index and selects one current non-stale result.
3. The dialog previews both immutable locations and the user selects a finite
   relation, label, and description.
4. Main rechecks the current index snapshot. The database transaction checks both
   Workspace memberships and the exact indexed location before inserting the link.

Cross-Workspace references, stale indexes, untrusted hashes/symbols, traversal or
absolute paths, invalid ranges, and lines outside an indexed file are rejected.

## Freshness and navigation

Paper and code availability are resolved independently. Zotero item version drift
marks only the paper side stale. Repository snapshot drift marks only the code side
stale. Missing profiles, associations, repositories, or indexed locations are shown
as unavailable. The recorded identities and lines are never silently rewritten.

Paper navigation uses the existing Zotero item/PDF launcher. Code navigation uses
the authorized VS Code handoff only when the recorded code snapshot is current. The
Workspace link list exposes both directions; paper rows show Related Code, and the
source viewer shows Related Papers for the current repository-relative file.

## Deletion and non-goals

Deleting a link requires `DELETE_LINK` and removes only the `paper_code_links` row.
It cannot modify or delete any external source or other PaperMind domain data.
Phase 12 adds no RAG, embedding, Agent, bulk linking, Zotero write, repository write,
or fuzzy location repair.
