-- W8: AUP acceptance log (GDPR / EU AI Act Article 50 transparency record)
-- Records that each user was shown and accepted the Acceptable Use Policy.
CREATE TABLE IF NOT EXISTS "asafe_aup_acceptance" (
  "id"           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      TEXT        NOT NULL,
  "aup_version"  TEXT        NOT NULL DEFAULT '1.0',
  "accepted_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("user_id", "aup_version")
);
CREATE INDEX IF NOT EXISTS "idx_aup_user_id" ON "asafe_aup_acceptance" ("user_id");
