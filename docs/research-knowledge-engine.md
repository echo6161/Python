# Research Knowledge Engine

## Scope

Phase 13 adds Workspace-scoped extraction, indexing, retrieval, and citation. It
does not generate answers, call an LLM, run an agent, or create notes, plans,
experiments, or memory. The index is local derived data and can be removed or
rebuilt without changing any authoritative source.

## Boundary

```text
Renderer Knowledge page
  -> typed preload KnowledgeApi
  -> fixed knowledge:* IPC + strict Zod validation
  -> KnowledgeEngineService
     -> KnowledgeSourceProvider / extractor
     -> optional EmbeddingProvider
     -> KnowledgeRetriever
     -> KnowledgeDataGateway
  -> Database Worker -> SQLite derived index
```

Renderer inputs contain only Workspace IDs, request IDs, a bounded query, finite
source filters, pagination, and explicit index commands. They cannot specify a
URL, protocol, host, port, local path, SQL, provider endpoint, or arbitrary file.
Source navigation is domain-specific: Zotero page or authorized repository line.

## Sources and ownership

| Source | Stable identity and snapshot | Extracted content | Authority |
| --- | --- | --- | --- |
| Zotero paper | server + library + item + item/attachment version | local PDF page text | Zotero |
| Code | RepositoryRef + file + commit/content snapshot | existing Phase 10 chunks | Git/local source |
| Question | Workspace question ID + row version/update time | title and description | PaperMind Question |
| Paper-Code Link | confirmed link ID + row version/update time | label, description, finite relation | PaperMind confirmed link |

Paper PDFs are resolved through Zotero's fixed Local API inside Main and passed
directly to the bounded PDF extraction Worker. PaperMind does not scan Zotero
storage and does not copy the PDF. Code is reused from the Phase 10 derived index;
the repository root is never rescanned through a Renderer-controlled path.

## Chunk and provenance rules

- Index version: `papermind-knowledge-v1`.
- Text normalization and chunk boundaries are deterministic.
- Text chunks are at most 1,800 characters with a 180-character overlap.
- Stored chunk content is constrained to 8,000 characters; Renderer snippets are
  constrained to 520 characters.
- PDF chunks never cross page boundaries. Every paper result stores the Zotero
  attachment key and positive page number.
- Code chunks retain repository, snapshot, relative path, language, and bounded
  line range from Phase 10.
- Question and link chunks retain their PaperMind object ID and snapshot.
- Every chunk stores its own citation and provenance JSON. Source-level provenance
  is not used as a substitute for an exact chunk locator.

If a locator cannot be established, no result is emitted with a fabricated
citation. An unavailable PDF is retained as an unavailable source with zero text
chunks.

## Lifecycle and rebuild

Discovery compares stable `(sourceType, sourceIdentity, fingerprint)` values with
the current index. Incremental updates extract only added or changed sources and
delete removed sources. Completion replaces affected rows and advances lifecycle
state in one SQLite transaction; old ready rows remain available until completion.
Code fingerprints include the commit/content snapshot even when bytes are unchanged.
A transient Zotero connection failure preserves the last completed local source
instead of replacing it with an empty source; its recorded snapshot remains visible
until a successful update can evaluate freshness.

Jobs expose discovering, extracting, embedding, and saving progress. Cancellation
terminates active PDF Workers through `AbortSignal`. Startup changes interrupted
`indexing` rows to `cancelled`. Failed and cancelled jobs can retry or rebuild.
Removing an index deletes only `knowledge_*` derived rows. A changed index version
is reported as stale and requires rebuild.

## Retrieval

FTS5 keyword retrieval is always available and uses a bounded OR query derived
from at most 16 normalized terms. Results are Workspace-filtered before ranking.
The production application currently configures no EmbeddingProvider, so it does
not download a model, access a network, or incur a paid request.

An injected provider can add vectors during indexing and query time. Hybrid rank is
`0.55 * keyword + 0.45 * cosine similarity`. Provider vectors must have the declared
dimension, contain only finite numbers, and stay under 4,096 dimensions. Tests use
a deterministic local provider; it is not a production response substitute.

## Navigation and stale safety

Paper results open the exact Zotero attachment/page. Code results compare the
stored snapshot with the current Phase 10 snapshot before opening VS Code. A
changed snapshot returns a clear stale reason instead of silently opening an
approximate current line. Question and Link results navigate to their existing
Workspace sections.

## Limits

- 20,000 discovered sources per Workspace.
- 2,000 reused code chunks per file.
- 50 results per page and 5,000 semantic candidates per query.
- PDF extraction retains the existing 256 MiB, 2,000 page, 20 million character,
  Worker memory, cancellation, and timeout limits.
- No unconfirmed AI proposal is indexed.
- UNC/network-share Zotero attachment paths are conservatively rejected by the
  local file URL resolver; only local `file:` URLs without a remote host are read.

These bounds protect the local desktop process. Large Workspace performance should
be measured with representative user-owned data before raising them.
