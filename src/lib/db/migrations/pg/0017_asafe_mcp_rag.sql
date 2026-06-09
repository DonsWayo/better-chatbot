-- Wave 5: company MCP scope + audit log
ALTER TABLE "mcp_server" ADD COLUMN IF NOT EXISTS "scope" varchar DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_server" ADD COLUMN IF NOT EXISTS "team_id" uuid REFERENCES "asafe_team"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asafe_mcp_invocation_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "team_id" uuid REFERENCES "asafe_team"("id") ON DELETE SET NULL,
  "mcp_server_id" uuid REFERENCES "mcp_server"("id") ON DELETE SET NULL,
  "tool_name" varchar(200) NOT NULL,
  "outcome" varchar NOT NULL,
  "duration_ms" integer,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
-- Wave 6: knowledge collections + RAG embeddings (pinned dimension=1536, ADR-0007)
CREATE TABLE IF NOT EXISTS "asafe_knowledge_collection" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "team_id" uuid REFERENCES "asafe_team"("id") ON DELETE CASCADE,
  "visibility" varchar DEFAULT 'org' NOT NULL,
  "created_by" uuid REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asafe_document_chunk" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "collection_id" uuid NOT NULL REFERENCES "asafe_knowledge_collection"("id") ON DELETE CASCADE,
  "source_ref" text NOT NULL,
  "chunk_index" integer NOT NULL,
  "chunk_text" text NOT NULL,
  "embedding" vector(1536) NOT NULL,
  "metadata" json DEFAULT '{}',
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "doc_chunk_hnsw_idx" ON "asafe_document_chunk" USING hnsw (embedding vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "doc_chunk_collection_idx" ON "asafe_document_chunk" ("collection_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_inv_user_idx" ON "asafe_mcp_invocation_log" ("user_id");
