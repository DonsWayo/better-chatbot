-- Org-wide model entitlements (ERP price-list style):
--   1. asafe_org_settings: tiny key-value store (jsonb value) for global org
--      settings. First key: "org_base_model_allow_list" — the BASE model
--      allow-list applied to everyone (absent/null = no restriction).
--   2. asafe_team.model_policy: per-team override that LAYERS on the base:
--      { mode: "inherit" | "replace", add?: string[], remove?: string[], models?: string[] }
--        "inherit"  → base + add − remove
--        "replace"  → exactly `models`
--      NULL model_policy + legacy non-empty model_allow_list is treated as
--      { mode: "replace", models: model_allow_list } for backward compat.
CREATE TABLE IF NOT EXISTS "asafe_org_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" jsonb,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asafe_team" ADD COLUMN IF NOT EXISTS "model_policy" jsonb;
