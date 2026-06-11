// Wave 2 routing eval — USD pricing per 1 M tokens (ADR-0004).
// Source: live OpenRouter list prices on this account, 2026-06.
// Covers the full approved registry; keys match the `model` ids in
// src/lib/ai/models.ts (TIER_MODEL in policy.ts routes to a subset).

export const MODEL_PRICES: Record<
  string,
  { inPerMTok: number; outPerMTok: number }
> = {
  // Premium family — entitlement-only, never auto-routed.
  "gpt-5.5": { inPerMTok: 5, outPerMTok: 30 },
  "claude-opus-4.8": { inPerMTok: 5, outPerMTok: 25 },
  "gemini-3.5-flash": { inPerMTok: 1.5, outPerMTok: 9 },
  "gemini-3.1-flash-lite": { inPerMTok: 0.25, outPerMTok: 1.5 },
  // Cost stack — the Auto routing tiers.
  "kimi-k2.6": { inPerMTok: 0.68, outPerMTok: 3.41 }, // frontier
  "deepseek-v4-pro": { inPerMTok: 0.43, outPerMTok: 0.87 }, // balanced
  "deepseek-v4-flash": { inPerMTok: 0.1, outPerMTok: 0.2 }, // fast
  "hy3-preview": { inPerMTok: 0.06, outPerMTok: 0.21 }, // cheap
};
