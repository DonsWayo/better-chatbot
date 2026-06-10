-- Unified visibility model (docs/design/visibility-model.md), step 1:
-- generic per-user grant table powering the "shared" visibility level for
-- every shareable entity, plus team_ids on workflow + agent for the "team"
-- level. Legacy visibility enums stay untouched — the resolver in
-- src/lib/visibility maps legacy 'public' → company at read time.
CREATE TABLE IF NOT EXISTS "entity_grant" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" varchar NOT NULL,
  "entity_id" uuid NOT NULL,
  "grantee_user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "capability" varchar NOT NULL DEFAULT 'use',
  "granted_by" uuid NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "entity_grant_entity_grantee_capability_unique" UNIQUE("entity_type","entity_id","grantee_user_id","capability")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_grant_entity_idx" ON "entity_grant" ("entity_type","entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entity_grant_grantee_idx" ON "entity_grant" ("grantee_user_id");
--> statement-breakpoint
ALTER TABLE "workflow" ADD COLUMN IF NOT EXISTS "team_ids" jsonb;
--> statement-breakpoint
ALTER TABLE "agent" ADD COLUMN IF NOT EXISTS "team_ids" jsonb;
