-- User memory (docs/design/user-memory.md): typed per-user facts the assistant
-- retains across conversations. Decoupled from chats on purpose — deleting a
-- thread must NOT delete derived memories (erasure targets this table).
CREATE TABLE IF NOT EXISTS "user_memory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "scope_id" text,
  "kind" varchar NOT NULL,
  "content" text NOT NULL,
  "embedding" vector(1536),
  "source_thread_id" uuid,
  "confidence" real NOT NULL DEFAULT 0.5,
  "superseded_by" uuid REFERENCES "user_memory"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "last_used_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_memory_user_idx" ON "user_memory" ("user_id", "scope_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_memory_active_idx" ON "user_memory" ("user_id") WHERE "superseded_by" IS NULL;
