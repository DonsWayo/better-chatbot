-- W8: Compliance — audit log + acceptable-use acknowledgment column

-- Immutable append-only audit log (EU AI Act Art. 13/26 logging requirement)
CREATE TABLE IF NOT EXISTS "asafe_audit_log" (
  "id"          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"     text        NOT NULL,
  "team_id"     uuid,
  "event_type"  text        NOT NULL,
  "details"     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);

-- Index for admin audit queries (by user, by type, by time)
CREATE INDEX IF NOT EXISTS "asafe_audit_log_user_id_idx"      ON "asafe_audit_log" ("user_id");
CREATE INDEX IF NOT EXISTS "asafe_audit_log_event_type_idx"   ON "asafe_audit_log" ("event_type");
CREATE INDEX IF NOT EXISTS "asafe_audit_log_created_at_idx"   ON "asafe_audit_log" ("created_at" DESC);

-- Prevent UPDATE/DELETE on audit rows (logical constraint — enforce via app policy)
-- Real immutability would be TimescaleDB compression or a separate append-only role.

-- GDPR / EU AI Act: acceptable-use acknowledgment timestamp
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "accepted_aup_at" timestamptz;
