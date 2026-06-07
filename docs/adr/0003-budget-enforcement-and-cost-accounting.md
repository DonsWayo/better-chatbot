# ADR-0003: Budget enforcement & cost accounting

**Status:** Proposed
**Date:** 2026-06-07
**Deciders:** Finance (policy), Product, Engineering
**Gates:** Wave 3 — the MVP cut line

## Context

Wave 3 is the MVP cut line: per-team monthly budgets, per-user/per-request usage accounting, a
self-serve usage view, and an admin spend dashboard. Two useful facts:

- **Usage is already captured.** The chat route reads `totalUsage` from the AI SDK finish event
  and persists it in message metadata (`route.ts` onFinish ~L343). We are adding a *ledger and an
  enforcement gate* on top of an existing signal — not building metering from zero.
- **No money tables exist** — no `usage_event`, no `team_budget`, no price table.

Decisions to lock: (1) the **enforcement policy** (block vs warn vs override), (2) the **cost
source of truth** (our own price table vs. OpenRouter's reported costs), (3) **reset cadence &
currency**.

A Safe is Spain-based → default currency **EUR**.

## Decision

- **Tables (per ADR-0002, FK to `team`/`user`):**
  - `usage_event` — one row per request: user, team, model, input/output tokens, computed cost,
    currency, task class (from ADR-0004), thread ref, timestamp.
  - `team_budget` — team, period (calendar month, UTC), limit, currency, `allow_overage` flag.
  - `model_price` — model → input/output price per 1M tokens, currency, effective-from date.
- **Cost source of truth = our own `model_price` table**, admin-editable, seeded from a maintained
  config; **OpenRouter's reported cost is captured alongside as a cross-check**, not the source.
  Rationale: ADR-0001 may move us to direct providers at GA, at which point OpenRouter's numbers
  vanish but our ledger must keep working — so the price table must be ours.
- **Enforcement policy (configurable per team):** soft-**warn at 80%** of budget (banner + return
  metadata), hard-**block at 100%** with a clear message naming who to contact, and a per-team
  **`allow_overage` override** that converts the block into a logged warning. Defaults:
  warn 80% / block 100% / override off.
- **Where it runs:** budget *check* before the stream starts (in the chat route, after team
  resolution, before `streamText`); budget *debit* on `onFinish` by writing the `usage_event`.
  Both have the session and team in scope already.
- **Reset:** calendar month, UTC. **Currency:** EUR (single currency for v1).

## Options Considered

### Cost source — Option A: own price table (recommended)
**Pros:** survives a provider/transport switch (ADR-0001); single number Finance can audit;
works for direct providers and Ollama. **Cons:** we maintain the table when prices change.

### Cost source — Option B: trust OpenRouter's reported cost
**Pros:** zero maintenance, exact for OpenRouter traffic. **Cons:** breaks the moment we route to
a direct provider or a self-hosted model; couples our ledger to one vendor's API shape.

### Cost source — Option C: hybrid (own table primary, reconcile vs OpenRouter) — **chosen blend**
Own table is the ledger; OpenRouter's number is stored for drift detection and price-table
maintenance alerts.

### Enforcement — A: hard block · B: warn-only · C: block-with-override (recommended default mix)
| Dimension | Hard block | Warn-only | Configurable (recommended) |
|-----------|-----------|-----------|------------|
| Cost safety | High | Low | High |
| User friction | High | None | Tunable |
| Finance comfort | High | Low | High |
| Pilot fit | Risky (lockouts) | Risky (overruns) | Best |

Configurable per-team (warn 80% / block 100% / optional override) gives Finance a hard ceiling
while letting a critical team be granted overage without a code change.

## Trade-off Analysis

The cost-source choice is the one with long legs: tying the ledger to OpenRouter (Option B) saves
a small maintenance burden now but guarantees rework at GA if ADR-0001 moves us to direct EU
providers. Owning the price table decouples "what a request cost us" from "who we bought it
from." For enforcement, a single global policy can't serve both a cost-sensitive pilot and a
business-critical team; making warn/block/override per-team (stored, not coded) is the
configurability the spec asks for.

## Consequences

- **Easier:** Finance sees attributable spend without engineering; budgets are enforceable;
  metering reuses the existing `totalUsage` signal.
- **Harder:** someone owns price-table upkeep; we must handle the streaming-already-started case
  (debit always happens on finish even if it tips a team over — block is pre-flight, debit is
  post-flight).
- **Revisit:** multi-currency and chargeback exports (out of scope for W3) when Finance needs them.

## Open inputs needed

- **[Finance]** Confirm policy defaults (warn 80% / hard block 100% / override) and reset = calendar month.
- **[Finance]** Confirm EUR as the single currency for v1.
- **[Product]** The "who to contact when blocked" target (a team-admin? a Slack channel?).

## Action items

1. [ ] (W3) Add `usage_event`, `team_budget`, `model_price` to `schema.pg.ts`; migrate.
2. [ ] (W3) Seed `model_price` for the ADR-0001 short list; document the update procedure.
3. [ ] (W3) Pre-flight budget check after team resolution, before `streamText` (warn/block per policy).
4. [ ] (W3) Write `usage_event` on `onFinish` from `totalUsage`; compute cost from `model_price`; store OpenRouter cost as cross-check.
5. [ ] (W3) Self-serve usage page (SWR) + admin spend dashboard (by team/user/model + CSV); emit budget/usage metrics (ADR-0006).
