-- Knowledge stack phase 2 (task #20): hybrid retrieval + unified visibility.
-- 1) Full-text search column for BM25-ish lexical recall, fused with pgvector
--    cosine + recency in src/lib/ai/embeddings (reciprocal rank fusion).
-- 2) team_ids on collections so knowledge follows the unified visibility model
--    (docs/design/visibility-model.md): private/shared/team/company; legacy
--    'org' maps to company in the resolver, 'team' uses team_ids.
ALTER TABLE "asafe_document_chunk"
  ADD COLUMN IF NOT EXISTS "fts" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', "chunk_text")) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "doc_chunk_fts_idx" ON "asafe_document_chunk" USING gin ("fts");
--> statement-breakpoint
ALTER TABLE "asafe_knowledge_collection" ADD COLUMN IF NOT EXISTS "team_ids" jsonb;
--> statement-breakpoint
-- Backfill: single-team collections move their team into the new array.
UPDATE "asafe_knowledge_collection"
SET "team_ids" = to_jsonb(ARRAY["team_id"])
WHERE "team_id" IS NOT NULL AND "team_ids" IS NULL;
