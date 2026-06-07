// Wave 2 routing eval — USD pricing per 1 M tokens (ADR-0004).
// Source: provider published list prices at eval authoring time.
// Keys match the `model` field returned by TIER_MODEL in policy.ts.

export const MODEL_PRICES: Record<
  string,
  { inPerMTok: number; outPerMTok: number }
> = {
  "claude-opus-4.8": { inPerMTok: 5, outPerMTok: 25 },
  "gpt-5.1": { inPerMTok: 1.25, outPerMTok: 10 },
  "gemini-2.5-flash": { inPerMTok: 0.3, outPerMTok: 2.5 },
  "gemini-2.5-flash-lite": { inPerMTok: 0.1, outPerMTok: 0.4 },
};
