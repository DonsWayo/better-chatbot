-- B90: approval requests, workflow schedules, audit actor attribution
CREATE TABLE IF NOT EXISTS "approval_request" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "agent_session"("id") ON DELETE CASCADE,
  "step_index" integer NOT NULL,
  "payload" jsonb,
  "requested_role" varchar NOT NULL DEFAULT 'team-admin',
  "status" varchar NOT NULL DEFAULT 'pending',
  "decided_by" uuid,
  "reason" text,
  "requested_at" timestamp NOT NULL DEFAULT now(),
  "decided_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_request_session_id_idx" ON "approval_request" ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_request_status_idx" ON "approval_request" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_schedule" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workflow_id" uuid NOT NULL,
  "revision_pin" varchar NOT NULL DEFAULT 'latest',
  "pinned_revision_id" uuid,
  "cron_expr" text NOT NULL,
  "timezone" text NOT NULL DEFAULT 'UTC',
  "enabled" boolean NOT NULL DEFAULT true,
  "input_template" jsonb,
  "team_id" uuid REFERENCES "asafe_team"("id") ON DELETE SET NULL,
  "created_by" uuid NOT NULL,
  "last_run_at" timestamp,
  "next_run_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_schedule_due_idx" ON "workflow_schedule" ("enabled", "next_run_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_schedule_team_id_idx" ON "workflow_schedule" ("team_id");
--> statement-breakpoint
ALTER TABLE "asafe_audit_log" ADD COLUMN IF NOT EXISTS "actor_type" varchar NOT NULL DEFAULT 'human';
--> statement-breakpoint
ALTER TABLE "asafe_audit_log" ADD COLUMN IF NOT EXISTS "agent_session_id" uuid;
