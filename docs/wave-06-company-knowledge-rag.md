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

- [x] Enable pgvector on Neon: `CREATE EXTENSION IF NOT EXISTS vector;` (Neon supports it natively — the SQL name is `vector`; confirm a patched pgvector ≥ 0.8.2). Add an embeddings/chunks table to `schema.pg.ts`; create an **HNSW** index (`vector_cosine_ops`); migrate. — done via migration `0017_asafe_mcp_rag.sql` (vector extension + HNSW `vector_cosine_ops`) on self-hosted Postgres (not Neon, ADR-0006); chunks table in `schema.pg.ts`
- [x] Choose the embedding model (reachable via the approved provider path) and document it. — `text-embedding-3-small`, 1536-dim, pinned (`EMBEDDING_DIMENSION` in `schema.pg.ts`, ADR-0007), routed via OpenRouter
- [x] Build the ingestion pipeline: extract → chunk → embed → store with source metadata + team/visibility scope; hook into existing storage/ingest endpoints. — done via `src/lib/file-ingest/extract.ts` (PDF/unpdf, DOCX/mammoth, text/md) → `src/lib/ai/embeddings/{chunker,ingest}.ts` → `/api/knowledge/ingest` + upload (new knowledge endpoints rather than the old storage route)
- [x] Implement scoped retrieval (top-k, permission-aware) and inject context into the chat route before system-prompt assembly. — `retrieveForChat` (`src/lib/ai/embeddings/retrieval.ts`, hybrid pgvector + FTS with RRF, unified visibility resolver) injected in `src/app/api/chat/route.ts`
- [x] Add citation tracking: record which chunks/sources informed the answer; render clickable citations in the UI. — `[Source N]` citations + sources row (`citation-bar.tsx`, `message-rag-sources.tsx`); sources are listed/expandable, but there is no click-through link to the underlying document yet
- [x] Extend "archive"/collections to represent knowledge sets; admin controls for which teams query which collections. — knowledge collections with visibility + multi-team `teamIds` (`src/lib/knowledge/collections.ts`); `admin/knowledge` + Studio knowledge UI
- [x] Implement re-ingest/update on source change; handle deletions (remove embeddings). — re-ingest replaces a document's chunks (delete-then-insert in `embeddings/ingest.ts`); document DELETE endpoint removes embeddings (cascade)
- [x] Account for retrieval/embedding cost in the Wave 3 usage ledger. — done via `embedText`/`embedBatch` metering (`src/lib/ai/embeddings/index.ts`): OpenRouter `usage.prompt_tokens` recorded fire-and-forget through `recordUsage` (model `openai/text-embedding-3-small` @ $0.02/1M, price verified 2026-06-11; `taskClass: "embedding"`); attribution threaded from `retrieveForChat` (user+team), the knowledge ingest routes/action (admin user), and memory extraction/injection
- [x] Tests: ingestion produces correct chunks/embeddings; retrieval respects permissions; citations map to real sources; e2e: upload a doc, ask about it, get a cited answer. — `chunker/embeddings/retrieval/ingest` unit tests + `tests/asafe/rag-collection.spec.ts`, `tests/asafe/knowledge-documents.spec.ts`, `tests/asafe/admin-knowledge.spec.ts`

## Acceptance criteria

- [x] Given an approved document a user may access, when they ask about its content, then the answer is grounded in it and cites the source. — covered by RAG e2e specs
- [x] Given a collection a user's team cannot access, when they query, then its content is not retrieved. — visibility enforced inside `retrieveForChat`; `retrieval.test.ts`
- [x] Given a source document is updated, when re-ingested, then retrieval reflects the new content (and deletions remove old embeddings).
- [x] Embedding/retrieval costs appear in the usage ledger; `pnpm check && pnpm test` green; e2e green. — done via embedding metering above: every embedding path writes `asafe_usage_event` rows when an acting user is known (`user_id` is a required FK, so attribution-less calls are skipped by design); unit-tested in `embeddings.test.ts` (token capture, attribution threading, metering failure never breaks embedding)

## Open questions

- [Security/Product] What knowledge sources are in scope first, and what are the access/visibility rules per team?
- [Eng] Embedding model + dimension; chunking strategy; top-k defaults. — resolved: `text-embedding-3-small` @ 1536; see ADR-0007 and `src/lib/ai/embeddings/chunker.ts`
- [Legal] Retention/handling rules for ingested company documents.

---
**How to verify:** `pnpm test src/lib/ai/embeddings src/lib/file-ingest src/lib/knowledge` (unit); `pnpm test:e2e tests/asafe/rag-collection.spec.ts tests/asafe/knowledge-documents.spec.ts tests/asafe/admin-knowledge.spec.ts` (needs running stack + pgvector-enabled Postgres + seed); manage collections at `/admin/knowledge` and in Studio.
