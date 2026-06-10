-- Electric realtime phase 3: presence heartbeats. Written via Server Action
-- (write path stays Postgres-only per CLAUDE.md rule); read via the
-- authenticated Electric shape proxy (/api/realtime/shape, shape "presence").
CREATE TABLE IF NOT EXISTS "asafe_presence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "context_type" varchar NOT NULL,
  "context_id" text NOT NULL,
  "last_seen_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "asafe_presence_user_context_unique" UNIQUE("user_id","context_type","context_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asafe_presence_context_idx" ON "asafe_presence" ("context_type","context_id","last_seen_at");
