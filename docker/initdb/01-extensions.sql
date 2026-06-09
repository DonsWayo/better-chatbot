-- asafe-ai local dev: enable the AI-native Postgres extension stack on first DB init.
--
-- NOTE (ADR-0006): production uses the SAME engine — a self-managed cloud-native Postgres on EKS
-- with this AI-native image (via a Postgres operator: CloudNativePG or Zalando). NOT RDS/Aurora
-- (they lack timescaledb / pgvectorscale). So these extensions exist in both dev and prod.

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
