-- Threaded comments on collaborative documents. Anyone who can READ the doc may
-- comment; only the author (or an org admin) may delete. Content is TipTap /
-- ProseMirror JSON, like chat-export comments. parent_id gives one level of
-- replies. ON DELETE CASCADE from asafe_document so comments never outlive the
-- doc; cascade from "user" so a removed account's comments go with it.
--
-- Realtime is POLLING (the comments panel re-fetches every few seconds while it
-- is OPEN and the tab is visible) — never an Electric shape — so a normal page
-- with the panel closed holds zero open connections (network-idle-safe).
CREATE TABLE IF NOT EXISTS "asafe_document_comment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL REFERENCES "asafe_document"("id") ON DELETE CASCADE,
  "parent_id" uuid,
  "author_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "content" jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asafe_document_comment_document_idx" ON "asafe_document_comment" ("document_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asafe_document_comment_parent_idx" ON "asafe_document_comment" ("parent_id");
