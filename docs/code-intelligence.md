# Code Intelligence

## Scope and ownership

Phase 10 builds a disposable, local static index for repositories explicitly
authorized through the Phase 9 Repository Bridge. Git or the source folder remains
authoritative. PaperMind never writes repository files or Git state, and no LLM,
embedding, vector index, Paper-Code Link, or Agent participates in this subsystem.

The enforced path is:

```text
Renderer CodeSearchPanel
  -> typed preload codeIntelligence methods
  -> fixed, schema-validated IPC channels
  -> Main CodeIntelligenceService
  -> CodeIndexScanner + CodeParserClient worker
  -> Database Worker CodeIndexRepository
```

The scanner reuses `RepositoryFileService`, including canonical-root containment,
symlink refusal, Git ignore rules, sensitive-file exclusions, binary/encoding
checks, and the one-MiB per-file viewer limit. The Renderer supplies only a stored
repository UUID, bounded query/pagination, a UUID request ID, and a fixed operation
mode. It cannot supply a root, arbitrary path, URL, host, executable, shell, Git
arguments, SQL, parser, or index location.

## Parser decision

Phase 10 uses exact versions `@lezer/python@1.1.19` and
`@lezer/javascript@1.5.4`; the JavaScript grammar's TypeScript dialect handles
TypeScript. Both are pure JavaScript and MIT licensed. The installed direct package
sizes are 134,011 and 326,227 bytes; shared `@lezer/common` and `@lezer/lr` add
413,316 bytes in this installation.

This was selected over `tree-sitter`/`web-tree-sitter` for the first supported
language set because it avoids native Electron ABI rebuilds and a WASM grammar
packaging path. The tradeoff is a smaller syntax-tree API rather than a full
compiler semantic model. The upstream GitHub Lezer JavaScript repository was
archived in April 2026 and moved to the maintainer's forge, so upstream maintenance
and releases must be reviewed before upgrades. The abstraction is intentionally
limited to parser input/output DTOs so a later parser can replace it without a
schema rewrite.

Verified structural support is limited to Python, JavaScript, and TypeScript:
module, class, function, method, interface/type, and applicable import/export
symbols. `.go`, `.java`, and `.rs` receive explicit line-based fallback indexing
and are reported as `unsupported`; other extensions are not indexed. Any syntax
error in a supported file uses the same fallback rather than failing the repository.

## Identity and invalidation

Every indexed file, symbol, and chunk stores repository ID, snapshot identity,
repository-relative path, line range, SHA-256 content hash, and parser version.
Symbols additionally store kind/name; files store parse mode; chunks contain at
most 80 source lines and 65,536 characters.

- Clean Git tree: `git:<HEAD>`.
- Dirty Git tree: `dirty:<HEAD-or-unborn>:<manifest-sha256>`.
- Source folder: `content:<manifest-sha256>`.

The manifest hash is derived from sorted relative paths and decoded-content hashes.
Changing the current identity or parser version marks existing results `stale`;
old line locations are never silently presented as current. Index state is restored
after restart. An interrupted `indexing` state becomes `cancelled` and can be
retried or rebuilt.

## Incremental lifecycle

Each explicit update builds a bounded current manifest, compares it with persisted
file hashes, parses only added or changed files, removes deleted/renamed old paths,
and advances unchanged records to the new snapshot. All derived-row replacement,
FTS trigger updates, counts, and final state are one SQLite transaction. Rebuild
deletes only derived index rows for that RepositoryRef and recreates them.

The parser runs in a Worker with a 256 MiB old-generation memory limit and a
120-second timeout. Discovery, parsing, and saving progress is sender-scoped.
Cancellation terminates the parser worker and leaves the last completed index
available with an explicit cancelled state. A failed or cancelled partial index is
never promoted to ready.

## Search and limits

`searchFiles`, `searchSymbols`, and SQLite FTS5-backed `searchText` return at most
50 results per page. Queries are 1-200 characters. Results include repository,
snapshot, file, symbol when applicable, line range, content hash, stale flag, and a
snippet capped at 400 characters. UI results navigate through the authorized Phase
9 source viewer or its validated VS Code file/line handoff.

Current hard limits per indexing job:

- 2,000 directories.
- 2,000 eligible source files.
- 25 MiB decoded eligible source content.
- One MiB per source file through the Repository Bridge.
- 256 MiB parser Worker old-generation heap.
- 120 seconds per parser Worker batch.

These are safety ceilings, not performance targets. There is no startup rebuild or
filesystem watcher; status inspection marks drift stale and indexing remains an
explicit user action.

## Recorded fixture measurement

On 2026-08-11 in the current Windows development environment, the repeatable
integration fixture generated 300 TypeScript files with one function each. One run
recorded 91.8 ms for parse plus transactional index creation, 1.1 ms for exact
symbol search, and a 1.0 MiB test-process heap delta. Vitest reported 139 ms for the
whole benchmark case. This synthetic observation varies by machine and is not an
SLA; it exists to make future regressions comparable on the same environment.

## Rebuildability and deletion

Migration `0006` is additive and stores only derived code data under a
`repository_references` foreign key. Deleting a PaperMind RepositoryRef cascades
only its PaperMind-owned index and associations. It does not touch the authorized
directory. Legacy Paper/PDF, Workspace, Zotero, and Repository Bridge data is not
migrated or removed.
