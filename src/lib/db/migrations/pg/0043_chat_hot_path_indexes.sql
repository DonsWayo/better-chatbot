-- Hot-path indexes for the two fastest-growing query paths.
-- chat_message: selectMessagesByThreadId() filters WHERE thread_id ORDER BY
--   created_at — previously a seq scan (PK on id only).
-- chat_thread: the sidebar thread list filters WHERE user_id ORDER BY the
--   latest message time — previously a seq scan (PK on id only).
-- Both composite indexes cover the filter + sort in one shot. Idempotent.
CREATE INDEX IF NOT EXISTS "chat_message_thread_id_created_at_idx" ON "chat_message" ("thread_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_thread_user_id_created_at_idx" ON "chat_thread" ("user_id", "created_at");
