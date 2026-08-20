# V1 Performance and Capacity Baseline

Measured on the current Windows test host with deterministic local fixtures. These
are observations, not universal hardware guarantees.

| Fixture | Result |
| --- | --- |
| Code Intelligence: 300 TypeScript files | two observed runs: index 84.3-111.9 ms; symbol search 1.1-1.6 ms; heap delta 2.9-3.1 MiB |
| Research Graph: 200 Questions + 40 Experiments | 281 nodes; 280 edges; projection 9.8 ms; JSON 128.4 KiB; heap delta 0.6 MiB |
| Full Vitest suite | 69 files / 284 tests passed in the final Phase 20 gate |
| Full Electron E2E | 16 workflows passed, including V1 onboarding/Overview/confirmation coverage |

Long-task evidence covers Code/Knowledge progress, cancel/retry/recovery, Research
Chat streaming/cancel/retry, and Agent hung-tool timeout/cancel. Existing hard
limits remain authoritative; large real libraries/repos still require user-scale
measurement before broad performance claims.
