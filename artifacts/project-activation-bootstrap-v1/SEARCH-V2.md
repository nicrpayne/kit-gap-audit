# Search V2 — hybrid semantic and graph-aware retrieval

## Product promise

Keep the current fast Level 1 search and add meaning without obscuring why a result appeared.

Query: `Where have we discussed field readiness?`

Preferred result order:

1. current structured intelligence or canonical wiki concept when it directly represents the idea;
2. exact evidence passages supporting that concept;
3. source/transcript artifacts containing those passages;
4. related graph neighbors, clearly labeled.

Drilldown is always:

`idea/intelligence → evidence passage → exact source/transcript location`

Wiki is labeled `Synthesis · derived`; it is never displayed as independent corroboration of its own raw origins.

## Four retrieval layers

1. **Exact identity** — stable ids, exact titles, canonical names/aliases, exact quotes.
2. **Lexical/fuzzy** — the existing `SearchDocument` + `SignalSearchIndex` MiniSearch path.
3. **Semantic idea retrieval** — vector candidates over human-readable statements/passages/chunks.
4. **Graph-aware expansion** — bounded, typed neighbors of the strongest candidates.

The layers run in parallel after normalization. Exact matches are pinned; lexical and semantic results are fused by rank; graph expansion explains relationships but cannot manufacture primary relevance.

## Result contract

```ts
interface SearchV2Hit {
  canonicalId: string;
  family: "reality" | "external" | "wiki" | "evidence" | "source";
  title: string;
  snippet: string;
  reasons: (
    | { kind: "exact_title"; field: string }
    | { kind: "quote"; evidenceId: string }
    | { kind: "keyword"; terms: string[]; field: string }
    | { kind: "semantic"; explanation: string }
    | { kind: "graph"; viaId: string; relation: string }
  )[];
  sourceDate?: string;
  currentness?: string;
  provenance: { evidenceIds: string[]; sourceRefs: string[]; lineageRootIds: string[] };
  ranking: { lexicalRank?: number; semanticRank?: number; fusedRank: number };
}
```

No `similarity: 0.87` field is user-facing. Vector distance is retriever diagnostics, not truth/confidence.

## Ranking

Use weighted reciprocal-rank fusion, then policy adjustments:

- exact id/quote/title is pinned ahead of non-exact results;
- structured current intelligence can lead an idea query when it has grounded evidence;
- evidence passage can lead when the query is a quote;
- source artifact can lead when the query is an exact title/id;
- derivative wiki result is demoted below the intelligence/evidence it synthesizes when both are present;
- currentness is a tiebreak for current-state objects, not a blanket historical penalty;
- graph-only hits cannot outrank primary exact/lexical/semantic hits;
- family diversity avoids a page of ten passages from one transcript;
- lineage collapse groups derivative repetitions.

## Embedding unit and lifecycle

Reuse `SearchDocument` identity, but embed a separate normalized text projection:

- title + statement for canonical/external/wiki concepts;
- exact excerpt for evidence passages;
- title + bounded synopsis/chunk for sources;
- exclude ids and technical metadata from embedding text;
- retain document id, content hash, model id, dimensions, embedded-at, source currentness, and lineage roots.

When content hash changes, enqueue re-embedding. Deletion/supersession tombstones the embedding. Search remains usable lexically while embeddings are pending or the provider is down.

## Options for this stack

| Option | Cost | Privacy | Maintenance / Railway fit | Verdict |
| --- | --- | --- | --- | --- |
| In-process local model + file/HNSW index | no per-token API cost; higher RAM/CPU | best data locality | model download/cold starts, ephemeral filesystem/volume management, Node native bindings, rebuild ownership; poor fit for the current small Next service | Do not choose for V1 |
| Local embedding sidecar + pgvector | compute/RAM service cost | text stays within Railway project | two services, model image, queue, observability; viable if external embedding is prohibited | Privacy fallback |
| Existing Postgres + pgvector | low incremental data cost | vectors/data stay in project DB; embedding provider still receives text | Railway standard Postgres does not include pgvector; requires compatible image/template or migration; simplest query/backup story once enabled | Preferred store if extension path is proven |
| Dedicated Railway pgvector service | extra database service | same Railway project; embeddings separated and rebuildable | avoids risky production DB image migration but adds backup/connection service | Preferred deployment fallback |
| Managed vector DB | usage + network/vendor cost | another processor and data copy | easiest ANN operations, but unnecessary vendor surface at current corpus scale | Revisit at much larger scale |
| External embedding API + pgvector | very low embedding cost for modest corpus; worker cost | source text leaves Railway under provider policy | operationally simple, versioned batch worker, retries; model-specific re-embed required | Recommended generation path with approved provider |

Railway’s current documentation says its standard Postgres image does not include pgvector and recommends the pgvector template for an embeddings pipeline. The pgvector project supports exact search plus HNSW/IVFFlat; for the expected corpus, start with exact cosine/inner-product search and add HNSW only after measured latency demands it. Sources: [Railway PostgreSQL](https://docs.railway.com/databases/postgresql), [Railway embeddings pipeline](https://docs.railway.com/guides/embeddings-pipeline), [pgvector](https://github.com/pgvector/pgvector).

An approved remote model such as `text-embedding-3-small` is currently priced at $0.02 per million input tokens, while the larger model is $0.13 per million; pricing and policy must be re-verified at implementation time. Source: [OpenAI embedding model documentation](https://developers.openai.com/api/docs/models/text-embedding-3-large).

## Recommendation

Use **hybrid MiniSearch + Postgres/pgvector with an asynchronous external-embedding worker**, with these deployment gates:

1. Keep current MiniSearch path unchanged and always available.
2. Probe whether the production database image can safely enable `vector`; do not mutate the database image casually.
3. If not, provision a dedicated Railway pgvector service as a rebuildable search index.
4. Store canonical search documents/content hashes in Signal’s primary Postgres; vectors are derived and rebuildable.
5. Embed asynchronously; writes and bootstrap scan completion do not wait for the provider.
6. Start with exact vector scan at modest corpus size; introduce HNSW only after benchmark thresholds.
7. Put model/provider selection behind a `SemanticRetriever` interface so a local sidecar can replace the remote provider for stricter privacy.

This recommendation avoids a standalone vector vendor, preserves exact search, and fits the current Railway/Postgres/Prisma architecture without pretending Prisma needs to understand vector arithmetic. Use a small reviewed raw SQL repository for vector queries and migrations.

## Privacy and retention

- embed only the minimal text projection, not whole artifacts by default;
- redact configured sensitive patterns before embedding, retaining a hash-to-source mapping;
- document the embedding provider as a processor and verify current retention/data-control terms;
- never log raw query or passage text at info level;
- allow a project/provider to opt out of semantic indexing while retaining exact search;
- vectors are treated as sensitive derivatives and deleted/rebuilt with source retention policy.

## Failure behavior

- embedding service unavailable: exact/lexical/graph search continues; label `Semantic results temporarily unavailable`;
- stale embeddings: show current lexical result and omit stale semantic projection rather than mix versions;
- semantic result without evidence path: result can appear as `Semantic lead · source path unavailable`, but cannot become a synthesized answer;
- large ambiguous result set: group by concept and lineage; ask for a refining term;
- zero semantic results: do not fabricate synonyms; show lexical results and searched layers.

## Not in this tranche

- vector extension or database migration;
- embedding provider integration;
- embeddings/backfill;
- synthesis/answer generation;
- cross-project access control changes.

