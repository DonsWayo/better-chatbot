CREATE TABLE IF NOT EXISTS "asafe_team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "asafe_team_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asafe_team_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(20) DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "asafe_team_member_team_id_user_id_unique" UNIQUE("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asafe_usage_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"team_id" uuid,
	"session_id" text,
	"model" varchar(120) NOT NULL,
	"provider" varchar(60) NOT NULL,
	"task_class" varchar(30),
	"tier" varchar(20),
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asafe_team_budget" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"budget_usd" numeric(12, 2) NOT NULL,
	"used_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"alert_threshold_pct" integer DEFAULT 80 NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "asafe_team_budget_team_id_unique" UNIQUE("team_id")
);
--> statement-breakpoint
ALTER TABLE "asafe_team_member" ADD CONSTRAINT "asafe_team_member_team_id_asafe_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."asafe_team"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "asafe_team_member" ADD CONSTRAINT "asafe_team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "asafe_usage_event" ADD CONSTRAINT "asafe_usage_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "asafe_usage_event" ADD CONSTRAINT "asafe_usage_event_team_id_asafe_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."asafe_team"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "asafe_team_budget" ADD CONSTRAINT "asafe_team_budget_team_id_asafe_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."asafe_team"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asafe_usage_event_user_id_idx" ON "asafe_usage_event" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asafe_usage_event_team_id_idx" ON "asafe_usage_event" ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asafe_usage_event_created_at_idx" ON "asafe_usage_event" ("created_at");
