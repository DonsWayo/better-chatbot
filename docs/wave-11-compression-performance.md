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

- [ ] Decide compression approach: TS reimplementation vs. headroom Python sidecar; document tradeoffs (ops, latency, fidelity) and pick one.
- [ ] Implement compression middleware at the `streamText` seam; apply to tool outputs, RAG context, and long history; make aggressiveness configurable per team/policy.
- [ ] Extend/consolidate caching (semantic + response/embedding) with correct per-user/team isolation.
- [ ] Measure token reduction and quality delta on the eval set; set the no-regression gate.
- [ ] Feed compression/caching savings into the Wave 3 usage ledger and Wave 12 dashboards.
- [ ] Tests: compression reduces tokens with no eval regression beyond threshold; verbatim-required cases bypass compression; cache isolation holds.

## Acceptance criteria

- [ ] Given compression enabled, when requests run, then tokens drop measurably with no quality regression beyond the agreed threshold, and cost-per-message falls vs. the Wave 2 baseline.
- [ ] Given a verbatim-required case, when configured to bypass, then context is not compressed.
- [ ] Cache hits return correct, isolated results; savings appear in usage reporting.
- [ ] `pnpm check && pnpm test` green; eval comparison report attached.

## Open questions

- [Eng] TS port vs. Python sidecar for compression — which fits ops better?
- [Product] Default compression aggressiveness and which cases must stay verbatim.
