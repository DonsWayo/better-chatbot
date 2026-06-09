CREATE TABLE IF NOT EXISTS "asafe_prompt_template" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text,
  "content" text NOT NULL,
  "category" varchar(100),
  "author_id" uuid REFERENCES "user"("id") ON DELETE SET NULL,
  "team_id" uuid REFERENCES "asafe_team"("id") ON DELETE CASCADE,
  "visibility" varchar DEFAULT 'private' NOT NULL,
  "is_featured" boolean DEFAULT false NOT NULL,
  "usage_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_template_author_idx" ON "asafe_prompt_template" ("author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prompt_template_team_idx" ON "asafe_prompt_template" ("team_id");
