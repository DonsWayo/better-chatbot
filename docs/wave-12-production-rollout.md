# Wave 12 — Production, Observability & Rollout

**Goal:** Harden, observe, scale, and roll the platform out to all ~800 employees — and make the deliberate call on whether to stay on Vercel+Neon or migrate the app to A Safe's EKS.
**Ships:** General Availability.
**Depends on:** Waves 1–9 (7 & 8 are GA gates; 10 desktop optional for web GA; 11 recommended before broad rollout for cost).
**Phase:** GA.

## The hosting decision (resolve here)

Waves 1–11 run happily on **Vercel + Neon** (the easy path, upstream's default). At company scale, decide deliberately:
- **Stay on Vercel + Neon** — lowest ops burden; ensure Neon EU region, no scale-to-zero on the prod branch, and cost is acceptable at 800-user volume.
- **Migrate the app to EKS** (A Safe's existing platform) — more control, fits existing ops/cost model, and may be required if Security wants full in-house data control. Because the stack is standard Next.js + Postgres + pgvector, **Neon → AWS RDS/Aurora (both support pgvector) is a clean migration with no schema rewrite.**
- Likely answer: start and pilot on Vercel+Neon (Waves 1–3+), migrate app to EKS for GA if scale/cost/governance demand it, keeping Postgres on Neon-EU or moving to RDS/Aurora-EU per the Wave 8 data-residency decision.

## Scope

**In scope**
- **Hosting finalization** per the decision above (Vercel+Neon hardened, or EKS via the Wave 1 manifest stubs).
- **Scaling:** horizontal app scale; sized Postgres (+pgvector, prod-tuned HNSW, no scale-to-zero), Redis, object storage; load test to peak concurrency.
- **Observability & SLOs:** Grafana dashboards (latency, errors, tokens, cost, routing mix, budget burn, guardrail firings, cache hit rate); Sentry; alerts.
- **Reliability:** rate limiting, provider-outage degradation/fallback, DB pooling, backpressure, backup/restore (DB + embeddings).
- **Model/quality monitoring:** ongoing eval harness + feedback-driven (Wave 9) quality tracking; drift watch.
- **GA sign-off & rollout:** Security/Legal sign-off (posture, audit, GDPR/AI-Act from Wave 8); runbooks; kill switch; phased rollout (pilot → departments → all 800) with comms.

**Out of scope (this wave)**
- New product features. Fine-tuned/served models (post-roadmap, behind the OpenAI-compatible seam).

## Tasks

- [x] Make and document the hosting decision; finalize the chosen deployment (harden Vercel+Neon **or** ship EKS manifests/Helm with HPA). — done via ADR-0006 (EKS-first, overrides the Vercel default) + Helm chart deploy/helm/asafe-ai (web, worker, Electric, migrate job, HPA, ingress) + deploy/k8s ExternalSecrets; live at ai.conek.dev
- [x] If migrating DB: validate Neon → RDS/Aurora (pgvector) path in staging; confirm EU region; cut over with backup/restore tested. — N/A: Neon was never adopted (ADR-0006, EKS from day one); Postgres is IT-provisioned via ExternalSecrets POSTGRES_URL (EU region owned by IT)
- [ ] Size and tune Postgres (+pgvector HNSW, ensure pgvector ≥ patched version), Redis, storage; disable scale-to-zero on prod. — OPEN: pgvector HNSW index shipped (migration 0017) and explicit pg Pool sizing exists, but DB/Redis/storage sizing and tuning are infra actions outside the repo
- [ ] Build Grafana dashboards + Sentry alerting for the full metric set (latency, errors, cost, budget burn, guardrails, cache, routing mix). — OPEN: SLO dashboard shipped (docs/grafana/asafe-ai-slo.json: latency/TTFT, errors, kill switch, fallback, rate-limit, routing, compression) + Sentry wired (src/instrumentation.ts), but cost, budget-burn, guardrail and cache panels/alert rules are missing
- [x] Add rate limiting, provider-outage fallback/degradation, DB pooling, backpressure. — done via PG-backed rate limiting (asafe_rate_limit_bucket, enforced in chat route), provider fallback middleware (src/lib/ai/fallback, retry on 5xx/network), explicit pg Pool (src/lib/db/pg/db.pg.ts); backpressure is rate-limit + active-request gauge only
- [x] Stand up the ongoing eval harness + feedback-driven quality monitoring (uses Wave 9 ratings); drift watch. — done via admin Quality dashboard (W9 feedback), routing eval fixtures (src/lib/ai/routing/eval), opt-in real-LLM tier (vitest.llm.config.ts, tests/eval); automated drift watch not implemented
- [x] Write runbooks (incident, rollback, kill switch); configure backups/restore for DB + embeddings; test restore. — done via docs/runbooks (kill-switch, provider-outage, backup-restore, load-testing) + kill-switch lib/observability; restore drill on real infra still pending IT
- [ ] Obtain Security/Legal GA sign-off (Wave 8 posture + audit + GDPR/AI-Act); record it. — OPEN: external organizational step (Security/Legal), not yet recorded
- [ ] Load test to expected peak concurrency; tune; document headroom. — OPEN: k6 script (tests/load/chat-load-test.js) + runbook exist; not yet executed at peak concurrency, no headroom report
- [ ] Execute phased rollout (pilot → departments → all 800) with comms owner and a tested kill switch. — OPEN: organizational rollout/comms decision; kill switch exists but the phased rollout has not been executed

## Acceptance criteria

- [x] The hosting decision is documented and the chosen deployment runs in production (EU data residency intact). — done via ADR-0006 + Helm; running at ai.conek.dev on EKS (EU-region attestation owned by IT)
- [ ] Given peak load, when load-tested, then latency/error SLOs hold and the app scales horizontally. — OPEN: HPA shipped but the load test has not been executed
- [x] Given a provider outage, when it occurs, then the platform degrades gracefully (fallback/clear messaging). — done via wrapWithFallback retry-on-retryable-error chain + provider-outage runbook + fallback SLO counter
- [ ] Grafana dashboards + Sentry alerts live for latency, errors, cost, budget burn, guardrails, cache, routing mix. — OPEN: SLO dashboard + Sentry exist, but cost/budget-burn/guardrail/cache panels and alert rules are missing
- [ ] Security/Legal GA sign-off recorded; runbooks, tested backups, and a kill switch exist. — OPEN: runbooks + kill switch shipped; sign-off not recorded and restore untested
- [ ] Phased rollout to all 800 is complete or scheduled with a tested plan; eval/quality monitoring is running. — OPEN: quality monitoring is shipped; the rollout itself is an organizational action not yet executed/scheduled
- [ ] `pnpm check && pnpm test` green; load-test report attached. — OPEN: unit suite green (276 files / 5963 tests, 2026-06-11) but no load-test report attached

## Open questions

- [Eng/IT] Final hosting: stay Vercel+Neon vs. migrate app to EKS; DB on Neon-EU vs. RDS/Aurora-EU.
- [IT] Peak concurrency assumptions; backup retention; SLO targets.
- [Product] Rollout sequence and comms owner.
