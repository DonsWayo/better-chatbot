# ADR-0006: Hosting & EU data residency

**Status:** Accepted (direction set 2026-06-07: EKS-first)
**Date:** 2026-06-07
**Deciders:** IT, Security, Engineering
**Gates:** Wave 1 (first deploy), Wave 8 (residency), Wave 12 (scale/harden)

## Context

A Safe already runs on **AWS / EKS** and wants the platform on its **own infrastructure from day
one** for control and in-house data governance. This **overrides the upstream/spec default**
("Vercel + Neon first, decide EKS at Wave 12"): we deploy to **EKS for the first deploy**. The
stack is standard Next.js 16 + Postgres + (later) pgvector, so this costs nothing in app-code
portability — only deployment plumbing.

Two hard constraints from A Safe:
- **EKS is the first deploy target** (not Vercel).
- **Local docker-compose must always work** — every contributor runs the full stack locally with
  `docker/compose.yml`; EKS work must never break the local path.

Plus the standing EU/GDPR constraint (Wave 8): all data stays in an EU region.

## Decision

- **App runs on AWS EKS** as a container from day one. Use the existing `docker/Dockerfile`
  (Next.js **standalone** output) and add a **Helm chart** under `deploy/helm/` (Deployment,
  Service, Ingress via AWS ALB, HPA, ConfigMap, Secret refs, and a **DB-migration Job /
  initContainer** that runs `db:migrate` on rollout). Plain manifests under `deploy/k8s/` as an
  alternative for environments without Helm.
- **Local dev = docker-compose, always green.** `docker/compose.yml` (app + Postgres [+ Redis])
  stays a first-class, tested path. CI keeps building the image and smoke-running compose.
- **Database = self-managed cloud-native Postgres on EKS (EU)** using a **custom AI-native image**
  (`timescaledb-ha`: **pgvector + pgvectorscale + timescaledb**), run via a Postgres operator
  (CloudNativePG or Zalando postgres-operator — Spilo-based, fits the timescaledb-ha image) or a
  StatefulSet. **Not RDS/Aurora** (they lack timescaledb/pgvectorscale), **not Neon, not Vercel.**
  Same engine in dev (docker-compose) and prod.
- **Cache = Redis via ElastiCache** (EU) in prod; in-cluster Redis acceptable for the pilot.
- **Object storage = S3** (EU bucket) via the existing `file-storage` **S3 driver**
  (`FILE_STORAGE_TYPE=s3`). **Vercel Blob is not used.**
- **Secrets** via **AWS Secrets Manager** surfaced with the **External Secrets Operator** (or
  IRSA + `envFrom`); never in images or git. **Images** in **ECR**.
- **EU residency end-to-end:** EKS nodes, the in-cluster Postgres, ElastiCache, and S3 all in one EU region
  (e.g. `eu-west-1` Ireland, `eu-central-1` Frankfurt, or `eu-south-2` Spain — IT picks).
- **Observability** to A Safe's stack: `/health` + `/metrics` (Prometheus) + Sentry DSN — all
  net-new (only `consola` logging exists today).
- **Wave 12 is re-scoped** from "decide Vercel vs EKS" (already decided) to "harden, autoscale,
  load-test, and finalize SLOs on EKS."

## Options Considered

### Option A: EKS-first + docker-compose for local (chosen — A Safe direction)
| Dimension | Assessment |
|-----------|------------|
| Control / residency | Strongest — all AWS-EU, in-house |
| Ops burden | Higher up front (Helm, self-managed PG, secrets, ECR, CI deploy) |
| Fit with A Safe | Native — existing EKS/AWS platform & ops model |
| Migration later | None — no second move |

**Pros:** matches the existing platform and Security's in-house-data preference from day one; no
later Vercel→EKS migration; a single residency story. **Cons:** more infra before the pilot than
the Vercel path; we own cluster/DB/secrets plumbing immediately.

### Option B: Vercel + Neon first, migrate to EKS at Wave 12 (original spec default)
**Pros:** fastest pilot, lowest initial ops. **Cons:** a US PaaS in the data path; a guaranteed
later migration; two residency reviews. **Rejected** at A Safe's direction.

### Option C: docker-compose only
The local/dev path (kept) — not a production answer for 800 users. Used *alongside* A, not instead.

## Trade-off Analysis

The classic argument for Vercel-first is speed-to-pilot; A Safe explicitly trades that for
**control, in-house data governance, and avoiding a second migration**. Because the app is plain
containerized Next.js and the DB is plain Postgres+pgvector, EKS-first adds **deployment** work
(Helm, self-managed PG, secrets, CI) but **no app-code lock-in** — and it removes the Wave 12 migration
entirely. Keeping docker-compose first-class guarantees contributors aren't forced through
Kubernetes to run the app locally.

## Consequences

- **Easier:** one residency story (all AWS-EU); fits existing ops; Security gets in-house control
  on day one; no later migration; ADR-0001's GA case for **direct-EU inference** (Azure OpenAI EU
  under the same Microsoft tenant) gets stronger and simpler.
- **Harder:** Wave 1 now includes real Helm/manifests, a cloud-native Postgres (operator + AI-native image), ElastiCache, ECR, secret
  management, and a CI deploy path — more than the Vercel one-click. We keep **two** run paths
  green (EKS + compose).
- **Revisit:** Postgres operator choice (CloudNativePG vs Zalando) and ElastiCache-vs-in-cluster sizing at Wave 12 scale; inference
  posture at Wave 4 (ADR-0001).

## Open inputs needed (from IT)

- **EKS:** target cluster/namespace; ingress (AWS ALB Ingress Controller?); node-group sizing.
- **DB:** Postgres operator (CloudNativePG vs Zalando postgres-operator) for the in-cluster cloud-native PG; CNPG/Spilo-compatible AI-native image; storage class/size; backup (Barman/volume snapshots); EU region.
- **Cache/storage:** ElastiCache vs in-cluster Redis; S3 bucket + IAM (IRSA) for the app.
- **Secrets/CI:** AWS Secrets Manager + External Secrets vs IRSA; ECR repo; deploy pipeline
  (GitHub Actions → ECR → `helm upgrade`).

## Action items

1. [ ] (W1) Confirm Next.js **standalone** output builds an EKS-ready image; push to ECR.
2. [ ] (W1) Add `deploy/helm/` chart (Deployment, Service, ALB Ingress, HPA, Config/Secret, migration Job) + `deploy/k8s/` manifests.
3. [ ] (W1) Keep `docker/compose.yml` green (app + Postgres [+ Redis]); document local run.
4. [ ] (W1/W6) Stand up **cloud-native Postgres on EKS** (operator + custom AI-native image: vector/pgvectorscale/timescaledb); wire `POSTGRES_URL` via secrets.
5. [ ] (W1) Set `FILE_STORAGE_TYPE=s3` + EU bucket + IAM; ElastiCache (or in-cluster) Redis; document env.
6. [ ] (W1) `/health` + `/metrics` + Sentry DSN; ship logs/metrics to A Safe's Prometheus/Grafana + Sentry.
7. [ ] (W1) CI: build image → ECR → `helm upgrade` to a staging namespace; smoke e2e against it.
8. [ ] (W12) Load-test, autoscale (HPA), finalize SLOs on EKS.
