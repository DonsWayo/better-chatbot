# Wave 8 — Compliance, Audit & Lifecycle (EU / GDPR / AI Act) (GA-blocking)

**Goal:** Make the platform legally deployable to ~800 employees in the EU: a complete audit trail, defined retention, GDPR data-subject handling, EU AI Act deployer posture, and identity lifecycle (joiner/mover/leaver) so access is correct and revocable.
**Ships:** Compliance-by-design; Security/Legal can sign off on company-wide rollout.
**Depends on:** Waves 1–7 (auth/teams, guardrails feed the audit log).
**Phase:** GA path — **GA gate. As an EU employer-deployer, do not roll out broadly without this.**

## Why this exists (situation-specific)

A Safe Digital is an EU (Spain) employer. Two regimes apply and are additive:
- **GDPR** — lawful basis, DPIA, data-subject rights (access/export/erasure), records of processing, EU data residency, processor DPAs.
- **EU AI Act (deployer / Article 26)** — general application from Aug 2026; obligations include human oversight, logging/retention (≥6 months for high-risk logs), and informing workers/representatives before deploying AI at the workplace. **Article 50 transparency:** users must be told they're interacting with AI. **Critical guardrail:** keep this tool out of high-risk "employment decision" use (hiring, performance, disciplinary) — that classification triggers heavy high-risk obligations. Make that boundary explicit in product and policy.

This is not legal advice — confirm specifics with Legal/DPO. The point is to build the controls now so they're available when needed.

## Scope

**In scope**
- **Audit log:** immutable record of prompts, model actions, tool/MCP invocations, RAG retrievals, guardrail firings, and admin actions — who/what/when, queryable by admins.
- **Retention policy:** configurable retention for conversations and logs; default ≥6 months for audit logs; documented deletion schedule.
- **GDPR data-subject handling:** per-user data export and erasure flows; records of processing; EU **data residency** (Neon EU region + EU storage); DPAs with providers/processors.
- **EU AI Act posture:** in-product AI-use disclosure (Article 50); a documented worker/works-council notification step; an explicit policy + technical guardrail that the tool is **not** used for automated employment decisions; human-oversight affordances.
- **Identity lifecycle:** SCIM (or IdP-driven) provisioning/deprovisioning so leavers lose access and movers get correct team/permissions automatically.
- **Acceptable-use policy** surfaced in-product (accept on first login).

**Out of scope (this wave)**
- Becoming a high-risk AI system (explicitly avoided by policy/scoping). Full FRIA (only if scope ever expands into high-risk use).

## Tasks

- [ ] Implement the audit log (append-only) capturing prompts, tool/MCP calls, RAG retrievals, guardrail events, admin actions; admin query UI; ensure it integrates Wave 7 guardrail events.
- [ ] Implement configurable retention + scheduled deletion for conversations and logs; default audit retention ≥6 months; document the schedule.
- [ ] Build GDPR flows: per-user data export and erasure; maintain a record of processing; verify EU data residency end to end.
- [ ] Confirm + configure **Neon EU region** (and EU object storage); sign DPAs with Neon and any inference provider; document the data-flow map.
- [ ] Add in-product AI-use disclosure (Article 50) and an acceptable-use acknowledgment on first login.
- [ ] Add a policy + technical guard preventing use for automated employment decisions; document worker/representative notification step for IT/HR to execute pre-rollout.
- [ ] Implement SCIM (or IdP webhook) provisioning/deprovisioning; verify a deactivated employee loses access promptly and a team change re-scopes permissions.
- [ ] Tests: audit captures a full request lifecycle; export/erasure work for a user; a deprovisioned user is denied; retention deletes on schedule.

## Acceptance criteria

- [ ] Given any AI interaction, when it completes, then a complete, queryable audit record exists (prompt, tools, retrievals, guardrails, model, user, team, time).
- [ ] Given a data-subject request, when an admin runs export or erasure for a user, then their data is exported/erased per GDPR.
- [ ] Given an employee who leaves, when deprovisioned via the IdP, then their access is revoked promptly and verifiably.
- [ ] Given the EU posture, when data is stored/processed, then it stays in the EU region with DPAs in place.
- [ ] Users see an AI-use disclosure and accept the acceptable-use policy; employment-decision use is technically/contractually blocked.
- [ ] `pnpm check && pnpm test` green; compliance e2e green.

## Open questions

- [Legal/DPO] Lawful basis (likely legitimate interest) + DPIA; final retention periods; works-council/representative notification process.
- [Security] Audit access controls + retention vs. minimization balance.
- [IT] SCIM source of truth and deprovisioning SLA.
