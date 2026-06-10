-- Agent Platform #21 (docs/design/agent-platform.md): the execution spine.
--   agent_session — one governed execution of an agent/workflow revision.
--     definition_id is polymorphic (agent OR workflow) → deliberately no FK.
--     revision_id / folder_id gain FKs once those tables land (#19 / #17).
--   agent_step — per-node checkpoint; UNIQUE(session_id, step_index) is the
--     upsert/resume key (NODE_START inserts running, NODE_END completes it).
CREATE TABLE IF NOT EXISTS "agent_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar NOT NULL,
	"definition_id" uuid NOT NULL,
	"revision_id" uuid,
	"team_id" uuid REFERENCES "asafe_team"("id") ON DELETE SET NULL,
	"user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"folder_id" uuid,
	"origin_surface" varchar DEFAULT 'web' NOT NULL,
	"mode" varchar DEFAULT 'interactive' NOT NULL,
	"status" varchar DEFAULT 'queued' NOT NULL,
	"cost_so_far" real DEFAULT 0 NOT NULL,
	"input_payload" jsonb,
	"error" text,
	"parent_session_id" uuid REFERENCES "agent_session"("id") ON DELETE SET NULL,
	"heartbeat_at" timestamp,
	"started_at" timestamp,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL REFERENCES "agent_session"("id") ON DELETE CASCADE,
	"node_id" text NOT NULL,
	"node_kind" text,
	"step_index" integer NOT NULL,
	"status" varchar DEFAULT 'running' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"cost_usd" real DEFAULT 0 NOT NULL,
	"started_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"ended_at" timestamp,
	CONSTRAINT "agent_step_session_id_step_index_unique" UNIQUE("session_id","step_index")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_session_user_id_idx" ON "agent_session" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_session_team_id_idx" ON "agent_session" ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_session_status_idx" ON "agent_session" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_session_parent_session_id_idx" ON "agent_session" ("parent_session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_step_session_id_idx" ON "agent_step" ("session_id");
