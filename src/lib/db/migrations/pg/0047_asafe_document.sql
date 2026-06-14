-- Collaborative documents (Confluence/Notion-style rich-text docs).
-- Governed by the unified visibility model (docs/design/visibility-model.md)
-- like agents/workflows. Realtime is near-live over Electric: the shape exposes
-- only a CHANGE SIGNAL (id, updated_at, last_edited_by, last_edited_at) so a
-- viewer learns the doc changed and refetches the body — the heavy `content`
-- jsonb never rides the shape log. "document" also joins the entity_grant enum
-- so the existing per-user "shared" grants apply.
CREATE TABLE IF NOT EXISTS "asafe_document" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL DEFAULT 'Untitled',
  "content" jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "team_id" uuid REFERENCES "asafe_team"("id") ON DELETE SET NULL,
  "visibility" varchar NOT NULL DEFAULT 'private',
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_edited_by" uuid REFERENCES "user"("id") ON DELETE SET NULL,
  "last_edited_at" timestamptz,
  "archived" boolean NOT NULL DEFAULT false
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asafe_document_user_id_idx" ON "asafe_document" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asafe_document_team_id_idx" ON "asafe_document" ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asafe_document_updated_at_idx" ON "asafe_document" ("updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asafe_document_revision" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL REFERENCES "asafe_document"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "content" jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
  "edited_by" uuid REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asafe_document_revision_document_idx" ON "asafe_document_revision" ("document_id","created_at" DESC);
