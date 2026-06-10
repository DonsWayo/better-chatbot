-- Unified visibility model (docs/design/visibility-model.md), step 2:
-- workflow/agent now store the LITERAL four-level visibility
-- ('private' | 'shared' | 'team' | 'company') instead of the legacy
-- public/private/readonly mapping. The column is a plain varchar (the enum
-- lives in Drizzle, not Postgres), so no DDL is needed — this is a pure,
-- idempotent data rewrite:
--   * 'public'                            → 'company' (org-wide)
--   * 'private' with non-empty team_ids   → 'team' (teamIds carried the signal)
--   * 'readonly' stays as-is — the resolver treats it as company capped at
--     view for non-owners; there is no four-level equivalent to rewrite to.
UPDATE "workflow" SET "visibility" = 'company' WHERE "visibility" = 'public';
--> statement-breakpoint
UPDATE "agent" SET "visibility" = 'company' WHERE "visibility" = 'public';
--> statement-breakpoint
UPDATE "workflow" SET "visibility" = 'team'
  WHERE "visibility" = 'private'
    AND "team_ids" IS NOT NULL
    AND jsonb_typeof("team_ids") = 'array'
    AND jsonb_array_length("team_ids") > 0;
--> statement-breakpoint
UPDATE "agent" SET "visibility" = 'team'
  WHERE "visibility" = 'private'
    AND "team_ids" IS NOT NULL
    AND jsonb_typeof("team_ids") = 'array'
    AND jsonb_array_length("team_ids") > 0;
