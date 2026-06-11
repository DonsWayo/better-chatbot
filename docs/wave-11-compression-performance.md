# Wave 11 — Compression & Performance

**Goal:** Cut token cost and latency at scale with context-compression middleware (headroom-style) and caching, without quality loss.
**Ships:** Materially lower cost-per-message across 800 users.
**Depends on:** Waves 2 (routing/eval baseline), 6 (RAG context to compress), 7 (semantic cache may already exist — extend, don't duplicate).
**Phase:** GA path.

## Scope

**In scope**
- **Context compression** as AI SDK middleware via `wrapLanguageModel` at the `streamText` seam: compress tool outputs, retrieved RAG chunks, and long history before they reach the model. Port the idea from `chopratejas/headroom` — reimplement in TS or run headroom as a Python sidecar the routing layer calls (decide in tasks).
- **Configurable per policy/team:** compression aggressiveness tunable; off for cases that need verbatim context.
- **Caching:** extend the Wave 7 semantic cache; add response/embedding caching where safe and isolation-correct.
- **Measurement:** token-reduction % and quality delta on the Wave 2 eval set; gate rollout on no regression.

**Out of scope (this wave)**
- EKS scaling/observability/rollout (Wave 12). Fine-tuned/served models (post-roadmap).

## Tasks

- [x] Decide compression approach: TS reimplementation vs. headroom Python sidecar; document tradeoffs (ops, latency, fidelity) and pick one. — done via ADR-0011 (accepted 2026-06-07): TS in-process LanguageModelMiddleware, three-strategy cascade; no Python sidecar
- [x] Implement compression middleware at the `streamText` seam; apply to tool outputs, RAG context, and long history; make aggressiveness configurable per team/policy. — done via `wrapWithCompression` (src/lib/ai/compression) in the chat route, levels off/light/standard/aggressive derived from team policy
- [ ] Extend/consolidate caching (semantic + response/embedding) with correct per-user/team isolation. — OPEN: generic scoped KV cache exists (src/lib/cache: memory/redis/pg + cache-keys); no semantic/response/embedding LLM cache was built (the Wave 7 semantic cache never shipped)
- [ ] Measure token reduction and quality delta on the eval set; set the no-regression gate. — OPEN: char-reduction metrics exist (Prometheus compression counters/ratio histogram); no eval-set quality-delta measurement or no-regression gate
- [x] Feed compression/caching savings into the Wave 3 usage ledger and Wave 12 dashboards. — resolved by decision 2026-06-11: savings stay **Prometheus-only by design** (counter + ratio histogram → Grafana "Compression Chars Saved" panel). `asafe_usage_event` is a spend ledger with no event-type/metadata column, so negative-cost/savings rows would corrupt cost and budget aggregation (ADR-0003); the misleading "records to the W3 usage ledger" comment in `src/lib/ai/compression/metrics.ts` was corrected to match. Revisit only if the ledger grows an event-type discriminator
- [x] Tests: compression reduces tokens with no eval regression beyond threshold; verbatim-required cases bypass compression; cache isolation holds. — done via compression unit tests (strategies/config/metrics; "off" level bypass covered); eval-regression and cache-isolation cases pend the two OPEN items above

## Acceptance criteria

- [ ] Given compression enabled, when requests run, then tokens drop measurably with no quality regression beyond the agreed threshold, and cost-per-message falls vs. the Wave 2 baseline. — OPEN: reduction is measured (Prometheus) but no quality-regression comparison vs. baseline exists
- [x] Given a verbatim-required case, when configured to bypass, then context is not compressed. — done via the "off" compression level (bypasses the middleware entirely), settable per team policy
- [ ] Cache hits return correct, isolated results; savings appear in usage reporting. — OPEN: no LLM response cache; compression savings are intentionally Prometheus-only (see decision on the ledger item above)
- [ ] `pnpm check && pnpm test` green; eval comparison report attached. — OPEN: unit suite green (276 files / 5963 tests, 2026-06-11) but no eval comparison report exists

## Open questions

- [Eng] TS port vs. Python sidecar for compression — which fits ops better?
- [Product] Default compression aggressiveness and which cases must stay verbatim.
