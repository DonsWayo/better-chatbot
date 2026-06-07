-- asafe-ai local dev: enable the AI-native Postgres extension stack on first DB init.
--
-- NOTE (ADR-0006/0007): RDS/Aurora do NOT support TimescaleDB or pgvectorscale. A timescale-
-- capable PRODUCTION DB therefore means Timescale Cloud (EU) or self-managed Postgres on EKS,
-- not RDS/Aurora. pgvector alone is available on RDS/Aurora. Confirm the prod DB at Wave 6/12.

CREATE EXTENSION IF NOT EXISTS vector;             -- pgvector: RAG embeddings (Wave 6)
CREATE EXTENSION IF NOT EXISTS timescaledb;        -- time-series: usage metering (Wave 3)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements; -- query performance insight

-- pgvectorscale (fast disk-backed vector index) — best-effort: present in timescaledb-ha,
-- tolerated if a future image lacks it so DB init never fails.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vectorscale CASCADE;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'vectorscale not installed, skipping: %', SQLERRM;
END $$;
