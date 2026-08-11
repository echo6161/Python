# Phase 13 Retrieval Evaluation

## Fixed baseline

The automated baseline is `tests/integration/research-knowledge-engine.test.ts`.
It uses temporary SQLite databases and deterministic in-memory sources; it has no
network, private Zotero Library, repository, model download, or paid API dependency.

| Case | Fixture | Expected baseline |
| --- | --- | --- |
| Keyword | paper page, code chunk, Question, confirmed Link all contain `clipping` | four source types returned with bounded snippets and exact locators |
| Isolation | same query in a second Workspace | zero results |
| Incremental | one changed Question, one unchanged code file, one added Link | changed/add extracted once; unchanged source not extracted |
| Removal | remove changed Question and Link from discovery | old terms return zero results |
| Restart | reopen the same SQLite database | remaining result is unchanged |
| Hybrid | two Questions and deterministic two-dimensional test vectors | semantic match ranks first; mode is `hybrid` |
| Keyword fallback | no EmbeddingProvider | mode is `keyword`; indexing and search remain available |

The test records correctness and ordering rather than inventing absolute latency or
memory targets from a four-document fixture. The full quality run reports suite
duration as execution evidence, not as a product performance guarantee.

## Evaluation constraints

- Scores are useful for ordering within one query and index version, not calibrated
  probabilities.
- FTS and semantic candidate sets are bounded, so reported totals describe the
  evaluated candidate set.
- Multilingual tokenization uses SQLite Unicode FTS. Recall for language-specific
  stemming is not claimed.
- Production hybrid quality remains unevaluated until an explicit local or approved
  provider is selected in a later phase.
