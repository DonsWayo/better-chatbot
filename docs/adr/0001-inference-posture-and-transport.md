# ADR-0001: Inference posture & model transport

**Status:** Proposed
**Date:** 2026-06-07
**Deciders:** Security (posture sign-off), Engineering
**Gates:** Wave 1 (model list), Wave 2 (routing), Wave 4 (final posture), Wave 7 (guardrails)

## Context

~800 employees will paste real client and company data into this tool. The path that data takes
to a model provider is the single most important privacy decision in the platform, and it is a
GDPR concern (ADR-0006), not just an engineering one.

Two facts shape this:

- **The spec defaults to OpenRouter.** `CLAUDE.md` states "inference reaches providers through
  OpenRouter by default"; Wave 1 says configure OpenRouter as the default path; Wave 4 says
  *finalize* OpenRouter-vs-direct with Security before GA.
- **The code today does the opposite.** `src/lib/ai/models.ts` wires OpenAI, Google, Anthropic,
  xAI, Groq and Ollama as **direct** providers (each with its own API key) and adds OpenRouter as
  just one more provider. So "route everything through OpenRouter" is real work, not a flag.

Forces: privacy/GDPR & no-training guarantees · Security sign-off · blended cost · provider
flexibility (one key, many models) · operational simplicity for a pilot · avoiding lock-in at the
`getModel` seam.

## Decision

**For the pilot (Waves 1–3): route *all* inference through OpenRouter, configured for
zero-data-retention (ZDR), and disable the direct providers in the registry.** Expose only an
approved short list (one frontier, one mid, one cheap, plus an embedding path for Wave 6).

**Keep the `customModelProvider.getModel` seam (`route.ts:78`) transport-agnostic** so that
switching OpenRouter → direct EU providers is a configuration/registry change, not a rewrite.

**Re-open the posture at Wave 4** with Security: if they require data to stay inside an EU
provider boundary, move the frontier/mid models to **direct EU-region endpoints** (Azure OpenAI
EU, Anthropic via AWS Bedrock EU, or Google Vertex EU) behind the same seam, keeping OpenRouter
for non-sensitive/cheap traffic if still acceptable.

## Options Considered

### Option A: OpenRouter-only for pilot, posture re-decided at Wave 4 (recommended)
| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — one key, one provider, upstream already supports it |
| Cost | Good — easy model arbitrage; OpenRouter margin is small |
| Privacy | Acceptable **only** with ZDR enabled + DPA signed; data still transits a US intermediary |
| Reversibility | High — seam stays abstract |

**Pros:** fastest path to a working pilot; trivial model swaps for routing (Wave 2); one DPA.
**Cons:** a third party sits in the data path; must verify ZDR + EU sub-processor terms; not
obviously sufficient for GA without Security sign-off.

### Option B: Direct EU providers from day one
| Dimension | Assessment |
|-----------|------------|
| Complexity | High — N providers, N keys, N quota/billing setups, EU-region pinning each |
| Cost | Provider-list price; no arbitrage layer |
| Privacy | Strongest — data stays in chosen provider's EU boundary |
| Reversibility | Medium |

**Pros:** cleanest GDPR story; no intermediary. **Cons:** slows the pilot; routing (Wave 2) must
juggle multiple SDKs/keys; over-investment before Security has even defined the requirement.

### Option C: Front everything with an AI gateway (Vercel AI Gateway / LiteLLM)
| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — another component to run/observe |
| Cost | Gateway fee or self-host ops |
| Privacy | Depends on gateway hosting/region |
| Reversibility | High |

**Pros:** unified observability, fallback, key management; pairs well with ADR-0008 guardrails.
**Cons:** premature for a pilot; overlaps with what OpenRouter already gives us.

## Trade-off Analysis

The pilot's job is to prove value and start killing shadow-AI use, fast — Option A gets there
with one integration and one DPA. The genuine GDPR/Security question (is a US intermediary in the
data path acceptable?) is a **Wave 4 / GA-gate** question, not a pilot blocker, *provided* the
pilot runs on ZDR with a signed DPA and the seam stays abstract so we can pivot to Option B for
GA without reworking routing, budgets, or guardrails. We therefore choose A now and pre-commit to
re-deciding at Wave 4.

## Consequences

- **Easier:** Wave 2 routing (swap OpenRouter model IDs freely); single key/secret to manage;
  fastest pilot.
- **Harder:** we must verify and document OpenRouter ZDR + EU sub-processors and sign a DPA before
  any real data flows; GA may require a second integration pass for direct EU providers.
- **Revisit at Wave 4:** final posture with Security; this ADR is superseded or amended then.

## Open inputs needed

- **[Security]** Is OpenRouter-with-ZDR acceptable for a *pilot* containing real client data?
- **[Security]** GA posture: intermediary-with-ZDR acceptable, or direct EU-only required?
- **[Product/Eng]** The approved 3–4 model short list for the pilot (frontier/mid/cheap).

## Action items

1. [ ] (W1) Trim `src/lib/ai/models.ts` to an OpenRouter-only approved short list; disable direct providers.
2. [ ] (W1) Enable ZDR on the OpenRouter account; record the setting; sign the DPA (ADR-0006).
3. [ ] (W1) Confirm `getModel` returns OpenRouter models for the short list; `OPENROUTER_API_KEY` is the only inference key set.
4. [ ] (W4) Reconvene with Security; if direct-EU required, register EU endpoints behind the same seam and amend/supersede this ADR.
