# Phase 17 Screenshot Matrix

## Fixture

The Playwright fixture creates one local Workspace and one active Plan with four
tasks: two `done`, one `in_progress`, and one explicitly `blocked`. It adds
dependencies and completion notes through the real database layer, then launches
the production Electron build with the deterministic Mock AI provider. No real
Zotero library, repository, network, paid API, or private data is used.

## Matrix

| Viewport/state | Artifact | Steps and conclusion |
| --- | --- | --- |
| 1536 x 1024, populated Plan | `screenshots/phase-17/research-plan-1536x1024.png` | Open Plan and select the in-progress task. Goal, transparent progress, next action, blocked count, task sequence, status, dependencies, sources, completion action, and history entry point are visible together. |
| 1280 x 800, populated Plan | `screenshots/phase-17/research-plan-1280x800.png` | Repeat the same task workflow. Task list and dismissible detail drawer remain usable without page-level horizontal scrolling. |
| 1024 x 768, populated Plan | `screenshots/phase-17/research-plan-1024x768.png` | Select the in-progress task. Detail becomes a right drawer while next action and the task sequence remain in context; status and blocked reason stay visible and there is no page-level horizontal scroll. |
| 1280 x 800, Adapt proposal | `screenshots/phase-17/adapt-proposal-diff-1280x800.png` | Invoke Adapt with the Mock provider. The pending add change, rationale, editable goal/title/description, preservation rule, Reject, and Confirm are visible inside the viewport. No canonical Plan mutation occurs before Confirm. |

The E2E test asserts `documentElement.scrollWidth <= clientWidth` at all three
standard viewports.
