# Adaptive Research Plan

## Ownership and boundary

`ResearchPlan`, `PlanTask`, dependency edges, bounded references, completion
evidence, history snapshots, and proposals are PaperMind-owned Workspace data.
Deleting or retiring a Plan never writes to or deletes Zotero items, local
repositories, Research Questions, or confirmed Memory.

References store a stable typed target and the source snapshot observed when the
reference was added. They do not copy full PDFs, source trees, Question bodies,
or Memory bodies. Missing targets remain historical references with an
`unavailable` state. Repository or source version changes produce `stale`, not a
silent relocation.

## Progress and dependency semantics

Progress is deterministic:

```text
eligible = tasks whose status is not retired
completed = eligible tasks whose status is done
percent = floor(completed / eligible * 100), or 0 when eligible is empty
```

This is task completion only. It is not a confidence score and does not prove a
Research Question. A task is dependency-blocked while any dependency is not
`done`; an explicit `blocked` task additionally requires a user-visible reason.
Cycles, self-dependencies, missing task ids, and cross-Workspace ids are
rejected before persistence.

Completing a task uses a separate operation that records a user completion note
and immutable snapshots of the selected task references. A generic status update
cannot set `done`.

## Version and proposal semantics

Every canonical mutation increments the Plan version and writes a full local
history snapshot. Completed tasks cannot be deleted, and AI adaptation does not
overwrite completed or retired tasks.

AI `generate` and `adapt` return a pending `ResearchPlanProposal`. The proposal
contains rationale, text-labeled add/update/keep/conflict changes, and references
only to bounded Workspace candidates. The user can edit the goal and proposed
task text, reject it, or explicitly confirm it. Generation does not write Plan
tasks or canonical references. Confirmation rechecks the base Plan version and
source availability before applying changes. Invalid provider output is rejected.

## Security boundary

The call path remains:

```text
Renderer -> typed preload -> whitelisted IPC -> ResearchPlanService
         -> ResearchPlanDataGateway -> database Worker -> SQLite
```

The Plan IPC accepts UUIDs and discriminated domain references. It has no URL,
filesystem path, localhost, SQL, shell, Git mutation, or Zotero write capability.
All inputs and outputs are bounded and validated with Zod.
