CREATE TABLE IF NOT EXISTS asafe_rate_limit_bucket (
  user_id TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_bucket_user ON asafe_rate_limit_bucket (user_id, window_start);
