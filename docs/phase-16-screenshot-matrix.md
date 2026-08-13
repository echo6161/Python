# Phase 16 Screenshot Matrix

## Fixture

The committed screenshots are produced by
`tests/e2e/research-memory.spec.ts` with an isolated temporary database, a confirmed
Memory, a working Note, bounded paper and code reference snapshots, the deterministic
Mock Provider, and a temporary fake Vault. They contain no real Zotero library,
repository content, conversation, credential, or private Vault path.

## Matrix

| Viewport/state | Artifact | Steps and checks |
| --- | --- | --- |
| 1536 x 1024, populated Memory | `screenshots/phase-16/notes-memory-1536x1024.png` | Open Notes, select confirmed Memory. List, editor, type/status, save/export actions, paper/code sources, and provenance rail are simultaneously scannable; no page-level horizontal scroll. |
| 1280 x 800, populated Memory | `screenshots/phase-16/notes-memory-1280x800.png` | Keep editor selected and open Sources drawer. Editor remains primary, references and navigation remain reachable, list is folded, and content is not clipped. |
| 1024 x 768, populated Memory | `screenshots/phase-16/notes-memory-1024x768.png` | Repeat the source review at minimum desktop width. Draft state and selected item stay mounted while the rail is a dismissible drawer; no page-level horizontal scroll. |
| 1280 x 800, AI proposal review | `screenshots/phase-16/proposal-diff-confirm-1280x800.png` | Invoke Mock AI from the working Note, preview proposed snapshot beside editable confirmation, then explicitly confirm. Dialog stays inside the viewport and reject is visually secondary. |

The same E2E flow edits the confirmed Memory, performs a user-approved one-way
export into a temporary Vault, restarts Electron, verifies selection/draft recovery,
and checks the exported Markdown. Screenshot creation is deterministic and does not
depend on network access or a paid provider.
