# ADR-0008: Guardrails & DLP placement

**Status:** Proposed
**Date:** 2026-06-07
**Deciders:** Security, Engineering
**Gates:** Wave 7 — GA gate (do not roll out company-wide without it)

## Context

800 people will paste real client/company data into this tool, so runtime guardrails are a
regulatory/operational requirement, not a feature. Target OWASP LLM risks: prompt injection
(LLM01), sensitive-data leakage (LLM02), excessive agency (LLM06), system-prompt leakage (LLM07).
The architectural question is **where** enforcement lives:

- **In-app**, as AI SDK middleware at the `streamText` seam, `wrapLanguageModel({ model,
  middleware })` (`route.ts:318`, session + team already in scope), co-located with the ADR-0003
  budget gate and the Wave 11 compression middleware; **or**
- **Out-of-app**, behind an **AI-gateway** guardrail layer that all traffic transits.

This is tied to ADR-0001 (if we adopt a gateway for transport, guardrails could ride on it).

## Decision

- **Build guardrails as in-app middleware at the `wrapLanguageModel` seam** for Wave 7, with two
  stages:
  - **Input stage (before any provider egress):** PII detection + redact/mask (emails, phones,
    national IDs incl. Spanish DNI/NIE, card numbers), secret/credential detection,
    proprietary-code/keyword blocking. Action configurable per team: **redact | mask | block |
    warn**.
  - **Output stage (before returning to the user):** content-safety filtering and
    **system-prompt-leakage** prevention; optional topic restriction.
- **Treat tool/MCP/RAG outputs as untrusted** (prompt-injection defense): isolate/label them and
  add a **confirmation gate for high-agency tool actions** (excessive-agency defense). This builds
  on the existing per-request tool-allow mechanism and Wave 5.
- **Per-team policy** via the ADR-0002 policy model — strictness is config, no code change.
- **Latency-safe:** run enforcement async/sampled with timeouts so it never blocks the stream;
  fail policy is explicit (fail-closed for block rules, fail-open with alert for advisory checks).
- **Log every firing** (type, team, action, redaction count — never the raw sensitive value) →
  feeds the Wave 8 audit log.
- **Keep the seam abstract** so an external AI-gateway guardrail layer can later replace or augment
  the in-app one without touching the chat route. Revisit if ADR-0001 GA adopts a gateway.
- **Semantic/prompt cache** (also Wave 7) lives behind the same seam, keyed with per-user/per-team
  isolation so a cache hit can never cross a tenant boundary.

## Options Considered

### Option A: In-app middleware at the streamText seam (recommended)
| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — we own detectors, but the seam exists |
| Latency control | Full — we choose async/sample/timeout |
| Context | Best — team/user/policy already in scope; co-located with budget + compression |
| Coupling | Low — no new external dependency for the GA gate |

**Pros:** one place holds budget + guardrails + compression; full control of latency strategy;
no extra infra to stand up before a GA gate; works regardless of ADR-0001 transport.
**Cons:** we maintain detector quality (PII/secret patterns, classifiers).

### Option B: AI-gateway guardrail layer (e.g. Vercel AI Gateway / LiteLLM / a DLP proxy)
**Pros:** centralized, reusable across apps, managed detectors. **Cons:** another component to
run/observe and keep EU-resident; less per-request team context than in-app; premature to make a
GA gate depend on it; partial overlap with what we already get from OpenRouter today.

### Option C: Hybrid — in-app for context-rich checks, gateway for coarse DLP
**Pros:** defense in depth. **Cons:** two policy systems to keep consistent; do this *later* if
volume justifies, not for the Wave 7 gate.

## Trade-off Analysis

The guardrail layer needs **per-team policy and untrusted-content context** that is richest
exactly where the request is assembled — the `streamText` seam already has the session, team,
tools, and RAG context in scope, and it is the same seam where budget (ADR-0003) and compression
(Wave 11) live. Putting guardrails there gives one coherent middleware stack and full latency
control, with no new infra to block the GA gate. A gateway's centralization is attractive at
multi-app scale, but making a *GA-blocking* control depend on standing up and EU-localizing
another component is the wrong risk for Wave 7. We therefore build in-app and keep the seam
abstract so a gateway can augment it later.

## Consequences

- **Easier:** coherent middleware stack (guard + budget + compress); per-team enforcement with no
  code change; firings feed Wave 8 audit directly.
- **Harder:** we own detector accuracy and must tune false-positive rates; must guarantee
  enforcement is latency-safe under load (a Wave 7 acceptance criterion).
- **Revisit:** add/replace with a gateway layer if ADR-0001 GA adopts one, or at multi-app scale.

## Open inputs needed

- **[Security]** Mandatory PII/secret classes to **redact** vs **block** (incl. Spanish DNI/NIE);
  proprietary terms/repos to block.
- **[Security]** Default per-team strictness baseline.
- **[Security]** In-app vs. gateway final call for GA (decide alongside ADR-0001 posture).

## Action items

1. [ ] (W7) Input guardrail stage at `wrapLanguageModel`: PII/secret/proprietary detect → redact/mask/block/warn (per-team).
2. [ ] (W7) Output guardrail stage: content safety + system-prompt-leak checks before returning.
3. [ ] (W7) Mark tool/MCP/RAG output untrusted; confirmation gate for high-agency actions.
4. [ ] (W7) Per-team policy in the ADR-0002 model; latency-safe enforcement (async/sample/timeout); log every firing (no raw PII).
5. [ ] (W7) Semantic/prompt cache with per-team isolation; measure hit rate + savings.
6. [ ] (W7) Emit guardrail metrics (firings by type/team) to Prometheus; alert on spikes.
