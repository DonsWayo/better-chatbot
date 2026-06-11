import { pgDb } from "@/lib/db/pg/db.pg";
import { AsafeGuardrailEventTable } from "@/lib/db/pg/schema.pg";
import type { LanguageModel, LanguageModelMiddleware } from "ai";
import { wrapLanguageModel } from "ai";
import {
  guardrailBlocksTotal,
  guardrailFiringsTotal,
} from "lib/observability/metrics";
import { type GuardrailPolicy, resolvePolicy } from "./policies";
import { type GuardrailFiring, scanInput, scanOutput } from "./scan";

export { scanInput, scanOutput } from "./scan";
export { resolvePolicy } from "./policies";
export { scanToolOutput, spotlight } from "./tool-output";
export type { ToolOutputScanResult } from "./tool-output";
export { scanIngestText } from "./ingest-scan";
export type { IngestScanResult } from "./ingest-scan";
export type { GuardrailFiring, ScanResult } from "./scan";
export type {
  GuardrailPolicy,
  GuardrailAction,
  GuardrailPosture,
} from "./policies";

export const GUARDRAILS_ENABLED =
  process.env.ASAFE_GUARDRAILS_ENABLED !== "false";

async function logGuardrailEvent(
  userId: string,
  firings: GuardrailFiring[],
  blocked: boolean,
  posture: string,
): Promise<void> {
  if (firings.length === 0 && !blocked) return;
  try {
    // Prometheus counters
    for (const f of firings) {
      guardrailFiringsTotal.inc({
        category: f.category,
        action: f.action,
        posture,
      });
    }
    if (blocked) guardrailBlocksTotal.inc({ posture });

    if (firings.length > 0) {
      await pgDb.insert(AsafeGuardrailEventTable).values({
        userId,
        blocked,
        firings: JSON.stringify(firings),
      });
    }
  } catch {
    // Fail open — never crash a chat request because of logging
  }
}

/**
 * Record guardrail firings from seams OUTSIDE the model middleware (tool-output
 * shielding, workflow LLM nodes). Same Prometheus counters + asafe_guardrail_event
 * rows the chat-route middleware writes — the admin Guardrails page shows both.
 * Fire-and-forget; never throws.
 */
export function recordGuardrailFirings(
  userId: string,
  firings: GuardrailFiring[],
  blocked: boolean,
  posture: string,
): void {
  void logGuardrailEvent(userId, firings, blocked, posture);
}

/**
 * Build a LanguageModelMiddleware that enforces A-Safe guardrails (W7).
 * Use with AI SDK v5's wrapLanguageModel().
 */
function buildGuardrailMiddleware(
  userId: string,
  policy: GuardrailPolicy,
): LanguageModelMiddleware {
  return {
    middlewareVersion: "v2",

    async transformParams({ params }) {
      const firings: GuardrailFiring[] = [];
      let blocked = false;
      let blockReason: string | undefined;

      const processedMessages = params.prompt.map((msg) => {
        if (msg.role !== "user") return msg;

        const processedContent = msg.content.map((part) => {
          if (part.type !== "text") return part;
          const result = scanInput(part.text, policy);
          firings.push(...result.firings);
          if (result.blocked) {
            blocked = true;
            blockReason = result.blockReason;
          }
          return result.text !== part.text
            ? { ...part, text: result.text }
            : part;
        });

        return { ...msg, content: processedContent };
      });

      void logGuardrailEvent(userId, firings, blocked, policy.posture);

      if (blocked) {
        throw new Error(blockReason ?? "Input blocked by guardrails.");
      }

      return { ...params, prompt: processedMessages };
    },

    async wrapGenerate({ doGenerate }) {
      const result = await doGenerate();

      if (!policy.outputLeakProtection) return result;

      // Scan text parts in the content array
      const processedContent = result.content.map((part) => {
        if (part.type !== "text") return part;
        const { text } = scanOutput(part.text);
        return { ...part, text };
      });

      return { ...result, content: processedContent };
    },

    async wrapStream({ doStream }) {
      const { stream, ...rest } = await doStream();

      if (!policy.outputLeakProtection) return { stream, ...rest };

      // Strip system-prompt leakage patterns from streamed text deltas
      const filtered = new TransformStream({
        transform(chunk, controller) {
          if (chunk.type === "text-delta") {
            const { text } = scanOutput(chunk.textDelta);
            controller.enqueue({ ...chunk, textDelta: text });
          } else {
            controller.enqueue(chunk);
          }
        },
      });

      return { stream: stream.pipeThrough(filtered), ...rest };
    },
  };
}

/**
 * Wrap a LanguageModel with A-Safe guardrails (W7).
 * Returns the model unwrapped if ASAFE_GUARDRAILS_ENABLED=false.
 */
export function wrapWithGuardrails(
  model: LanguageModel,
  userId: string,
  teamPolicy?: string | null,
): LanguageModel {
  if (!GUARDRAILS_ENABLED) return model;

  const policy = resolvePolicy(teamPolicy);
  return wrapLanguageModel({
    model: model as Parameters<typeof wrapLanguageModel>[0]["model"],
    middleware: buildGuardrailMiddleware(userId, policy),
  }) as LanguageModel;
}
