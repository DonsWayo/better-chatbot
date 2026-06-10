import { z } from "zod";
import type { ChatModel } from "./chat";

// asafe-ai intelligent routing contract (ADR-0004).

export const TASK_CLASSES = [
  "code",
  "reasoning",
  "long_context",
  "vision",
  "tool_use",
  "quick_rewrite",
  "general",
] as const;
export type TaskClass = (typeof TASK_CLASSES)[number];

export const MODEL_TIERS = ["frontier", "balanced", "fast", "cheap"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

export const RoutingRequestSchema = z.object({
  /** Last user message text, used for heuristic task-class inference. */
  text: z.string().default(""),
  /** Explicit task class (from the user/agent); wins over inference when set. */
  declaredTaskClass: z.enum(TASK_CLASSES).optional(),
  hasImage: z.boolean().default(false),
  hasAttachments: z.boolean().default(false),
  hasTools: z.boolean().default(false),
  /** Total characters across the conversation, used to detect long-context work. */
  totalChars: z.number().int().nonnegative().default(0),
  /**
   * Optional entitlement allow-list (ADR-0002/ADR-0009): restrict routable models.
   * Entries are either bare model IDs (provider-agnostic — the form stored by the
   * layered org/team/user entitlement resolver) or `{provider, model}` pairs.
   */
  allowedModels: z
    .array(
      z.union([
        z.string(),
        z.object({ provider: z.string(), model: z.string() }),
      ]),
    )
    .optional(),
});
export type RoutingRequest = z.infer<typeof RoutingRequestSchema>;
/** Caller-facing input type: defaulted fields are optional (before Zod fills them). */
export type RoutingRequestInput = z.input<typeof RoutingRequestSchema>;

export type RoutingDecision = {
  model: ChatModel;
  taskClass: TaskClass;
  tier: ModelTier;
  /** Human-readable rationale, surfaced in message metadata + logs. */
  reason: string;
  /** Ordered fallback candidates (preferred first) for provider-error retries. */
  candidates: ChatModel[];
};
