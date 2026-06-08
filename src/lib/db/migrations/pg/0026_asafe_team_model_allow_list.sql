-- W4: per-team model allow-list
-- Empty array (default) means all approved models are allowed.
-- Populated arrays restrict the team to those model IDs only.
ALTER TABLE "asafe_team"
  ADD COLUMN IF NOT EXISTS "model_allow_list" jsonb NOT NULL DEFAULT '[]'::jsonb;
