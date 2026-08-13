# Notes and Research Memory

## Domain boundary

Phase 16 separates three concepts:

- a Research Chat conversation is a local interaction history and never becomes a
  Note or Memory automatically;
- a Workspace Note is user-owned working Markdown with draft, active, or archived
  status;
- a Research Memory entry is an explicitly managed durable claim with draft,
  confirmed, or retired status.

An AI response can create only a separate pending proposal after the user invokes
`Propose Memory` from a Note and supplies a retention reason. The provider receives
the bounded Note plus at most twelve attached source excerpts. It has no tools and
cannot persist domain data. The proposal remains outside the Memory table until the
user previews the original proposal, edits the title/body, and confirms it. Rejecting
the proposal records the audit decision and creates no Memory.

## Trust path

The feature preserves the desktop trust boundary:

`Renderer -> typed preload -> whitelisted IPC -> ResearchMemoryService -> database Worker / AI adapter / export adapter`

Renderer inputs are parsed by finite Zod schemas. They contain Workspace/object
identities, bounded text, finite statuses, a Knowledge chunk ID, or an opaque
Main-generated export preview ID. Renderer cannot submit SQL, a URL, an absolute
path, a Vault path, arbitrary source provenance, or a generic file operation.

All Note, Memory, proposal, reference, and export persistence is performed through
the database Worker. Workspace ownership is rechecked for every operation.
References are created only from an existing Phase 13 Knowledge chunk in the same
Workspace. Navigation resolves the retained provenance through the existing
Knowledge service and reports stale or unavailable sources rather than rewriting
historical locations.

## Persistence and provenance

Migration 0012 is additive and leaves the legacy `notes` table and every Phase
1-15 table unchanged. Notes and Memories store user-created Markdown locally.
Typed references store bounded historical snapshots: title, citation, snippet,
source/snapshot identity, and precise paper/code/question/link provenance. They do
not copy a PDF, repository file, Zotero library, or authoritative external record.

Proposal confirmation is a single database transaction: insert the confirmed
Memory, copy reviewed proposal references, and mark the proposal confirmed. A
crash cannot promote a partial Memory. Optimistic row versions prevent stale edits,
reviews, or status changes from silently overwriting newer local content.

## One-way Markdown and Obsidian export

Export is initiated by a user action. Main opens the system directory picker and
derives a fixed `PaperMind/<safe-title>-<id>.md` path inside the selected Vault.
Renderer never receives or supplies an absolute path. Preview IDs are owner-bound,
single-use, and expire after ten minutes.

The preview shows the full new Markdown and at most 4,000 bytes from an existing
conflicting filename. A conflict always selects a new suffixed filename; Phase 16
never overwrites an existing Vault note. Main canonicalizes the selected root and
the `PaperMind` directory to reject an escaping symlink or junction, rechecks the
directory at confirmation, and opens the final file with exclusive-create mode.
The file is flushed before the export audit is recorded. If writing or audit
persistence fails, the newly created file is removed and existing files remain
untouched.

Export is not synchronization. PaperMind does not read changes back, delete Vault
files, remember an absolute Vault path in SQLite, or claim ownership of the Vault.

## UI behavior

At 1536 x 1024, the Notes page shows a compact item list, Markdown editor, and
sources/properties rail together. Below 1536 CSS pixels, the editor stays mounted
as the primary surface while the list and source rail become explicit drawers.
Closing or reopening a drawer preserves the draft, selected item, and editor scroll
state. Note, confirmed/draft/retired Memory, AI proposal, status, provenance, and
timestamps use text and icon semantics rather than color alone.

The page exposes creation, search, type filtering, save/status changes, explicit
delete, source search/add/remove/navigation, proposal review, and one-way export.
Plans, Agents, Experiments, and bidirectional Obsidian synchronization remain out of
scope.
