import type { ChatModel } from "app-types/chat";
import type { ModelTier, TaskClass } from "app-types/routing";

// asafe-ai routing policy (ADR-0004). Every tier resolves to a model served via OpenRouter
// (ADR-0001) from the approved short list in src/lib/ai/models.ts. Edit this mapping to retune
// cost/quality; the Wave 2 eval set guards against quality regressions.

const PROVIDER = "openRouter";

// Cost directive (2026-06): every tier resolves to the cheap stack; premium models
// (gpt-5.5 / claude-opus-4.8 / gemini-*) are entitlement-only and never auto-routed.
export const TIER_MODEL: Record<ModelTier, ChatModel> = {
  // Servable stand-in for the frontier tier: MiniMax M3 is the intended frontier
  // model, but this account's OpenRouter data policy blocks its endpoints (404).
  // Swap back once the account's OpenRouter privacy settings are loosened.
  frontier: { provider: PROVIDER, model: "kimi-k2.6" }, // $0.68/$3.41 per M, 262k ctx
  balanced: { provider: PROVIDER, model: "deepseek-v4-pro" }, // $0.43/$0.87 per M, 1M ctx
  fast: { provider: PROVIDER, model: "deepseek-v4-flash" }, // $0.10/$0.20 per M, 1M ctx
  // hy3-preview is $0.04/M cheaper but is a reasoning model with 12–19s
  // latency even on trivial completions — wrong profile for the snappy tier.
  // It stays in the registry for entitled picks.
  cheap: { provider: PROVIDER, model: "deepseek-v4-flash" }, // $0.10/$0.20 per M, 1M ctx
};

// Ordered tier candidates per task class: first = preferred, the rest = fallback order
// (used on provider error/rate-limit and to honour a team allow-list).
export const TASK_TIERS: Record<TaskClass, ModelTier[]> = {
  code: ["balanced", "frontier", "fast"],
  reasoning: ["frontier", "balanced"],
  long_context: ["balanced", "frontier"],
  vision: ["fast", "balanced", "frontier"],
  tool_use: ["balanced", "frontier"],
  quick_rewrite: ["cheap", "fast"],
  general: ["fast", "cheap"],
};

/** Conversations longer than this (chars) are treated as long-context work. */
export const LONG_CONTEXT_CHARS = 8000;
