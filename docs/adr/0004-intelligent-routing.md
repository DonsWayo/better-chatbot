# ADR-0004: Intelligent routing design

**Status:** Proposed
**Date:** 2026-06-07
**Deciders:** Product, Engineering
**Gates:** Wave 2

## Context

Upstream is "user picks a model from a dropdown." The platform's headline value (overview goal #3)
is **right model, right task**: choose the model per request to cut blended cost with no quality
regression. The seam is `customModelProvider.getModel(chatModel)` at `route.ts:78`; today it just
maps `{provider, model}` → an AI SDK model, with a `fallbackModel` when none is given. There is no
"Auto" mode.

The Wave 2 open question is **rules-first vs. an LLM-classifier** for v1, plus the task taxonomy
and tier mapping.

## Decision

- **Ship a deterministic rules engine for v1.** Inputs: declared/inferred **task class**, whether
  tools/MCP are attached, whether vision/multimodal input is present, message length/complexity,
  and the team's model **allow-list** (ADR-0002/W4). Output: a chosen model **+ a rationale
  string**, both recorded.
- **Typed contract in `app-types/`** (Zod): `RoutingRequest` → `RoutingDecision { model, tier,
  taskClass, reason, fallbackOf? }`.
- **Policy config maps `taskClass → ordered candidate models`** each tagged with a **tier**
  (`frontier | mid | cheap`) and capability flags (tools, vision, context window). All candidates
  are resolvable via the ADR-0001 transport.
- **"Auto" becomes the default option in the model picker;** manual override keeps working exactly
  as before (if the user picks a concrete model, routing is bypassed).
- **Fallback/retry per policy:** on provider error/rate-limit, fall to the next candidate in the
  tier list and mark `fallbackOf`.
- **Record every decision** (model, taskClass, tier, reason, fallback?) as a structured log line +
  a metric (ADR-0006). Full cost accounting is ADR-0003.
- **LLM-classifier tier is built but gated behind a flag** (`ROUTING_CLASSIFIER_ENABLED`), off for
  v1; enabling it is a deferred decision (see README).

### Initial task taxonomy (v1)
`code` · `reasoning_analysis` · `long_context` · `quick_rewrite` (short edits/format/translate) ·
`vision_multimodal` · `tool_agent` (tool/MCP-heavy) · `general_chat`.

### Initial tier mapping (illustrative — final IDs from the ADR-0001 short list)
| Task class | Tier | Why |
|------------|------|-----|
| code, reasoning_analysis | frontier | quality-sensitive |
| long_context | frontier/mid by length | context window + cost |
| tool_agent, general_chat | mid | good enough, cheaper |
| quick_rewrite | cheap | trivial, latency-sensitive |
| vision_multimodal | (model with vision) | capability gate overrides tier |

## Options Considered

### Option A: Rules/heuristics first, classifier behind a flag (recommended)
| Dimension | Assessment |
|-----------|------------|
| Complexity | Low | 
| Explainability | High — deterministic, testable, auditable rationale |
| Latency | Zero added (no extra model call) |
| Cost | No routing-time inference cost |

**Pros:** deterministic unit tests; transparent rationale users can see; no added latency or
spend to *decide*; easy to tune. **Cons:** coarser than a classifier on ambiguous prompts.

### Option B: LLM-classifier first
**Pros:** finer task detection. **Cons:** adds a model call (latency + cost + a failure mode) to
every request; non-deterministic → harder to test and to explain; over-engineered for v1.

### Option C: Embedding-similarity router (route by nearest labelled exemplar)
**Pros:** cheap-ish, learnable. **Cons:** needs an embedding call + a curated exemplar set we
don't have yet; opaque rationale. Defer.

## Trade-off Analysis

For an internal tool, **explainability and zero added latency** beat marginal routing accuracy:
users (and auditors, Wave 8) can see *why* a model was chosen, and we can unit-test the routing
deterministically (a Wave 2 acceptance criterion). The classifier's upside is real but
unmeasured; building it behind a flag lets us A/B it against the rules on the Wave 2 eval set
before paying its latency/cost on every request.

## Consequences

- **Easier:** transparent, testable routing; trivial to add a task class or re-tier a model;
  fallback improves resilience.
- **Harder:** rules need occasional tuning; "inferred task class" heuristics are imperfect (the
  flagged classifier is the escape hatch).
- **Revisit:** enable the classifier tier once the eval set shows rules leaving quality/cost on
  the table.

## Open inputs needed

- **[Product]** Confirm the task taxonomy and the tier mapping against the ADR-0001 short list.
- **[Product/Eng]** The agreed quality-regression threshold for the routed-vs-frontier eval.

## Action items

1. [ ] (W2) Define `RoutingRequest`/`RoutingDecision` Zod types in `app-types/`.
2. [ ] (W2) Implement the rules engine + policy config; wire it at `route.ts:78`, preserving manual override.
3. [ ] (W2) Add "Auto" to the model picker; surface chosen model + reason in message metadata.
4. [ ] (W2) Fallback/retry on provider error; emit routing metrics + structured decision logs.
5. [ ] (W2) Build the fixed eval set + a routed-vs-frontier comparison script (cost + quality).
6. [ ] (W2) Implement the classifier tier behind `ROUTING_CLASSIFIER_ENABLED` (default off).
