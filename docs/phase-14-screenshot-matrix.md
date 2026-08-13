# Phase 14 Screenshot Matrix

## Fixture and steps

The Playwright test `renders responsive Research Chat with bounded paper and code
citations` creates a temporary Workspace and applies migration 0010. It inserts
the fixed Phase 13 paper-page and code-range fixture, then uses the deterministic
Mock Provider. It contains no real Zotero Library, PDF, repository, credential,
network request, or paid API call.

Steps: launch Electron -> create Workspace -> seed the derived Knowledge index ->
open Chat -> select paper/code scopes -> ask a question -> review both sources ->
send -> capture streaming -> verify bound `S1`/`S2` citations -> resize and capture.
The test asserts `scrollWidth <= clientWidth` and verifies the compact media query
at each standard viewport.

## Matrix

| Viewport/state | Artifact | Check conclusion |
| --- | --- | --- |
| 1536x1024 complete | [research-chat-complete-1536x1024.png](./screenshots/phase-14/research-chat-complete-1536x1024.png) | Workspace scope, question, answer, paper/code citations, source rail, scope controls, and composer remain simultaneously visible. |
| 1280x800 complete | [research-chat-complete-1280x800.png](./screenshots/phase-14/research-chat-complete-1280x800.png) | Answer, both citations, bounded source summaries, and composer fit without page overflow or clipping. |
| 1024x768 complete | [research-chat-complete-1024x768.png](./screenshots/phase-14/research-chat-complete-1024x768.png) | Source rail is closed as a drawer; answer, citations, scope, and composer remain usable with no horizontal scroll. |
| 1280x800 streaming | [research-chat-streaming-1280x800.png](./screenshots/phase-14/research-chat-streaming-1280x800.png) | Streaming status, retained sent-source context, and explicit Cancel are visible without displacing the composer. |

The screenshots document hierarchy and density. Behavioral E2E assertions remain
the source of truth.
