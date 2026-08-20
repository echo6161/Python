# PaperMind Phase 10 Database Schema

> This document describes the implemented Phase 1-5 compatibility schema. It is
> runtime truth, not the Phase 5.5 target domain model. The current `papers` root
> and managed PDF store must remain readable, but new Workspace/Zotero work must
> follow [data-ownership.md](./data-ownership.md) and use additive forward
> migrations. Zotero-owned PDFs and metadata are not copied here by default.

## Runtime location

The default library is created automatically at the operating system Documents directory under `PaperMind Library`.

```text
PaperMind Library/
├── library.sqlite3
├── papers/<sha256-prefix>/<sha256>.pdf
├── backups/library-<timestamp>.sqlite3
├── trash/<paper-id>/
├── .tmp/
└── .papermind-library.json
```

Only relative managed paths are stored in SQLite. Original PDF paths are not persisted, and source files are opened read-only during import.

## Migration mechanism

Migrations live in `src/main/database/migrations` and are applied in ascending numeric order. The `schema_migrations` table stores each version, name, application timestamp, and SHA-256 checksum. Startup refuses unknown versions or checksum drift, while reapplying an existing migration is a no-op.

Every connection enables:

- `foreign_keys = ON`
- `journal_mode = WAL`
- `busy_timeout = 5000`
- `synchronous = NORMAL`

SQLite is loaded only by the dedicated database Worker. Main services communicate with it through typed worker messages; preload and Renderer never load the driver or execute SQL.

## Initial schema

Migration `0001-initial` creates:

| Entity | SQLite table | Relationship and integrity notes |
| --- | --- | --- |
| Paper | `papers` | UUID primary key, lifecycle/status checks, optimistic `row_version` |
| Managed paper file | `paper_files` | One paper to many files; unique SHA-256 and managed relative path |
| Author | `authors` | Optional unique ORCID |
| PaperAuthor | `paper_authors` | Ordered many-to-many relationship |
| Collection | `collections` | Flat collections for the first release |
| Collection membership | `collection_papers` | Many-to-many relationship |
| Tag | `tags` | Unique normalized name |
| PaperTag | `paper_tags` | Many-to-many relationship |
| Annotation | `annotations` | Anchored to both paper and immutable file version |
| Note | `notes` | User/AI origin and optimistic row version |
| Setting | `settings` | Non-secret JSON settings only |
| AiConversation | `ai_conversations` | Paper-scoped conversation metadata; no credentials |
| AiMessage | `ai_messages` | Conversation messages and usage metadata; no raw provider response |

Supporting triggers ensure a paper's active file belongs to that same paper. Foreign-key cascades remove dependent join rows, annotations, notes, and AI records when a paper record is explicitly removed.

## Reader migration

Migration `0002-reader-annotations-and-state` evolves the Phase 2 annotation skeleton and adds:

| Entity | SQLite table | Relationship and integrity notes |
| --- | --- | --- |
| Annotation | `annotations` | Highlight/underline type, fixed color set, optional comment, exact/prefix/suffix quote anchor, 1-based page, character span JSON, normalized rectangle JSON, soft deletion, optimistic `row_version` |
| Reading state | `reading_states` | One row per paper with 1-based current page, numeric scale, and update timestamp |

An annotation is bound to both `paper_id` and the immutable active `paper_file_id`. Triggers reject a file that does not belong to the same paper. Geometry is never the only anchor: `exact_text`, prefix/suffix context, and page character offsets remain available for validation and future re-anchoring. JSON validity and numeric/page constraints are enforced by SQLite, while IPC schemas impose tighter payload and rectangle limits.

## Metadata and organization migration

Migration `0003-metadata-organization.ts` (`paper-metadata-organization-and-search`) adds:

| Entity or field | SQLite representation | Integrity notes |
| --- | --- | --- |
| Reading status | `papers.reading_status` | Independent from import lifecycle; unread/reading/completed/shelved |
| Favorite | `papers.is_favorite` | Constrained boolean integer |
| Review state | `papers.metadata_review_status` | Extracted values remain pending until an explicit user save |
| Field provenance | `paper_metadata_fields` | One row per paper and title/authors/abstract/year/DOI field; JSON value, source, confidence, and user-edited flag |
| Extracted pages | `document_pages` | Immutable file ID, 1-based page, normalized text, content hash, and extractor version |
| Full-text filter | `paper_full_text` | Local SQLite FTS5 index with one bounded row per page; stores text only and has no embedding or RAG behavior |

Standard PDF Metadata has priority over cautious first-page candidates. A filename may supply an internal display label only when no title evidence exists; its field source is `filename` with `unconfirmed` confidence, and the UI displays a pending-confirmation state. No author is inferred from a filename. DOI candidates are normalized syntactically and retain their source/confidence without any network lookup. A DOI reaches the canonical unique `papers.doi` field only after user confirmation.

An explicit details save replaces the ordered author relationship, marks the five extracted fields `manual/confirmed/user_edited`, and updates organization links in one transaction. There is no background metadata refresh path in Phase 4, so confirmed user values cannot be silently overwritten. Phase 2/3 imports start at `row_version = 1`, while their explicit metadata editor increments that version. Migration therefore keeps untouched version-1 titles as `filename/unconfirmed/pending` with empty fields marked `none`, and conservatively preserves version-greater-than-1 fields supported by that editor as `manual/confirmed/user_edited`. The older editor did not support authors, so legacy author links remain `legacy/unconfirmed` and empty author lists remain `none/unconfirmed`. The application rebuilds only the pending page-text/FTS index and never replaces those values.

Production extraction runs in a dedicated one-shot Worker with a 120-second timeout and a V8 heap limit. Output is bounded to 2,000 pages, 200,000 characters per page, and 20,000,000 characters per document. Reaching a limit produces `partial` status and a visible warning rather than silently claiming complete extraction. The existing 1 GB import limit remains unchanged; PDFs larger than 256 MB are still imported as managed copies but skip metadata/text extraction with an explicit warning to bound Worker memory.

Tags and flat collections continue to use the Phase 2 join tables. Phase 4 adds transaction-backed create/delete, assignment, filtering, and bounded batch operations. Batch updates validate every paper and tag before writing, then either update the whole selection or roll back.

## AI conversation activation

Phase 5 activates the existing `settings`, `ai_conversations`, and `ai_messages` tables, so it requires no schema migration. Non-secret OpenAI settings use the fixed `ai.openai.config.v1` key. Each saved turn atomically creates a complete user message and a streaming assistant placeholder; completion, cancellation, failure, usage counts, and the provider request ID are finalized through the Database Worker. Startup marks interrupted streaming placeholders as failed without making an old conversation appear newly updated.

Phase 6 adds no tables, settings, caches, or migrations. Zotero remains the bibliographic source of truth, and the read-only bridge returns transient reference DTOs directly from the Local API. Existing Paper/PDF rows and managed files remain unchanged and continue to coexist as the legacy compatibility library.

## Workspace core migration

Migration `0004-workspace-core.ts` is additive and creates:

| Entity | SQLite table | Relationship and integrity notes |
| --- | --- | --- |
| Workspace | `workspaces` | UUID, bounded name/description/research goal, active/paused/archived status, timestamps, optimistic row version |
| Zotero stable reference | `zotero_item_references` | Unique server identity + library type/id + item key; no bibliographic metadata or file path |
| Workspace membership | `workspace_zotero_items` | Many-to-many join with PaperMind-owned added timestamp and stable per-Workspace order |
| Last active state | `workspace_state` | Singleton row; foreign key uses `ON DELETE SET NULL` |

Deleting a Workspace cascades only through `workspace_zotero_items`. It does not
delete a stable reference row, a Zotero object, a Zotero attachment/PDF, or any
legacy Paper/PDF/annotation/collection row. Archiving does not delete any row.
The reference's `server_id` partitions identities from different Zotero
profiles/databases, so equal library IDs and item keys from different identities
cannot be conflated. Zotero metadata is resolved through the read-only bridge at
request time and is not stored by this migration.

## Repository Bridge migration

Migration `0005-repository-bridge.ts` is forward-only and creates:

| Entity | SQLite table | Relationship and integrity notes |
| --- | --- | --- |
| Repository reference | `repository_references` | UUID, unique canonical-key partition, canonical authorized root, Git/source-folder kind, observed branch/HEAD/sanitized remotes, availability, timestamps, optimistic row version |
| Workspace membership | `workspace_repositories` | Many-to-many join with PaperMind-owned added timestamp and display order |

The canonical root is selected through Main's native directory picker and is
never accepted from Renderer. Branch, HEAD, remotes, and availability are
observed diagnostics rather than copied Git authority. Deleting a Workspace
cascades only its membership rows. Removing a membership or explicitly deleting
a Repository reference never deletes or modifies a local directory, source file,
Git ref, object, or working-tree entry. It deletes only the reference's rebuildable
PaperMind code index. Existing legacy Paper/PDF,
Zotero-reference, annotation, and Workspace records are not migrated or removed.

## Code Intelligence migration

Migration `0006-code-intelligence.ts` is forward-only and creates:

| Entity | SQLite table | Relationship and integrity notes |
| --- | --- | --- |
| Index lifecycle | `code_index_states` | One crash-safe state per RepositoryRef; active request, parser/snapshot identity, progress, counts, safe error, and timestamps |
| Indexed file | `code_index_files` | Unique repository-relative path with language, snapshot/content hash, parser version, parse mode, size, and line count |
| Code symbol | `code_index_symbols` | Repository/file-bound module/class/function/method/interface/type/import/export with stable line range and hashes |
| Search chunk | `code_index_chunks` | Optional symbol binding, bounded line range/content, snapshot/content hash, and parser version |
| Full-text search | `code_index_text_fts` | Trigger-maintained FTS5 projection of rebuildable source chunks |

All index tables are derived, local, and subordinate to `repository_references`.
Deleting a RepositoryRef cascades these rows but never addresses the authorized
filesystem root. An incremental completion replaces changed/deleted paths, advances
unchanged snapshot identities, updates FTS, counts, and lifecycle state in one
transaction. A cancelled, failed, or interrupted task never promotes partial rows
to ready. See [code-intelligence.md](./code-intelligence.md) for parser versions,
snapshot rules, stale behavior, query bounds, and resource ceilings.

## Research Question and Evidence migration

Migration `0007-research-questions-evidence.ts` is forward-only and creates:

| Entity | SQLite table | Relationship and integrity notes |
| --- | --- | --- |
| Research Question | `research_questions` | Workspace-bound UUID, bounded title/description, research status, priority, independent archive timestamp, timestamps, and optimistic row version |
| Typed Evidence | `question_evidence` | Composite Question/Workspace foreign key, stable sort order, user note, source snapshot identity, and an exclusive Zotero-paper or code-location payload |

Zotero Evidence stores only stable server/library/item identity, observed item
version, and optional bounded page/text anchor. Code Evidence stores only a
RepositoryRef ID, indexed snapshot identity, repository-relative path, optional
symbol, line range, and content hash. Current Zotero metadata, PDF bytes, repository
files, and code snippets are not copied into these tables.

Deleting a Question cascades only its Evidence. Deleting a Workspace cascades its
Questions through the Workspace foreign key. The code evidence repository ID is not
a destructive foreign key: deleting a PaperMind RepositoryRef preserves the
historical Evidence row, which resolves as unavailable. See
[research-questions-evidence.md](./research-questions-evidence.md) for provenance,
stale, navigation, and security semantics.

## Paper-Code Link migration

Migration `0008-paper-code-links.ts` is forward-only and creates:

| Entity | SQLite table | Relationship and integrity notes |
| --- | --- | --- |
| Paper-Code Link | `paper_code_links` | Workspace-bound UUID; complete Zotero identity/version and paper anchor; RepositoryRef plus immutable code snapshot/path/symbol/lines/hash; finite relation/provenance values; timestamps and optimistic row version |

The table stores stable identifiers, precise locations, the user's label/description,
and confirmation provenance. It does not store Zotero metadata, PDF bytes, source
bytes, snippets, AI suggestions, or an inferred current location. Creation checks
both Workspace memberships and an exact Phase 10 index location in one database
transaction. Workspace deletion cascades only PaperMind-owned links. Removing a
Workspace repository association or deleting its PaperMind RepositoryRef preserves
the historical link, which resolves as unavailable. See
[paper-code-links.md](./paper-code-links.md).

## Research Knowledge Engine migration

Migration `0009-knowledge-engine.ts` is forward-only and creates:

| Entity | SQLite table | Relationship and integrity notes |
| --- | --- | --- |
| Index lifecycle | `knowledge_index_states` | One crash-safe, versioned status per Workspace with progress, provider identity, counts, bounded error, and timestamps |
| Derived source | `knowledge_sources` | Workspace/type/stable-identity unique row with snapshot, SHA-256 fingerprint, source-level provenance, availability, and index time |
| Derived chunk | `knowledge_chunks` | Source/Workspace-bound bounded text, SHA-256, exact citation and chunk-level provenance, plus optional provider vector |
| Keyword search | `knowledge_chunks_fts` | Trigger-maintained FTS5 projection filtered by Workspace and finite source type |

The migration does not alter or remove Phase 1-12 tables. Deleting a Workspace
cascades its derived Knowledge rows. Removing or rebuilding the index never deletes
a Zotero item/PDF, repository/source file, Question, Evidence, Paper-Code Link, or
legacy Paper. See [research-knowledge-engine.md](./research-knowledge-engine.md).

## Research Chat migration

Migration `0010-research-chat.ts` is forward-only and creates:

| Entity | SQLite table | Relationship and integrity notes |
| --- | --- | --- |
| Workspace conversation | `research_chat_conversations` | Workspace-bound, optional Question-bound conversation with fixed provider/model identity and timestamps |
| Message | `research_chat_messages` | User/assistant content, streaming terminal state, bounded safe error, provider accounting, and retry lineage |
| Turn context audit | `research_chat_contexts` | Exact query, finite scope, retrieval version/mode, budget, deduplication/truncation counts, and timestamp for one assistant attempt |
| Sent source snapshot | `research_chat_context_sources` | Ordered `S1`-style alias, Phase 13 chunk ID, bounded snippet/citation, score, stale state, and exact provenance sent for that attempt |

The tables are separate from legacy paper-scoped AI conversations. The bounded
source rows are historical request snapshots for audit and retry, not current
Zotero/Git authority. Workspace deletion cascades only PaperMind-owned chat data.
No API key, provider credential, PDF, repository file, tool call, or automatic
Question/Link/Plan/Memory write is stored. See
[research-chat-context-builder.md](./research-chat-context-builder.md).

Migration `0011-ai-provider-selection.ts` adds the constrained
`generation_provider_id` column to Workspace conversations. It defaults existing
rows to `openai` and records `openai` or `codex` for new turns without rebuilding
the parent table or disturbing message/context foreign keys. Credentials and
account identity remain outside SQLite.

## Notes and Research Memory migration

Migration `0012-notes-research-memory.ts` is forward-only and creates:

| Entity | SQLite table | Relationship and integrity notes |
| --- | --- | --- |
| Workspace Note | `workspace_notes` | Workspace-bound user-authored Markdown with finite draft/active/archived status, timestamps, and optimistic row version |
| Research Memory | `research_memory_entries` | Workspace-bound durable Markdown with draft/confirmed/retired status, manual or confirmed-AI provenance, confirmation time, and optimistic row version |
| AI proposal | `research_memory_proposals` | Separate pending/confirmed/rejected review record with source Note, user reason, provider/model, review time, and confirmed Memory link |
| Typed reference | `research_memory_references` | Exactly one Note, Memory, or proposal owner; bounded source snapshot copied from a Workspace Knowledge chunk; finite paper/code/question/link type and display order |
| Export audit | `research_memory_exports` | PaperMind owner, Vault display name, relative generated path, SHA-256 content hash, and export time; no absolute path or Vault content |

Pending proposals are not Memory entries. Confirmation creates the durable Memory,
copies the reviewed bounded source snapshots, and marks the proposal confirmed in
one transaction. Rejecting a proposal creates no Memory. Deleting a Note or Memory
cascades only its PaperMind-owned references; it never deletes a Zotero item/PDF,
Git repository/file, Question, Evidence, Link, Knowledge source, or exported file.
The legacy Phase 1-5 `notes` table remains unchanged. See
[notes-research-memory.md](./notes-research-memory.md).

Conversation text is local plaintext content and may include a user-approved selected excerpt. A per-request opt-out keeps that turn entirely in memory. API keys and encrypted credential blobs are never accepted by this repository and are stored outside the library through the Main-process Secret Store.

## Import transaction boundary

1. Validate a regular `.pdf` file, size limit, and `%PDF-` header without modifying it.
2. Copy it to `.tmp` while computing SHA-256, then flush and recheck source size and modification time.
3. Return the existing paper when the hash is already recorded; no second managed copy is created.
4. Extract local PDF Metadata and bounded page text from the staged copy in the metadata Worker. Extraction failures produce an explicit warning rather than invented values.
5. Atomically link the completed temporary file into its content-addressed destination without overwriting an existing file.
6. Insert `papers`, `paper_files`, provenance, page text, and per-page FTS content, then activate the file in one SQLite transaction.
7. Remove temporary or newly created managed files if a later step fails.

Removing a paper uses separate `record-only` and `record-and-managed-file` operations. The latter moves the managed file into the library trash before deleting the database record, allowing the move to be reversed if the database operation fails. Neither option can address or delete the original imported PDF.

## Backup and restore

The database Worker exposes internal `backupTo` and `restoreFrom` methods. Backups use the SQLite backup API. Restore first copies and validates a candidate database, verifies integrity and foreign keys, retains a rollback copy of the active database, then swaps files and reopens the connection. These interfaces are intentionally not exposed to Renderer in Phase 2.
# Phase 17 Adaptive Research Plan

Migration `0013-adaptive-research-plan` adds:

- `research_plans`: Workspace plan goal, active/retired state, optimistic row
  version, and canonical history version.
- `plan_tasks`: ordered todo/in-progress/blocked/done/retired actions.
- `plan_task_dependencies`: bounded many-to-many task dependencies.
- `plan_references`: typed paper/repository/question/memory references with an
  observed snapshot identity; external records are not foreign-key deleted.
- `plan_completion_evidence`: immutable reference snapshots and the user's
  completion note.
- `research_plan_history`: versioned full snapshots and user/AI-confirmed actor.
- `research_plan_proposals`: pending/confirmed/rejected Generate or Adapt output;
  pending proposal data is separate from canonical Plan tasks.

One active Plan is allowed per Workspace through a partial unique index. Retired
Plans remain queryable until the user explicitly confirms deletion.

## Phase 18 Research Agent

Migration `0014-research-agent.ts` adds:

| Entity | SQLite table | Relationship and integrity notes |
| --- | --- | --- |
| Agent run | `research_agent_runs` | Workspace goal, provider/model, fixed budgets, usage, answer, uncertainty, terminal reason, bounded safe error, and timestamps |
| Audit step | `research_agent_trace_steps` | Ordered finite tool name, terminal status, bounded redacted summaries, safe error, and timing |
| Citation | `research_agent_citations` | Exact run alias, Workspace Knowledge chunk, bounded snippet/citation, stale state, and provenance snapshot |
| Agent proposal | `research_agent_proposals` | Separate pending/accepted/rejected typed Memory candidate and downstream pending Memory proposal ID |

Workspace deletion cascades only PaperMind-owned Agent audit rows. No credential,
token, absolute path, complete PDF page, repository file, external write, or
canonical Memory is stored. See [research-agent.md](./research-agent.md).
