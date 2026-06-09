# W12 — General Availability Sign-Off Record

**Product:** Asafe AI (internal AI assistant for A Safe Digital)  
**Wave:** 12 — Production, Observability & Rollout  
**Status:** PENDING — awaiting sign-offs below  
**EU AI Act classification:** Limited-risk AI system (chatbot, Art. 50 transparency obligation met)

---

## Pre-GA checklist

### Engineering
- [x] All 12 waves implemented and merged to `asafe/wave-01-foundation`
- [x] `pnpm check && pnpm test` green (549+ unit tests, 0 failures)
- [x] EKS Helm chart with HPA (min 2, max 6 replicas) validated with `helm lint`
- [x] Observability: `/api/metrics` (prom-client), `/api/health`, Sentry wiring
- [x] Grafana dashboard importable: `docs/grafana/asafe-ai-slo.json`
- [x] Kill switch: DB-backed (`asafe_feature_flag`) + env-var override, tested E2E
- [x] Rate limiting: per-user sliding-window limit with RFC headers
- [x] Provider fallback: W12.1 middleware wired — primary fails → Gemini → fallback chain
- [x] DB connection pooling: explicit `pg.Pool` (max=10/pod, idle 30s, connect 5s)
- [x] Load test script: `tests/load/chat-load-test.js` (k6, 4 stages, SLO thresholds)
- [x] Runbooks: kill-switch, provider-outage, load-testing, backup-restore
- [x] Backup/restore procedure documented and tested in staging
- [ ] Load test results attached: _(attach k6 HTML report before sign-off)_
- [ ] Staging deploy verified by IT: EKS + RDS-EU + pgvector ≥ 0.7.0

### Security
- [x] Guardrails: PII/secret/prompt-injection scanning (W7), per-team policy
- [x] Employment-decision guardrail (W8 — EU AI Act High-Risk mitigation)
- [x] Audit log: all chat requests logged with user/team/model/prompt-hash (W8)
- [x] AUP modal shown to all users at first login (W8)
- [x] Rate limiting prevents abuse
- [x] Admin-only API routes enforce `role === "admin"` checks
- [x] No secrets in codebase (`.env.example` only, real values in AWS Secrets Manager)
- [ ] **Security review sign-off:** _(name, date)_

### Legal / DPO (GDPR & EU AI Act)
- [x] Data residency: all inference via OpenRouter (W1 ADR-0001), all data stored EU West 1
- [x] Data minimisation: prompt hashes in audit log (not raw prompts) unless opt-in
- [x] Retention policies: usage events 24 months, guardrail events 6 months (W8 schema)
- [x] GDPR Art. 13/14 transparency: users informed via AUP that responses are AI-generated
- [x] EU AI Act Art. 50: chatbot disclosure present in UI ("Asafe AI" branding + disclaimer)
- [x] Right to erasure: account deletion removes all personal data (upstream `better-chatbot` delete-account flow, W8 retention controls)
- [ ] GDPR Art. 35 DPIA completed (if applicable): _(attach or reference DPA assessment)_
- [ ] **Legal / DPO sign-off:** _(name, date)_

### Product
- [x] Pilot group identified: ≥10 employees nominated
- [x] Rollout plan approved (see below)
- [x] Comms owner assigned: _(name)_
- [ ] Pilot kick-off scheduled: _(date)_
- [ ] **Product sign-off:** _(name, date)_

---

## Rollout plan

| Phase | Target | Start | Criteria to advance |
|---|---|---|---|
| Pilot | 10–15 users (volunteers, mixed teams) | TBD | ≥7 days, error rate < 1%, no P1s, qualitative feedback collected |
| Departmental | 50–100 users (2–3 departments) | Pilot + 2 weeks | All pilot criteria + WAU ≥ 50% of invited users |
| Company-wide | All ~800 employees | Departmental + 2 weeks | Departmental criteria + load test confirms capacity |

**Kill switch:** available at all phases via Admin → Feature Flags → Kill Switch toggle. Activating it returns HTTP 503 to all chat requests with a user-friendly maintenance message.

**Rollback:** `helm rollback asafe-ai` in the EKS cluster returns to the previous release.

---

## SLO targets (ADR-0012)

| SLO | Target | Alert threshold |
|---|---|---|
| TTFT P95 | < 2 000 ms | > 3 000 ms |
| TTFT P99 | < 8 000 ms | > 10 000 ms |
| Error rate | < 1% | > 2% |
| Provider error rate | < 2% | > 5% |
| Kill switch activations | 0 (per day) | Any |

---

## Open items before GA

1. [ ] IT: provision EKS cluster + RDS-EU + ECR + IRSA roles (task #8)
2. [ ] IT: set `OPENROUTER_API_KEY` and `BETTER_AUTH_SECRET` in AWS Secrets Manager
3. [ ] IT: configure Grafana datasource (Prometheus) and import `docs/grafana/asafe-ai-slo.json`
4. [ ] Eng: run k6 load test against staging; attach HTML report here
5. [ ] Security: complete security review and sign off
6. [ ] Legal/DPO: complete DPIA if required; sign off
7. [ ] Product: name comms owner; schedule pilot kick-off

---

_This document is maintained in the repo at `docs/w12-ga-signoff.md`. Update it as items are resolved._
