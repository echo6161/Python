# V1 Screenshot Acceptance

Fixture and interaction details originate in the Phase 13-20 E2E specs. All paths
below are current V1 copies under `docs/screenshots/phase-20/`; every row was
checked against the real implementation, and secrets/private user data are absent.

| Page/state | Fixture and steps | 1536x1024 | 1280x800 | 1024x768 | Status / known difference |
| --- | --- | --- | --- | --- | --- |
| Overview | `v1-readiness.spec.ts`: seed Workspace/question/missing repo/Zotero ref, open Overview | `overview-1536x1024.png` | `overview-1280x800.png` | `overview-1024x768.png` | PASSED; 1024 uses vertical page scroll |
| Knowledge | `app.spec.ts`: seed mixed source chunks, search `clipping`, open provenance | `knowledge-1536x1024.png` | `knowledge-1280x800.png` | `knowledge-1024x768.png` | PASSED; provenance becomes compact detail |
| Research Chat | `app.spec.ts`: review paper/code sources, stream answer, open citations | `research-chat-1536x1024.png` | `research-chat-1280x800.png` | `research-chat-1024x768.png` | PASSED; source rail collapses |
| Notes/Memory | `research-memory.spec.ts`: edit Note, confirm Memory proposal, inspect references | `notes-memory-1536x1024.png` | `notes-memory-1280x800.png` | `notes-memory-1024x768.png` | PASSED; editor remains primary |
| Plan | `research-plan.spec.ts`: manage mixed-status tasks and inspect Adapt state | `plan-1536x1024.png` | `plan-1280x800.png` | `plan-1024x768.png` | PASSED; detail becomes drawer |
| Agent | `research-agent.spec.ts`: run bounded multi-source Agent and inspect trace/proposal | `agent-1536x1024.png` | `agent-1280x800.png` | `agent-1024x768.png` | PASSED; inspector becomes drawer |
| Experiment/Graph | `phase19.spec.ts`: create Experiment chain, rebuild Graph, select/navigate node | `experiment-graph-1536x1024.png` | `experiment-graph-1280x800.png` | `experiment-graph-1024x768.png` | PASSED; graph detail becomes drawer |

Additional required states:

| State | Fixture and steps | Artifact | Status |
| --- | --- | --- | --- |
| onboarding/empty | fresh library, no Workspace | `state-onboarding-empty-1280x800.png` | PASSED |
| loading/long task | fake bounded Agent run while active | `state-long-task-running-1280x800.png` | PASSED |
| error/offline | deterministic provider session unavailable state | `state-error-offline-1280x800.png` | PASSED |
| destructive confirmation | populated Workspace, invoke Delete and keep Cancel focused | `state-destructive-confirmation-1280x800.png` | PASSED |

No automated pixel-diff framework existed and none was introduced. Validation is
stable screenshot generation plus explicit DOM overflow/state assertions and
manual image inspection.
