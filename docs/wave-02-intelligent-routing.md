# Wave 2 — Intelligent Routing

**Goal:** Add a task-aware routing layer that chooses the model per request (instead of the user picking from a dropdown), routing through OpenRouter, with a safe fallback to explicit user choice.
**Ships:** Cheaper blended cost and better per-task quality, transparent to the user.
**Depends on:** Wave 1.
**Phase:** MVP.

## Scope

**In scope**
- A routing module that, given a request (messages, declared/inferred task type, attached tools, user/team policy), returns a chosen model + rationale.
- Integration at the model-resolution seam (`src/app/api/chat/route.ts` ~L78, `customModelProvider.getModel`).
- A routing policy config: map task categories → preferred models, with cost/latency/capability tiers, all reachable via OpenRouter.
- "Auto" as the default model option in the UI; users may still override to a specific model.
- Routing decisions recorded (model chosen, reason, task class) for later analysis — emitted as metrics/logs (full usage accounting is Wave 3).
- Graceful fallback + retries: if a chosen model errors/over-capacity, fall back per policy.

**Out of scope (this wave)**
- Budget enforcement and cost accounting (Wave 3) — routing only *records* decisions here.
- Compression (Wave 8). Per-team policy *overrides* (Wave 4) — Wave 2 ships a single global policy.

## Tasks

- [ ] Define routing inputs/outputs as a typed contract (Zod) in `app-types/`.
- [ ] Implement a routing strategy: start rules/heuristics-based (task class, tool use, message length/complexity, attachments) — keep it simple and explainable; an LLM-classifier tier is optional and gated behind a flag.
- [ ] Build a policy config (task class → ordered model candidates with tier metadata), all OpenRouter model IDs.
- [ ] Wire routing into the chat route at the `getModel` seam; preserve the existing manual-selection path when the user picks a specific model.
- [ ] Add "Auto" as the default selectable option in the model picker UI; show the chosen model + reason in the message metadata.
- [ ] Implement fallback/retry per policy on provider error/rate-limit.
- [ ] Emit routing metrics (chosen model, task class, fallback occurred) to Prometheus; structured log line per decision.
- [ ] Create a small fixed eval set (representative prompts) and a script to compare routed vs. always-frontier on quality + cost.
- [ ] Unit tests for the routing strategy (deterministic for rule-based cases); e2e: "Auto" produces a streamed answer and records a decision.

## Acceptance criteria

- [ ] Given "Auto" mode, when a user sends a coding task vs. a quick rewrite, then different models are chosen per policy, and the chosen model + reason are visible in message metadata.
- [ ] Given a chosen model that errors, when the request runs, then it falls back per policy and still returns an answer.
- [ ] Given the eval set, when routed vs. always-frontier are compared, then blended cost drops with no quality regression beyond an agreed threshold.
- [ ] A manual model override still works exactly as before.
- [ ] Routing decisions appear in metrics/logs; `pnpm check && pnpm test` green.

## Deferred to later waves

- Per-team/per-user policy overrides (Wave 4), cost ledger (Wave 3), compression (Wave 8), fine-tuned/served models behind the OpenAI-compatible seam (post-roadmap).

## Open questions

- [Product/Eng] Rules-only for v1, or include an LLM-classifier tier from the start? (Default: rules-only; flag the classifier.)
- [Product] What are the initial task classes and the model tier mapping?
