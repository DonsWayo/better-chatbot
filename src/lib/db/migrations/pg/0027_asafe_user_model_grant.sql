-- W5: per-user model grants
-- Allows admins to override a team's model allow-list for specific users.
-- expiresAt NULL means the grant is permanent.
CREATE TABLE IF NOT EXISTS "asafe_user_model_grant" (
  "id"          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"     text        NOT NULL,
  "model_id"    text        NOT NULL,
  "granted_by"  text        NOT NULL,
  "expires_at"  timestamptz,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_user_model_grant" UNIQUE ("user_id", "model_id")
);

CREATE INDEX IF NOT EXISTS "idx_user_model_grant_user_id"
  ON "asafe_user_model_grant" ("user_id");
