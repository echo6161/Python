# PaperMind Phase 2 Database Schema

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

## Import transaction boundary

1. Validate a regular `.pdf` file, size limit, and `%PDF-` header without modifying it.
2. Copy it to `.tmp` while computing SHA-256, then flush and recheck source size and modification time.
3. Return the existing paper when the hash is already recorded; no second managed copy is created.
4. Atomically link the completed temporary file into its content-addressed destination without overwriting an existing file.
5. Insert `papers` and `paper_files`, then activate the file in one SQLite transaction.
6. Remove temporary or newly created managed files if a later step fails.

Removing a paper uses separate `record-only` and `record-and-managed-file` operations. The latter moves the managed file into the library trash before deleting the database record, allowing the move to be reversed if the database operation fails. Neither option can address or delete the original imported PDF.

## Backup and restore

The database Worker exposes internal `backupTo` and `restoreFrom` methods. Backups use the SQLite backup API. Restore first copies and validates a candidate database, verifies integrity and foreign keys, retains a rollback copy of the active database, then swaps files and reopens the connection. These interfaces are intentionally not exposed to Renderer in Phase 2.
