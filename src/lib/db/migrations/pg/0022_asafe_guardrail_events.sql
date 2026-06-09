-- W7: guardrail event log
-- Records every PII/secret/injection firing with the action taken.
-- Kept separate from the main audit trail (Wave 8) for performance.

CREATE TABLE IF NOT EXISTS "asafe_guardrail_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"blocked" boolean NOT NULL DEFAULT false,
	"firings" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "asafe_guardrail_event_user_id_idx" ON "asafe_guardrail_event" ("user_id");
CREATE INDEX IF NOT EXISTS "asafe_guardrail_event_created_at_idx" ON "asafe_guardrail_event" ("created_at");
