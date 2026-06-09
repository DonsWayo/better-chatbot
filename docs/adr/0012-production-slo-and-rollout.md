# ADR-0012: Production SLO Targets, Kill Switch & Rollout Strategy

**Status:** Accepted (2026-06-08, Wave 12)
**Deciders:** Engineering, Product, IT/A Safe
**Gates:** Wave 12 (GA)

## Context

Wave 12 is GA rollout to ~800 employees. We need:
1. **Measurable SLO targets** so Grafana alerts have thresholds
2. **A kill switch** that operators can activate without a deploy
3. **A phased rollout plan** to contain blast radius

## SLO Targets

| Signal | SLO | Source metric |
|--------|-----|---------------|
| TTFT P95 | < 2 000 ms | `asafe_ai_ttft_ms` histogram |
| TTFT P99 | < 8 000 ms | `asafe_ai_ttft_ms` histogram |
| Chat error rate | < 1% of requests over 5-min window | `asafe_chat_errors_total` / total |
| Provider error rate | < 2% per provider | `asafe_ai_provider_errors_total` |
| Kill switch activations | 0 (alert on any > 0) | `asafe_ai_kill_switch_activations_total` |
| Active requests | < 200 (alert at 150) | `asafe_ai_active_requests` |

SLO targets are intentionally relaxed for early GA. Tighten after 4 weeks of production data.

## Kill Switch Decision

We implement the kill switch as a **DB-backed feature flag** (`asafe_feature_flag` table) with a 5-second in-process cache, plus an `ASAFE_KILL_SWITCH=1` environment-variable override for emergency pod-level control.

**Reasoning:**
- DB-backed: no deploy required to activate/deactivate; all pods pick up the change within 5 s
- Env-var: escape hatch if the DB itself is the problem (but requires a pod restart to activate)
- Fail-open: DB read errors never trigger the kill switch — inference continues on DB failure

## Provider Fallback Decision

Wave 12 defers cross-provider automatic fallback to W12.1. The AI SDK's built-in `maxRetries: 2` handles transient errors. The `asafe_ai_provider_errors_total` metric provides observability for manual escalation.

**Rationale:** Automatic mid-stream provider switching requires a streaming proxy layer that introduces latency and complexity. The routing layer's `candidates` array is in place for future use; the circuit-breaker pattern will be implemented once real-world error patterns are observed in production.

See the [provider-outage runbook](../runbooks/provider-outage.md) for manual fallback procedure.

## Rollout Plan

### Phase 1 — Pilot (Week 1)
- 10–15 volunteer employees across Engineering, Product, Security
- Objective: surface auth, routing, and UX friction before broad rollout
- Acceptance: < 5 user-reported bugs, SLOs green for 48 h

### Phase 2 — Departmental (Weeks 2–3)
- Engineering team (50–100 people) → then expand to Product + Security
- Each department gets 1 week of soak time
- Escalation path: Slack `#asafe-ai-feedback` → product owner

### Phase 3 — All-company (Week 4+)
- Announce via email + Slack `#company-announcements`
- Help desk runbook distributed to IT support
- Kill switch tested and verified before announcement

### Rollback
1. Activate kill switch (≤ 5 s, no deploy)
2. Notify `#asafe-incidents`
3. Investigate via Grafana + Sentry
4. Fix + verify in staging, then deactivate kill switch

## Hosting Decision

Waves 1–12 are developed and tested on EKS (plain Node.js). The stack is standard Next.js + PostgreSQL + pgvector with no edge runtime dependencies. The Helm chart and k8s manifests from Wave 1 are the target deployment artifact.

Database: TimescaleDB/PostgreSQL on the existing A Safe data platform (EU region, pgvector ≥ 0.7.0 for HNSW support). Neon is not used; a managed pg instance on the existing A Safe data plane handles all persistence.

## Consequences

**Positive:**
- SLO targets give Grafana a quantitative basis for alerts from day one
- Kill switch gives operators sub-10-second global control during incidents
- Phased rollout limits blast radius; feedback from Phase 1 shapes Phase 2 config

**Negative:**
- Provider fallback is manual in W12 — a serious provider outage requires operator action
- SLO targets will need revision after observing real traffic patterns (they're estimates)

## Open items

- [ ] [IT] Confirm pgvector version on production DB ≥ 0.7.0
- [ ] [IT] Configure Grafana datasource and import `docs/grafana/asafe-ai-slo.json`
- [ ] [Security/Legal] GA sign-off — record here once received
- [ ] [Product] Nominate rollout comms owner for all-company phase
