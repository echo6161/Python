# PaperMind Data Ownership and Source of Truth

- Status: authoritative from Phase 5.5
- Scope: ownership, references, caches, freshness, conflict handling, and deletion

## 1. Data Ownership Matrix

| Data | Owner | PaperMind persistence | Write policy |
| --- | --- | --- | --- |
| Workspace identity and lifecycle | PaperMind | Canonical local record | PaperMind may create and edit |
| Research goals, questions, hypotheses, state | PaperMind | Canonical local records | PaperMind may create and edit with history/provenance |
| Research notes and memory | PaperMind | Canonical local records; optional export links | User or approved bounded tool may edit |
| Reading plan | PaperMind | Canonical local record | User or approved planner may edit |
| Experiment metadata and evidence links | PaperMind | Canonical local records | PaperMind records; external artifacts remain external |
| Research graph relationships | PaperMind | Canonical local edges | Every edge records origin and provenance |
| Bibliographic metadata | Zotero | Stable reference plus optional observed snapshot | Read-only by default; Zotero edits occur through explicit future workflows |
| Source PDF and Zotero attachments | Zotero/user filesystem | Attachment reference; optional bounded cache | Never copy or mutate by default |
| Zotero annotations and collections | Zotero | Stable reference plus optional observed snapshot | Read-only in initial bridge |
| Legacy imported PDF, annotation, collection | PaperMind legacy library | Existing canonical compatibility data | Preserve existing behavior; do not promote to new root model |
| Repository files and history | Git working tree/repository | Repository and revision references; optional derived index | No implicit writes, commits, checkout, or push |
| GitHub collaboration state | GitHub | Stable remote identifiers plus optional observed snapshot | Read-only until an explicitly approved later capability |
| Editing, debug sessions, terminal state | VS Code/OS | Reference or handoff state only | PaperMind does not own or emulate it |
| Long-term personal knowledge | Obsidian/user vault | Export record and note link | Export is explicit and non-overwriting by default |
| AI response | PaperMind as a generated artifact | Content plus provider/model/input-scope provenance | Never treated as verified evidence without user validation |
| API credentials | Operating-system credential store | Only non-secret credential status/identifier | Never store secret material in SQLite, logs, exports, or Renderer |

## 2. Source-of-Truth Matrix

| Question | Authoritative system | PaperMind behavior when data differs |
| --- | --- | --- |
| What is the paper's current title, authors, DOI, or collection? | Zotero for Zotero-linked items | Refresh the observed snapshot; do not overwrite Zotero silently |
| Where is the authoritative PDF? | Zotero attachment record or user-selected external source | Resolve through the adapter; report missing/stale references |
| What annotations exist on a Zotero item? | Zotero | Re-query or mark cached data stale; do not merge by guesswork |
| What is the current code content and history? | Local Git repository at the referenced revision | Resolve the revision; report dirty, missing, or moved state |
| What is the remote collaboration state? | Configured Git remote/GitHub | Refresh on explicit request; cached state is never presented as current |
| What is this research effort trying to answer? | PaperMind Workspace | Read the current goal/question state and its history |
| Why was a conclusion recorded? | PaperMind provenance graph | Follow evidence, experiment, code revision, paper references, and actor records |
| What belongs in the user's long-term knowledge base? | User/Obsidian | Export only after user action; never infer ownership from a generated note |

## 3. External Reference Identity

References use provider-specific stable identifiers, never display names or absolute paths as identity.

- Zotero: `libraryType`, `libraryId`, `itemKey`, and optional `attachmentKey` or `annotationKey`.
- Git: repository identity plus immutable commit OID; branches and tags are mutable locators, not immutable evidence.
- GitHub: host, repository owner/name or stable repository ID, and object ID/number.
- Obsidian: configured vault identity plus normalized vault-relative path; absolute paths remain Main-process configuration.

Every external reference records its provider, external ID, link status, `observedAt`, and optional content/version fingerprint. A display label is a snapshot for usability, not identity.

## 4. Snapshot and Cache Rules

PaperMind may cache externally owned data only when it improves offline display, search, or reproducibility. Each cached record must state:

- source provider and external identifier;
- observation time and, when available, external version/fingerprint;
- whether the value is a snapshot, derived index, or immutable evidence copy;
- refresh status and the last refresh error;
- the Workspace or operation that authorized access.

A snapshot must never be labeled canonical. Stale data remains visible with a stale or unavailable state rather than being silently treated as current. Derived indexes are disposable and rebuildable.

## 5. Conflict and Deletion Rules

- External change wins for externally owned facts. PaperMind preserves its links and reports broken or changed references.
- PaperMind change wins for Workspace-owned facts. Exported copies do not become authoritative unless the user explicitly changes ownership.
- Deleting a Workspace removes PaperMind-owned relationships according to a confirmed policy; it must not delete Zotero items, PDFs, repositories, Git history, GitHub objects, or Obsidian notes.
- Deleting legacy PaperMind library data retains its existing explicit record-only versus managed-file behavior.
- Reference repair is explicit. PaperMind must not relink objects solely by fuzzy title, filename, DOI, or path similarity.

## 6. Phase 6 Zotero Bridge Rules

Phase 6 is read-oriented and additive:

1. Zotero access occurs only in Main through a dedicated adapter and domain service.
2. Renderer receives bounded DTOs through a typed preload API and whitelisted IPC.
3. The bridge uses stable Zotero keys and surfaces connection, permission, version, missing-item, and stale-data states.
4. No Zotero PDF is copied into the legacy managed library by default.
5. No Zotero item is converted into a canonical legacy `papers` row merely to display it.
6. Zotero writes, collection management, duplicate merging, citation editing, and Workspace CRUD are outside Phase 6.

## 7. Phase 7 Workspace Core Rules

1. Workspace identity, name, description, research goal, lifecycle, last-active state, membership time, and display order are PaperMind-owned.
2. A Workspace paper link persists only the complete stable Zotero identity: server/database identity, library type/id, and item key.
3. Zotero metadata and PDF availability are resolved transiently. Phase 7 creates no authoritative Paper row, PDF copy, annotation copy, or metadata cache for a Zotero reference.
4. The same Zotero reference may belong to multiple Workspaces. Removing it from one Workspace does not affect another.
5. `archived` preserves the Workspace and its links. Confirmed delete removes only the Workspace and PaperMind-owned association rows.
6. Missing items, stopped Zotero, and changed server/profile identity remain visible as `missing`, `unavailable`, or `stale_identity`; links are retained for explicit future repair.

## 8. Phase 9 Repository Bridge Rules

1. The local working tree and Git object database own source content and history.
   PaperMind stores only an authorized canonical root, display label, kind,
   Workspace association, and observed diagnostics.
2. Branch, HEAD, remote summary, availability, and observation time are labeled
   snapshots. Refresh may replace those observations but never mutates Git.
3. One `RepositoryRef` may belong to multiple Workspaces. Removing it from one
   Workspace deletes only that association; explicit reference deletion removes
   PaperMind rows only.
4. Source bytes returned to Renderer are bounded, transient read results and are
   not persisted as a PaperMind-owned repository copy or index.
5. Missing, moved, or inaccessible roots retain their references and associations
   with an explicit state. PaperMind does not search the filesystem to guess a
   replacement.
6. VS Code owns editing and execution. PaperMind can only make a user-triggered
   handoff to an already authorized root or file and legal line/column.

## 9. Phase 11 Research Question and Evidence Rules

1. A Research Question and its status, priority, archive state, user note on an
   Evidence link, timestamps, and display order are PaperMind-owned within exactly
   one Workspace.
2. Paper Evidence stores a stable Zotero identity, item version, and optional
   page/text anchor. Code Evidence stores a RepositoryRef, immutable commit/content
   snapshot identity, relative file, optional symbol, lines, and content hash.
3. Current external metadata, PDF content, source content, and snippets are resolved
   transiently and remain owned by Zotero or the repository.
4. External version/snapshot drift marks the historical Evidence stale; missing
   identity, membership, source, or location marks it unavailable. PaperMind does
   not rewrite or fuzzy-repair the recorded reference.
5. Creation requires an exact same-Workspace Zotero/Repository association and, for
   code, an exact trusted index match. Cross-Workspace references are rejected.
6. Archiving preserves a Question. Confirmed deletion removes only the Question and
   its PaperMind-owned Evidence rows; it never deletes external or other Workspace
   data.

## 10. Phase 12 Paper-Code Link Rules

1. A Paper-Code Link is a PaperMind-owned, user-confirmed relationship inside one
   Workspace. Zotero continues to own paper metadata/PDFs and Git or the source
   folder continues to own repository content.
2. Each link pins the complete Zotero server/library/item identity and observed item
   version, plus the repository ID, immutable commit/content snapshot, relative file,
   optional symbol, exact line range, and content hash.
3. Current paper metadata, PDF availability, repository state, and code availability
   are resolved transiently. External changes mark a link stale or unavailable and
   never rewrite its recorded location to the current HEAD.
4. Manual creation requires that both external references belong to the same
   Workspace and that the code location exactly matches the current trusted index.
5. The Renderer cannot assign AI provenance. The current Phase 5 AI assistant is not
   used for matching; no unconfirmed suggestion is stored in `paper_code_links`.
6. Deleting a link deletes only that relationship. It does not delete or modify a
   Zotero item, PDF, annotation, RepositoryRef, Git object, working-tree file, code
   index, Question, Evidence, or legacy Paper record.
