# Research Questions and Evidence

## Scope and ownership

Phase 11 makes `ResearchQuestion` a PaperMind-owned object beneath one Workspace.
Question title, description, research status, priority, independent archive state,
timestamps, and Evidence ordering are canonical local data. Zotero continues to own
bibliographic items and PDFs; Git or the selected source folder continues to own
code. PaperMind stores typed references and user-authored Evidence notes, not copies
of external documents or source files.

The enforced call path is:

```text
Renderer Workspace Question UI
  -> typed preload question methods
  -> fixed, Zod-validated IPC channels
  -> Main QuestionService
  -> ZoteroBridgeService / CodeIntelligenceService / RepositoryService
  -> Database Worker QuestionRepository
```

The Question API has no generic URL, localhost, protocol, file reader, path reader,
shell, Git, SQL, or IPC invoke method. Zotero protocol URIs are constructed only in
Main from validated stable Zotero references. Code navigation delegates to the
Phase 9 authorized-root resolver before a user-triggered VS Code handoff.

## Question lifecycle

Research status is one of `unresolved`, `investigating`, `blocked`, `understood`, or
`closed`; priority is `low`, `normal`, `high`, or `critical`. Archive is a separate
timestamp, not a status alias. An archived Question remains readable with all
Evidence but is immutable until explicitly restored. Confirmed delete removes only
the Question and its PaperMind-owned Evidence rows. It does not delete a Workspace,
Zotero item/PDF, RepositoryRef, repository file, code index, or legacy Paper data.

All mutations are Workspace-scoped. UUID, length, enum, row-version, exact evidence
membership, and reorder-set validation occur before storage. Optimistic row versions
prevent a stale editor from overwriting a newer Question.

## Typed Evidence

Phase 11 supports exactly two Evidence kinds:

- `zotero_paper`: complete Zotero server/profile, library, and item identity; item
  version; optional 1-based page and bounded exact/prefix/suffix text anchor; user
  note; creation time; and display order.
- `code`: RepositoryRef ID, code-index snapshot identity, repository-relative path,
  language, optional symbol kind/name pair, line range, content hash, user note,
  creation time, and display order.

A Zotero item can be added only when the exact stable reference is already linked to
the same Workspace and resolves through the current Zotero profile. A code location
can be added only when the RepositoryRef is linked to the same Workspace, the index
is currently ready, and the exact snapshot/path/symbol/line/content-hash tuple exists
in the trusted Phase 10 index. Renderer-supplied absolute paths and traversal are
rejected, and database membership is still required after IPC validation.

Live Zotero metadata, PDF state, repository display name, and current snapshot are
resolved for display and are never persisted as authoritative Evidence content.

## Provenance and stale behavior

Evidence records the source identity observed at creation and never silently moves:

- A different Zotero item version marks paper Evidence `stale`; an unavailable item
  or changed/missing Zotero profile marks it `unavailable`.
- A different repository commit/content snapshot marks code Evidence `stale`; a
  removed Workspace association, missing RepositoryRef/root, unreadable snapshot,
  or absent indexed location marks it `unavailable`.
- Historical reference fields and the user's note remain visible in both states.
  Refresh changes only the resolved DTO state, not stored provenance.

Available paper page Evidence opens the primary locally available Zotero PDF through
a Main-owned `zotero://open-pdf` handoff. If an exact page cannot be opened but the
item exists, PaperMind opens the Zotero item and reports that fallback. Stale code
Evidence is not sent to VS Code because its historical line could now point at the
wrong content; the UI reports the reason and requires a new current Evidence link.

## Migration and compatibility

Forward migration `0007-research-questions-evidence` adds `research_questions` and
`question_evidence`. The evidence table is a deliberately typed union rather than a
generic graph/reference table. Its composite Question/Workspace foreign key prevents
cross-Workspace attachment. Question deletion cascades Evidence; external reference
columns intentionally do not cascade external resources.

Legacy Paper/PDF, Workspace/Zotero membership, Repository Bridge, and rebuildable
Code Intelligence tables are unchanged. Phase 11 does not add Note, Experiment,
Memory, graph, RAG, embedding, Agent, or automatic AI-to-Question behavior.
