-- #19: immutable revisions + publish lifecycle for agents AND workflows
CREATE TABLE IF NOT EXISTS "agent_revision" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" varchar NOT NULL,
  "source_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "config_snapshot" jsonb NOT NULL,
  "status" varchar NOT NULL DEFAULT 'draft',
  "author_id" uuid NOT NULL,
  "approved_by" uuid,
  "changelog" text,
  "team_ids" jsonb,
  "org_wide" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "agent_revision_kind_source_id_version_unique" UNIQUE("kind","source_id","version")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_revision_source_id_idx" ON "agent_revision" ("source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_revision_status_idx" ON "agent_revision" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_revision_kind_status_idx" ON "agent_revision" ("kind","status");
