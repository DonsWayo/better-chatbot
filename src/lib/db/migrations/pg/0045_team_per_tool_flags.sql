ALTER TABLE "asafe_team" ADD COLUMN IF NOT EXISTS "allow_web_search" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "asafe_team" ADD COLUMN IF NOT EXISTS "allow_code_exec" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "asafe_team" ADD COLUMN IF NOT EXISTS "allow_http" boolean DEFAULT true NOT NULL;
