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

- [x] Implement an input guardrail stage at the request path (before provider call): PII/secret/proprietary detection with configurable action (redact/mask/block/warn). — done via `wrapWithGuardrails` → `scanInput` (src/lib/ai/guardrails: scan/patterns/policies) with redact/block/warn/off actions per policy
- [x] Implement an output guardrail stage: content safety + system-prompt-leakage checks before returning to the user. — done via `scanOutput` system-prompt-leak scrubbing in wrapGenerate/wrapStream (`outputLeakProtection`); broader content safety rides on provider moderation
- [x] Harden against prompt injection: mark tool/MCP/RAG outputs as untrusted; add a confirmation gate for high-agency tool actions. — done via `scanToolOutput` + `spotlight` UNTRUSTED-block wrapping/blocking (src/lib/ai/guardrails/tool-output.ts, wired in shared.chat.ts) plus the `toolChoice: "manual"` confirmation gate in the chat route
- [x] Make guardrail policy per-team (extend Wave 4 policy model); allow different strictness by team/use-case. — done via `AsafeTeamTable.guardrailPolicy` (strict/standard/permissive) + `resolvePolicy`, admin-settable via PATCH /api/admin/teams/[id]
- [x] Ensure enforcement is latency-safe (sampling/async/timeout) so it never blocks the stream; record every guardrail event. — done via synchronous sub-ms regex scans + fire-and-forget, fail-open logging to `asafe_guardrail_event` (admin Guardrails page reads it)
- [ ] Add semantic/prompt caching keyed safely (respect per-user/per-team isolation); measure hit rate and savings. — OPEN: no semantic/prompt LLM-response cache exists; only the generic scoped KV cache (src/lib/cache)
- [ ] Emit guardrail metrics (firings by type/team) to Prometheus; alert on spikes. — OPEN: counters `guardrailFiringsTotal`/`guardrailBlocksTotal` are emitted (src/lib/observability/metrics.ts), but no Grafana guardrail panel or spike alert rule exists yet
- [x] Tests: PII is redacted before egress; a blocked-secret prompt is stopped with a clear message; injected instructions in tool/RAG content do not hijack the agent; cache returns correct isolated results. — done via scan/tool-output/policies/index unit tests + tests/asafe/admin-quality-guardrails.spec.ts; cache-isolation case N/A (no semantic cache, see above)

## Acceptance criteria

- [x] Given a prompt containing PII or a secret, when it is sent, then the sensitive data is redacted/blocked per policy before any provider sees it, and the event is logged. — done via transformParams scan before provider call + asafe_guardrail_event logging (covered by scan.test.ts/index.test.ts)
- [x] Given malicious instructions embedded in a tool/RAG result, when processed, then they do not cause the agent to take unintended actions. — done via spotlight/block of untrusted tool output (tool-output.test.ts) + ingest-scan on knowledge ingest
- [x] Given two teams with different policies, when each sends the same risky prompt, then enforcement differs per their policy with no code change. — done via team `guardrailPolicy` column → posture lookup; DB change only
- [ ] Given guardrails enabled, when under load, then streaming latency stays within SLO (enforcement does not block). — OPEN: non-blocking by design (sync regex + async logging) but not yet verified under load (load test not executed, see Wave 12)
- [x] `pnpm check && pnpm test` green; guardrail e2e green. — verified 2026-06-11: vitest 276 files / 5963 tests green; guardrail e2e in tests/asafe/admin-quality-guardrails.spec.ts

## Open questions

- [Security] Which PII/secret classes are mandatory to redact vs. block? Which proprietary terms/repos?
- [Security] Build guardrails in-app vs. front them with an AI-gateway guardrail layer? (Decide with the posture choice from Wave 4.)
- [Product] Default per-team strictness baseline.
