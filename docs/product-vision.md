# PaperMind Product Vision

- Status: authoritative from Phase 5.5
- Product category: AI-native Research Workspace and Research Control Plane
- Supersedes: the product direction and future-phase scope in the Phase 0 requirements

## 1. Product Position

PaperMind coordinates research work that spans papers, code, experiments, evidence, and durable knowledge. It is not a replacement for a bibliography manager, editor, source-control system, or personal knowledge base. It gives those systems a shared research context and preserves the links, decisions, and provenance that are otherwise lost between them.

The root domain object is a **Workspace**, not a PDF or a Paper. A Workspace holds the intent and state of a research effort and references externally owned resources.

## 2. Research Loop

The primary workflow is:

```text
Goal -> Papers -> Questions -> Code -> Experiment -> Evidence
     -> Conclusion -> Memory -> Next Question
```

This loop is iterative. Every conclusion must be traceable to the questions, references, code state, experiment outputs, and human or agent actions that produced it.

## 3. PaperMind-Owned Concepts

PaperMind is authoritative for:

- Workspace identity, title, description, lifecycle, and local settings.
- Research goals, research questions, hypotheses, and research state.
- References to Zotero libraries, collections, items, attachments, and annotations.
- References to Git repositories, commits, branches, tags, and files.
- Relationships between papers, questions, code, experiments, evidence, and conclusions.
- Research notes, research memory, reading plans, and agent plans.
- Experiment metadata and evidence/provenance records.
- Research graph edges and application-specific workflow state.

PaperMind stores stable external identifiers, selected derived snapshots, and provenance. It does not silently claim ownership of external authoritative data.

## 4. External Tool Responsibilities

- **Zotero** owns bibliography metadata, source PDFs, annotations, citations, Zotero collections, and literature organization. It is the bibliographic source of truth.
- **Git and GitHub** own repository content, history, commits, branches, tags, remotes, and collaboration state. Git is the source-code source of truth; GitHub is an optional remote collaboration surface.
- **VS Code** owns source editing, debugging, terminals, and program execution.
- **Obsidian** owns long-term personal and cross-project knowledge. PaperMind may export or link notes without replacing or silently overwriting the user's vault.
- **AI providers and coding agents** perform bounded reasoning or actions. They do not become a source of truth merely by generating output.

Detailed ownership and freshness rules are in [data-ownership.md](./data-ownership.md).

## 5. Current Capabilities After Phase 5

The existing local PDF library, reader, annotations, metadata tools, and selected-text AI assistant remain supported. They are reclassified as a **legacy compatibility and fallback import path**:

- They must not be deleted or broken during the reorientation.
- They are not the root product model for new work.
- A Zotero-connected Workspace should reference Zotero-owned resources instead of copying them into the managed PDF library by default.
- Existing PaperMind-managed PDFs remain readable and migratable.
- The current `AiProvider` and secure Main-process AI gateway remain foundations for future Research Services and the Research Agent.

## 6. Product Principles

1. Local first: Workspace state and provenance are useful without a PaperMind cloud account.
2. Privacy first: external transmission is explicit, scoped, reviewable, and cancellable.
3. References over copies: preserve stable references to authoritative external objects; cache only for a stated purpose.
4. Traceability over fluent output: conclusions and agent actions require provenance.
5. Human control: destructive or externally visible actions require explicit approval.
6. Graceful degradation: Zotero, GitHub, Obsidian, or AI unavailability must not corrupt local Workspace state.
7. Additive migration: legacy Paper/PDF data is retained while the Workspace model is introduced through forward migrations.

## 7. Agent Model

The future Research Agent operates through typed, validated, bounded, domain-specific tools. Examples include `searchZoteroItems`, `readWorkspaceQuestion`, `inspectRepositoryStatus`, and `recordEvidence`.

The agent must not receive generic capabilities such as arbitrary shell execution, arbitrary SQL, unrestricted filesystem reads, raw IPC invocation, or unrestricted localhost/network access. Tool inputs and outputs carry resource scope, limits, provenance, cancellation, and audit metadata.

## 8. Explicitly Deprecated Product Directions

The following are no longer the target architecture:

- Treating PaperMind's local `Paper` row or managed PDF copy as the universal root object.
- Rebuilding Zotero's bibliography, collection, citation, or annotation system as PaperMind's primary organizer.
- Treating a single-paper RAG chat as Phase 6 or as the product's central workflow.
- Treating PaperMind as the editor, terminal, Git client, GitHub collaboration client, or long-term knowledge vault.
- Copying all externally owned metadata, PDFs, repositories, or notes into PaperMind as canonical data.
- Giving an agent generic shell, SQL, filesystem, localhost, or network tools.

These directions may survive only as documented compatibility behavior where existing users or data require it.

## 9. Near-Term Product Boundary

Phase 6 delivered a read-only Zotero Bridge with a safe Main-process adapter, connection diagnostics, typed identifiers, and bounded access to Zotero data. It did not persist or copy Zotero-owned bibliography/PDF data. Workspace Core begins only after explicit approval of Phase 7; repository integration, multi-paper RAG, and a Research Agent remain later phases.
