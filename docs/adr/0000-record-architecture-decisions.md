# ADR-0000: Record architecture decisions

**Status:** Accepted
**Date:** 2026-06-07
**Deciders:** Engineering

## Context

`asafe-ai` is a long-lived fork of `better-chatbot` built across 12 sequenced waves by a rotating
set of contributors (and AI agents). Decisions made early — how a "team" is modelled, whether
inference goes through OpenRouter, what embedding dimension we pick — ripple through later waves
and are expensive to reverse once code and data depend on them. We need a durable, low-ceremony
record of *why* each such decision was made, so future contributors don't re-litigate settled
questions or unknowingly violate a constraint.

## Decision

We keep lightweight **Architecture Decision Records** in `docs/adr/`, one Markdown file per
decision, using the format below. We write an ADR when a decision is **architecturally
significant**: it is cross-cutting, hard to reverse, touches the schema or the core request path,
or requires sign-off from Security / Legal / IT / Finance.

We do **not** write ADRs for routine, easily-reversible choices (library helpers, component
structure, copy). Those live in code and PR review.

## Format

```
# ADR-NNNN: Title
**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-XXXX
**Date:** YYYY-MM-DD
**Deciders:** [roles who must sign off]
## Context        — situation and forces
## Decision       — what we're doing (decisive)
## Options Considered — A/B/C with an assessment table + pros/cons
## Trade-off Analysis — the crux of why
## Consequences   — what gets easier / harder / must be revisited
## Open inputs needed — facts we still need + from whom (omit if none)
## Action items   — concrete, checkboxed, mapped to waves
```

## Lifecycle

1. New ADR starts **Proposed** with a recommendation.
2. Named deciders ratify → **Accepted**. The gated wave does not start before this.
3. A reversal does not edit history: the old ADR becomes **Superseded by ADR-XXXX**, and the new
   ADR references it.

## Consequences

- Onboarding and upstream-merge reviews have a single place to learn "why is it like this."
- Each wave's "Open questions" (in the wave specs) get a durable home and an owner.
- Small overhead per significant decision; none for routine ones.

## Action items

1. [x] Establish `docs/adr/` and this meta-ADR.
2. [ ] Ratify ADR-0001…0008 with their named deciders before the waves they gate.
