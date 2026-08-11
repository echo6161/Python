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
