# Wave 7 — Security, Safety & Guardrails (GA-blocking)

**Goal:** Put runtime guardrails between users and models — DLP/PII redaction, secret/proprietary-code blocking, prompt-injection and system-prompt-leakage defenses, content safety — enforced centrally and scoped per team. Plus semantic caching for cost/latency.
**Ships:** The platform is safe to expand beyond a pilot; sensitive data does not leak to providers.
**Depends on:** Waves 1–4 (routing seam + teams to scope policies). Slots into the routing/`streamText` seam.
**Phase:** GA path — **this is a GA gate. Do not roll out to the whole company without it.**

## Why this exists

For an internal tool that 800 people will paste real client/company data into, guardrails are a regulatory and operational requirement, not a nice-to-have. Target the OWASP LLM risks: prompt injection (LLM01), sensitive-data leakage (LLM02), system-prompt leakage (LLM07), excessive agency (LLM06). "Safe enablement" (governed access) is what actually kills shadow AI — bans just push it underground.

## Scope

**In scope**
- **Input guardrails:** PII detection + redaction/masking (emails, phones, national IDs, card numbers), secret/credential detection, proprietary-code/keyword blocking — applied before the prompt reaches any provider.
- **Output guardrails:** content-safety filtering; system-prompt-leakage prevention; optional topic restriction.
- **Prompt-injection / tool-abuse defenses:** treat tool/MCP/RAG content as untrusted; constrain tool "agency" (what an agent may do without confirmation).
- **Per-team guardrail policies:** stricter for some teams/use-cases, looser for others — config-driven, no code change to adjust.
- **Performance-safe enforcement:** run guardrails efficiently (sampling/async where appropriate) so they don't block the stream; log every firing.
- **Semantic/prompt caching** to cut cost and latency on repeated queries.

**Out of scope (this wave)**
- Full compliance/audit/retention machinery (Wave 8 — though guardrail firings feed it). Model drift/eval monitoring (Wave 12).

## Tasks

- [ ] Implement an input guardrail stage at the request path (before provider call): PII/secret/proprietary detection with configurable action (redact/mask/block/warn).
- [ ] Implement an output guardrail stage: content safety + system-prompt-leakage checks before returning to the user.
- [ ] Harden against prompt injection: mark tool/MCP/RAG outputs as untrusted; add a confirmation gate for high-agency tool actions.
- [ ] Make guardrail policy per-team (extend Wave 4 policy model); allow different strictness by team/use-case.
- [ ] Ensure enforcement is latency-safe (sampling/async/timeout) so it never blocks the stream; record every guardrail event.
- [ ] Add semantic/prompt caching keyed safely (respect per-user/per-team isolation); measure hit rate and savings.
- [ ] Emit guardrail metrics (firings by type/team) to Prometheus; alert on spikes.
- [ ] Tests: PII is redacted before egress; a blocked-secret prompt is stopped with a clear message; injected instructions in tool/RAG content do not hijack the agent; cache returns correct isolated results.

## Acceptance criteria

- [ ] Given a prompt containing PII or a secret, when it is sent, then the sensitive data is redacted/blocked per policy before any provider sees it, and the event is logged.
- [ ] Given malicious instructions embedded in a tool/RAG result, when processed, then they do not cause the agent to take unintended actions.
- [ ] Given two teams with different policies, when each sends the same risky prompt, then enforcement differs per their policy with no code change.
- [ ] Given guardrails enabled, when under load, then streaming latency stays within SLO (enforcement does not block).
- [ ] `pnpm check && pnpm test` green; guardrail e2e green.

## Open questions

- [Security] Which PII/secret classes are mandatory to redact vs. block? Which proprietary terms/repos?
- [Security] Build guardrails in-app vs. front them with an AI-gateway guardrail layer? (Decide with the posture choice from Wave 4.)
- [Product] Default per-team strictness baseline.
