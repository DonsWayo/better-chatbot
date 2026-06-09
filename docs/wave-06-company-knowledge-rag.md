# Wave 6 — Company Knowledge (RAG)

**Goal:** Add semantic retrieval over approved company knowledge using pgvector, so answers can be grounded in company documents with citations. This fills the biggest gap vs. LobeChat (upstream has no vector RAG).
**Ships:** Grounded, cited answers from company knowledge.
**Depends on:** Waves 1–5 (auth/teams for access scoping; storage/ingest already present upstream).
**Phase:** GA path.

## Scope

**In scope**
- **pgvector on Neon** (native support — no separate vector DB needed): an embeddings table (document/chunk, embedding, metadata, source ref, team/visibility scope), an **HNSW** index, and hybrid queries (vector search + SQL `WHERE` for team/permission filtering, using pgvector 0.8 iterative scans to avoid over-filtering). Fine for our scale (<10M vectors → single-digit-ms search). Note Neon's scale-to-zero adds cold-start latency — disable it on the prod branch (Wave 12).
- **Ingestion pipeline:** chunk + embed uploaded/approved documents at `src/app/api/storage/ingest` / `src/lib/file-ingest`; support the file types employees actually use.
- **Retrieval:** at the chat route, before building the system prompt, retrieve top-k relevant chunks scoped to the user's permissions and inject them, with source tracking.
- **Citations:** responses cite the sources used; users can click through to the source.
- **Knowledge collections:** reuse/extend the upstream "archive" concept to group knowledge sets; control which teams can query which collections.
- **Freshness:** re-ingest/update path when source documents change.

**Out of scope (this wave)**
- Fine-tuning (separate, post-roadmap). Crawling external sources. Realtime sync with every company system (start with curated uploads/collections; live connectors are a later iteration). Desktop (Wave 7).

## Tasks

- [ ] Enable pgvector on Neon: `CREATE EXTENSION IF NOT EXISTS vector;` (Neon supports it natively — the SQL name is `vector`; confirm a patched pgvector ≥ 0.8.2). Add an embeddings/chunks table to `schema.pg.ts`; create an **HNSW** index (`vector_cosine_ops`); migrate.
- [ ] Choose the embedding model (reachable via the approved provider path) and document it.
- [ ] Build the ingestion pipeline: extract → chunk → embed → store with source metadata + team/visibility scope; hook into existing storage/ingest endpoints.
- [ ] Implement scoped retrieval (top-k, permission-aware) and inject context into the chat route before system-prompt assembly.
- [ ] Add citation tracking: record which chunks/sources informed the answer; render clickable citations in the UI.
- [ ] Extend "archive"/collections to represent knowledge sets; admin controls for which teams query which collections.
- [ ] Implement re-ingest/update on source change; handle deletions (remove embeddings).
- [ ] Account for retrieval/embedding cost in the Wave 3 usage ledger.
- [ ] Tests: ingestion produces correct chunks/embeddings; retrieval respects permissions; citations map to real sources; e2e: upload a doc, ask about it, get a cited answer.

## Acceptance criteria

- [ ] Given an approved document a user may access, when they ask about its content, then the answer is grounded in it and cites the source.
- [ ] Given a collection a user's team cannot access, when they query, then its content is not retrieved.
- [ ] Given a source document is updated, when re-ingested, then retrieval reflects the new content (and deletions remove old embeddings).
- [ ] Embedding/retrieval costs appear in the usage ledger; `pnpm check && pnpm test` green; e2e green.

## Open questions

- [Security/Product] What knowledge sources are in scope first, and what are the access/visibility rules per team?
- [Eng] Embedding model + dimension; chunking strategy; top-k defaults.
- [Legal] Retention/handling rules for ingested company documents.
