-- Notifications when a colleague @mentions you in a document comment.
-- One row per mention per recipient; `is_read` flips when they open
-- the document or dismiss from the Inbox Mentions tab.
-- Cascades from both the comment and the user so no orphan rows.
CREATE TABLE IF NOT EXISTS "asafe_mention_notification" (
  "id"           uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "recipient_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "author_id"    uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "document_id"  uuid NOT NULL REFERENCES "asafe_document"("id") ON DELETE CASCADE,
  "comment_id"   uuid NOT NULL REFERENCES "asafe_document_comment"("id") ON DELETE CASCADE,
  "is_read"      boolean NOT NULL DEFAULT false,
  "created_at"   timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "asafe_mention_notification_recipient_idx"
  ON "asafe_mention_notification" ("recipient_id", "is_read", "created_at" DESC);
