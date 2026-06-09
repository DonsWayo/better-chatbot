-- W5+: per-team email domain allow-list
-- Empty array means any domain is allowed.
ALTER TABLE "asafe_team"
  ADD COLUMN IF NOT EXISTS "allowed_email_domains" jsonb NOT NULL DEFAULT '[]'::jsonb;
