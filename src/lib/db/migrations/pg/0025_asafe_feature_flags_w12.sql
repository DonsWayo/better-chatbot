-- W12: feature flags table (kill switch + future operator toggles)
CREATE TABLE IF NOT EXISTS "asafe_feature_flag" (
  "name"       text PRIMARY KEY,
  "enabled"    boolean NOT NULL DEFAULT false,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Seed the kill_switch row so operators can toggle it without a schema migration
INSERT INTO "asafe_feature_flag" ("name", "enabled")
VALUES ('kill_switch', false)
ON CONFLICT ("name") DO NOTHING;
