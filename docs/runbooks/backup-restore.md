# Runbook: Database Backup & Restore

**System:** Asafe AI — PostgreSQL (TimescaleDB/pgvector)  
**Environment:** EKS + AWS RDS Aurora PostgreSQL (EU West 1) or Neon EU  
**Audience:** On-call, Platform Eng, DBA

---

## Backup strategy

| Asset | Method | Frequency | Retention |
|---|---|---|---|
| PostgreSQL database | Automated snapshots (RDS) or Neon branching | Daily + before each release | 7 days (daily), 1 year (weekly) |
| pgvector embeddings | Included in DB backup (same schema) | Same as DB | Same as DB |
| S3 file attachments | S3 Versioning + AWS Backup | Continuous | 90 days versions, 7 years cold |
| Application secrets | AWS Secrets Manager versioning | On change | Indefinite |

> **Neon users:** branching is instant and free — create a branch before any destructive migration or major release.

---

## Verify backups are running

### RDS
```bash
# List recent automated snapshots
aws rds describe-db-cluster-snapshots \
  --db-cluster-identifier asafe-ai-prod \
  --snapshot-type automated \
  --query 'DBClusterSnapshots[*].{Id:DBClusterSnapshotIdentifier,Status:Status,Created:SnapshotCreateTime}' \
  --output table
```

### Neon
Log in to Neon console → Project → Branches. Confirm the `main` branch exists and has a recent restore-point timestamp.

---

## Restore procedures

### Scenario 1: Point-in-time restore (RDS)

```bash
# 1. Find the snapshot or choose a point in time
SNAPSHOT_ARN="arn:aws:rds:eu-west-1:<account>:cluster-snapshot:asafe-ai-prod-<date>"
RESTORE_TIME="2026-06-01T12:00:00Z"  # or use snapshot

# 2. Restore to new cluster
aws rds restore-db-cluster-to-point-in-time \
  --db-cluster-identifier asafe-ai-prod-restore-test \
  --restore-type full-copy \
  --source-db-cluster-identifier asafe-ai-prod \
  --restore-to-time "${RESTORE_TIME}" \
  --vpc-security-group-ids sg-XXXX \
  --db-subnet-group-name asafe-ai-db-subnet

# 3. Wait for restore to complete
aws rds wait db-cluster-available \
  --db-cluster-identifier asafe-ai-prod-restore-test

# 4. Run smoke verification (see below)
# 5. When satisfied, update app to point at the restored cluster
# 6. Delete the damaged original after the cutover window
```

### Scenario 2: Restore from pg_dump (any Postgres)

```bash
# Dump from source
pg_dump \
  --no-password \
  --format=custom \
  --compress=9 \
  --file=asafe-ai-$(date +%Y%m%d).dump \
  "$POSTGRES_URL"

# Restore to target
pg_restore \
  --no-password \
  --clean \
  --if-exists \
  --format=custom \
  --dbname="$TARGET_POSTGRES_URL" \
  asafe-ai-$(date +%Y%m%d).dump
```

### Scenario 3: Neon branch restore

1. Go to Neon Console → Project → Branches
2. Click **Restore** on the `main` branch
3. Select the restore point (timestamp or named branch)
4. Neon creates a new branch at that point — test it
5. Promote the test branch to `main` if verified

---

## Post-restore verification

```bash
# Connect to restored DB
psql "$RESTORED_POSTGRES_URL"

-- Check row counts on critical tables
SELECT table_name, (SELECT count(*) FROM information_schema.tables WHERE table_name = t.table_name) AS approx_count
FROM (VALUES
  ('user'),
  ('thread'),
  ('message'),
  ('asafe_usage_event'),
  ('asafe_guardrail_event'),
  ('asafe_message_feedback')
) AS t(table_name);

-- Check pgvector extension is present
SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector', 'timescaledb', 'vectorscale');

-- Check recent usage data present (should not be all-zero after restore)
SELECT count(*) FROM asafe_usage_event WHERE created_at > NOW() - INTERVAL '7 days';
```

Then run the application smoke test:
```bash
curl -f https://asafe.internal.asafe.example/api/health
```

Expected response: `{"status":"ok",...}`

---

## Embeddings restore note

Embeddings are stored in the `document_chunk` table (pgvector `embedding` column) inside the same database. They are automatically included in any full database backup/restore. No separate vector DB to restore.

After a restore, verify embeddings are intact:
```sql
SELECT count(*) FROM document_chunk WHERE embedding IS NOT NULL;
```

If embeddings are missing (e.g., partial restore), re-run the ingestion pipeline for each Knowledge collection via Admin → Knowledge → Re-index.

---

## Escalation

| Situation | Action |
|---|---|
| Backup missing > 24h | Page on-call DBA + AWS Support |
| Restore taking > 2h | Escalate to A Safe Platform Eng |
| Data loss confirmed | Activate incident P1, notify Legal/DPO within 72h (GDPR Art. 33) |
