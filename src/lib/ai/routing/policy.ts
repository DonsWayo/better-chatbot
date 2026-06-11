import type { ChatModel } from "app-types/chat";
import type { ModelTier, TaskClass } from "app-types/routing";

// asafe-ai routing policy (ADR-0004). Every tier resolves to a model served via OpenRouter
// (ADR-0001) from the approved short list in src/lib/ai/models.ts. Edit this mapping to retune
// cost/quality; the Wave 2 eval set guards against quality regressions.

const PROVIDER = "openRouter";

export const TIER_MODEL: Record<ModelTier, ChatModel> = {
  frontier: { provider: PROVIDER, model: "claude-opus-4.8" }, // top quality (hard reasoning)
  balanced: { provider: PROVIDER, model: "gpt-5.5" }, // strong general/code, mid cost
  fast: { provider: PROVIDER, model: "gemini-3.5-flash" }, // cheap, fast, multilingual, 1M ctx
  cheap: { provider: PROVIDER, model: "gemini-3.1-flash-lite" }, // cheapest, trivial tasks
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
