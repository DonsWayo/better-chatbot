CREATE TABLE IF NOT EXISTS "asafe_message_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" text NOT NULL,
  "thread_id" text NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "rating" varchar NOT NULL,
  "comment" text,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_feedback_user_msg" ON "asafe_message_feedback" ("user_id", "message_id");
