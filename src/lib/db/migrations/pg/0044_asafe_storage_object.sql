CREATE TABLE IF NOT EXISTS "asafe_storage_object" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"uploader_user_id" text NOT NULL,
	"team_id" uuid,
	"content_type" text,
	"size_bytes" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asafe_storage_object_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_storage_object_uploader_user_id" ON "asafe_storage_object" USING btree ("uploader_user_id");
