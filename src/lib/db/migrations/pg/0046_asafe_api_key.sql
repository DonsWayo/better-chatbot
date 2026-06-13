CREATE TABLE IF NOT EXISTS "asafe_api_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"name" text NOT NULL,
	"created_by" text NOT NULL,
	"team_id" uuid,
	"scopes" jsonb DEFAULT '["*"]'::jsonb NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "asafe_api_key_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asafe_api_key" ADD CONSTRAINT "asafe_api_key_team_id_asafe_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."asafe_team"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asafe_api_key_key_hash_idx" ON "asafe_api_key" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asafe_api_key_team_id_idx" ON "asafe_api_key" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asafe_api_key_created_by_idx" ON "asafe_api_key" USING btree ("created_by");
