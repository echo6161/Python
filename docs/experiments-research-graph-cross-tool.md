# Experiments, Research Graph, and Cross-tool Links

Experiments, external run metadata, bounded scalar metrics, results, conclusions,
and proposals are Workspace-owned metadata. PaperMind never executes a run,
copies an artifact/dataset/checkpoint, or changes the pinned repository. Later
HEAD drift is shown as stale without rewriting the snapshot.

AI conclusions remain proposals until explicit confirmation. Pending/rejected
proposals are excluded from the Graph. Deleting an Experiment removes only its
PaperMind-owned rows, not Questions, repositories, source files, or external runs.

`ResearchGraphService` rebuilds deterministic nodes and edges from canonical
gateways. It owns no fact table. The UI uses `@xyflow/react` 12.10.0 (MIT) for
tested pan/zoom, controls, fit-view, and minimap behavior rather than a custom
interaction engine.

Renderer sends outbound `workspaceId + graph nodeId + primary|github` only. Main
re-resolves the canonical reference. Zotero and VS Code reuse existing launchers;
GitHub accepts only credential-free `github.com` remotes; Obsidian requires a
recorded export. No scheme, URL, host, path, shell, or arbitrary remote crosses IPC.
