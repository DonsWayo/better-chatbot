-- W9: Per-team guardrail policy + multimodal feature gates

ALTER TABLE "asafe_team"
  ADD COLUMN IF NOT EXISTS "guardrail_policy" varchar(20) NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS "allow_image_gen"  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "allow_vision"     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "allow_speech"     boolean NOT NULL DEFAULT false;
