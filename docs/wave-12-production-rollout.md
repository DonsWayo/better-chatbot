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

- [ ] Make and document the hosting decision; finalize the chosen deployment (harden Vercel+Neon **or** ship EKS manifests/Helm with HPA).
- [ ] If migrating DB: validate Neon → RDS/Aurora (pgvector) path in staging; confirm EU region; cut over with backup/restore tested.
- [ ] Size and tune Postgres (+pgvector HNSW, ensure pgvector ≥ patched version), Redis, storage; disable scale-to-zero on prod.
- [ ] Build Grafana dashboards + Sentry alerting for the full metric set (latency, errors, cost, budget burn, guardrails, cache, routing mix).
- [ ] Add rate limiting, provider-outage fallback/degradation, DB pooling, backpressure.
- [ ] Stand up the ongoing eval harness + feedback-driven quality monitoring (uses Wave 9 ratings); drift watch.
- [ ] Write runbooks (incident, rollback, kill switch); configure backups/restore for DB + embeddings; test restore.
- [ ] Obtain Security/Legal GA sign-off (Wave 8 posture + audit + GDPR/AI-Act); record it.
- [ ] Load test to expected peak concurrency; tune; document headroom.
- [ ] Execute phased rollout (pilot → departments → all 800) with comms owner and a tested kill switch.

## Acceptance criteria

- [ ] The hosting decision is documented and the chosen deployment runs in production (EU data residency intact).
- [ ] Given peak load, when load-tested, then latency/error SLOs hold and the app scales horizontally.
- [ ] Given a provider outage, when it occurs, then the platform degrades gracefully (fallback/clear messaging).
- [ ] Grafana dashboards + Sentry alerts live for latency, errors, cost, budget burn, guardrails, cache, routing mix.
- [ ] Security/Legal GA sign-off recorded; runbooks, tested backups, and a kill switch exist.
- [ ] Phased rollout to all 800 is complete or scheduled with a tested plan; eval/quality monitoring is running.
- [ ] `pnpm check && pnpm test` green; load-test report attached.

## Open questions

- [Eng/IT] Final hosting: stay Vercel+Neon vs. migrate app to EKS; DB on Neon-EU vs. RDS/Aurora-EU.
- [IT] Peak concurrency assumptions; backup retention; SLO targets.
- [Product] Rollout sequence and comms owner.
