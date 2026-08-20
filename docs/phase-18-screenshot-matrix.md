# Phase 18 Screenshot Matrix

## Fixture

The Playwright fixture creates one Workspace and a disposable two-source
Knowledge index containing one paper-page chunk and one code chunk. It launches
the production Electron build with the deterministic Mock provider. It uses no
real Zotero Library, repository, credential, paid API, network, user document,
or private Vault.

## Matrix

| Viewport/state | Artifact | Steps and conclusion |
| --- | --- | --- |
| 1536 x 1024, completed multi-source run | `screenshots/phase-18/agent-complete-1536x1024.png` | Goal, completion, answer, citations, uncertainty, budgets, bounded trace, sources, and pending proposal are visible together. |
| 1280 x 800, completed multi-source run | `screenshots/phase-18/agent-complete-1280x800.png` | Answer and inspector remain simultaneously usable; long trace scrolls only inside its own region. |
| 1024 x 768, completed multi-source run | `screenshots/phase-18/agent-complete-1024x768.png` | Inspector becomes a right drawer while the goal and answer context remain behind it. |
| 1280 x 800, running | `screenshots/phase-18/agent-running-1280x800.png` | Current step, actual context usage, fixed limits, cancel action, and completed tool summaries are visible. |
| 1280 x 800, cancelled | `screenshots/phase-18/agent-cancelled-1280x800.png` | Text and icon identify cancellation and the terminal reason; no proposal or citation is fabricated. |
| 1280 x 800, proposal review | `screenshots/phase-18/agent-proposal-review-1280x800.png` | The dialog states that it is unconfirmed and offers Reject or Send to Memory review. |

The E2E test asserts no page-level horizontal overflow and verifies that
forwarding creates one pending Memory proposal while canonical Memory remains
empty.
