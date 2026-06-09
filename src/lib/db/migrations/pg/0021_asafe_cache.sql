CREATE TABLE IF NOT EXISTS asafe_kv_cache (
  key TEXT NOT NULL PRIMARY KEY,
  value JSONB NOT NULL,
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_kv_cache_expires ON asafe_kv_cache (expires_at)
  WHERE expires_at IS NOT NULL;
