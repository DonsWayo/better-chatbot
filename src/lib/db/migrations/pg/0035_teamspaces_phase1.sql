-- Teamspaces phase 1: Notion-style folders + read-only shared thread snapshots.
-- folder.team_id null = personal folder; set = team folder (threads inside it
-- with visibility 'team' are readable by every member of that team).
CREATE TABLE IF NOT EXISTS "folder" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "parent_id" uuid REFERENCES "folder"("id") ON DELETE CASCADE,
  "team_id" uuid REFERENCES "asafe_team"("id") ON DELETE SET NULL,
  "owner_id" uuid NOT NULL,
  "visibility" varchar NOT NULL DEFAULT 'private',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "folder_owner_id_idx" ON "folder" ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "folder_team_id_idx" ON "folder" ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "folder_parent_id_idx" ON "folder" ("parent_id");
--> statement-breakpoint
ALTER TABLE "chat_thread" ADD COLUMN IF NOT EXISTS "folder_id" uuid REFERENCES "folder"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "chat_thread" ADD COLUMN IF NOT EXISTS "visibility" varchar NOT NULL DEFAULT 'private';
