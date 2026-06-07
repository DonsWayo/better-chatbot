import type { ChatModel } from "app-types/chat";
import {
  type RoutingDecision,
  type RoutingRequest,
  type RoutingRequestInput,
  RoutingRequestSchema,
  type TaskClass,
} from "app-types/routing";
import { LONG_CONTEXT_CHARS, TASK_TIERS, TIER_MODEL } from "./policy";

// Deterministic, explainable heuristics (ADR-0004). Kept simple on purpose: an LLM-classifier
// tier is a deferred option behind a flag (see ADR-0004), not used here.
const CODE_RE =
  /```|\b(function|class|import|def|const|let|async|return|console\.|stack ?trace|exception|traceback|npm|pnpm|git)\b|=>/i;
const REWRITE_RE =
  /\b(rewrite|reword|rephrase|translate|summari[sz]e|shorten|proofread|fix grammar|tl;?dr)\b/i;
const REASONING_RE =
  /\b(why|explain|analy[sz]e|reason|prove|derive|compare|trade-?offs?|step by step)\b/i;

function inferTaskClass(req: RoutingRequest): TaskClass {
  if (req.declaredTaskClass) return req.declaredTaskClass;
  if (req.hasImage) return "vision";
  if (req.hasTools) return "tool_use";
  const text = req.text ?? "";
  if (CODE_RE.test(text)) return "code";
  if (req.totalChars >= LONG_CONTEXT_CHARS) return "long_context";
  if (text.length <= 240 && REWRITE_RE.test(text)) return "quick_rewrite";
  if (REASONING_RE.test(text)) return "reasoning";
  return "general";
}

function inAllow(model: ChatModel, allow?: ChatModel[]): boolean {
  if (!allow || allow.length === 0) return true;
  return allow.some(
    (m) => m.provider === model.provider && m.model === model.model,
  );
}

/**
 * Pick a model for a request (ADR-0004): infer the task class, then choose the preferred tier's
 * model — respecting an optional team allow-list — and return ordered fallback candidates plus a
 * human-readable reason for message metadata + logs.
 */
export function routeModel(input: RoutingRequestInput): RoutingDecision {
  const req = RoutingRequestSchema.parse(input);
  const taskClass = inferTaskClass(req);
  const tiers = TASK_TIERS[taskClass];

  const allowed = tiers
    .map((tier) => ({ tier, model: TIER_MODEL[tier] }))
    .filter((c) => inAllow(c.model, req.allowedModels));

  // If the allow-list excludes every preferred candidate, fall back to the top tier unfiltered.
  const chosen = allowed[0] ?? { tier: tiers[0], model: TIER_MODEL[tiers[0]] };
  const candidates = (allowed.length ? allowed : [chosen]).map((c) => c.model);

  return {
    model: chosen.model,
    taskClass,
    tier: chosen.tier,
    reason: `task=${taskClass} → ${chosen.tier} (${chosen.model.provider}/${chosen.model.model})`,
    candidates,
  };
}
