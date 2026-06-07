# ADR-0007: RAG / pgvector architecture

**Status:** Proposed
**Date:** 2026-06-07
**Deciders:** Engineering (model/dimension), Legal (ingested-doc retention)
**Gates:** Wave 6 — **and the embedding dimension must be fixed before the Wave 6 migration**

## Context

The biggest capability gap vs. alternatives is vector RAG — upstream has **zero** pgvector; its
"archive" is collections, not embeddings. Wave 6 adds grounded, cited answers over approved
company knowledge. Relevant facts: Neon supports pgvector natively; our scale is **< 10M vectors**
(single-digit-ms search is realistic); the org is **bilingual ES/EN**, so the embedding model must
be **multilingual**; ingestion today is **CSV-preview only** (`src/lib/file-ingest/`), and the
storage abstraction is ready.

The decision with the longest legs is the **embedding model + dimension**: the vector column type
is fixed at table-creation, so changing dimension later means a full re-embed + reindex. **Decide
it before the Wave 6 schema migration.**

## Decision

- **pgvector ≥ 0.8.2 on Neon** (`CREATE EXTENSION IF NOT EXISTS vector;`). Confirm a patched
  version (≥ 0.8.2) per the security note.
- **Schema:** an `embedding` table (chunk text, `vector(N)`, source/document ref, chunk metadata,
  **`team_id` + visibility scope** per ADR-0002), plus a `knowledge_collection` concept extending
  the existing "archive" idea. **HNSW** index with `vector_cosine_ops`.
- **Hybrid retrieval:** vector search **+ SQL `WHERE`** for team/permission filtering, using
  pgvector 0.8 **iterative scans** to avoid over-filtering. Permission filter is applied in the
  query, never post-hoc.
- **Embedding model = a hosted *multilingual* model on the ADR-0001 approved transport.**
  Recommended: **OpenAI `text-embedding-3-large` (3072-dim)** for quality, or
  **`text-embedding-3-small` (1536-dim)** if cost/storage dominates. **Pin the dimension at
  creation.** (Cohere `embed-multilingual-v3`, 1024-dim, is a strong ES alternative if we want
  smaller vectors; see options.)
- **Chunking:** ~**800 tokens** with ~**15% overlap** for prose; structure-aware where possible.
  **top-k = 6–8** default, tunable per collection.
- **Citations:** record which chunks/sources informed each answer; render clickable citations.
- **Freshness:** re-ingest on source change; **delete embeddings on source delete.**
- **Cost:** meter embedding + retrieval cost into the ADR-0003 usage ledger.
- **Latency:** disable Neon scale-to-zero on prod (ADR-0006) before RAG goes live.

## Options Considered

### Embedding model — Option A: OpenAI `text-embedding-3-*` (recommended)
| Dimension | Assessment |
|-----------|------------|
| Multilingual (ES/EN) | Strong |
| Quality | High (large), good (small) |
| Cost/storage | 3072-dim = larger rows/index; 1536 halves it |
| Transport fit | Reachable via the ADR-0001 path |

**Pros:** excellent quality, well-supported, dimension options. **Cons:** 3072-dim grows index
size; ties embedding to the same posture question as ADR-0001.

### Embedding model — Option B: Cohere `embed-multilingual-v3` (1024-dim)
**Pros:** purpose-built multilingual, **smaller vectors** (cheaper index/storage), strong on
Spanish. **Cons:** another provider/DPA; transport must support it.

### Embedding model — Option C: self-hosted (e.g. `bge-m3`) on vLLM
**Pros:** no data leaves our boundary; no per-token cost. **Cons:** ops burden; **defer to
post-GA** (noted in README) — not for Wave 6.

### Index — HNSW (recommended) vs IVFFlat
HNSW: better recall/latency at our scale, no training step; IVFFlat: smaller build but needs
tuning/training and worse tail latency. Choose **HNSW** (`vector_cosine_ops`).

## Trade-off Analysis

Two coupled choices: **multilingual quality** vs. **vector size/cost**. Because the org is
bilingual, a non-multilingual model is disqualified regardless of price. Between OpenAI-large
(3072, best quality, biggest index) and a 1024–1536 multilingual option (cheaper, slightly lower
ceiling), the deciding factor at **< 10M vectors** is that storage/index cost is *not* our
bottleneck — quality and the simplicity of staying on the ADR-0001 transport are. So we recommend
OpenAI `text-embedding-3` (start `large`/3072; drop to `small`/1536 if storage/cost reviews say
so), and we **lock the number before migrating** because dimension is the one thing that's painful
to change.

## Consequences

- **Easier:** grounded, cited, permission-scoped answers; clean extension of "archive" →
  collections; cost visible in the ledger.
- **Harder:** ingestion pipeline (extract → chunk → embed → store) is net-new beyond today's CSV
  preview; dimension is effectively immutable post-launch (re-embed to change).
- **Revisit:** self-hosted embeddings post-GA; reranking; live connectors (Wave 6 is curated
  uploads only).

## Open inputs needed

- **[Eng]** Final embedding model + dimension (this **locks the `vector(N)` column**).
- **[Security/Product]** First knowledge sources + per-team visibility rules.
- **[Legal]** Retention/handling rules for ingested company documents (Wave 8 alignment).

## Action items

1. [ ] (W6) Enable pgvector (≥0.8.2) on Neon; add `embedding` + `knowledge_collection` tables (with `team_id`/visibility) to `schema.pg.ts`; HNSW `vector_cosine_ops`; migrate.
2. [ ] (W6) Build ingestion: extract → chunk (~800/15%) → embed → store with source + scope; extend `src/lib/file-ingest/` beyond CSV.
3. [ ] (W6) Permission-aware top-k retrieval injected before system-prompt assembly; iterative-scan hybrid query.
4. [ ] (W6) Citation tracking + clickable sources; re-ingest on change; delete embeddings on source delete.
5. [ ] (W6) Meter embedding/retrieval cost into the ADR-0003 ledger.
