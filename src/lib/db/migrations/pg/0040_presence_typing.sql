-- Electric realtime phase 4: typing indicators ride the existing presence
-- heartbeat row (no extra table, no extra shape).
ALTER TABLE "asafe_presence" ADD COLUMN IF NOT EXISTS "typing" boolean NOT NULL DEFAULT false;
