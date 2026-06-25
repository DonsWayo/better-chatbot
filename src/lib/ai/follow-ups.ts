import { openrouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import globalLogger from "logger";
import { z } from "zod";

export const FOLLOW_UPS_PART_TYPE = "data-follow-ups" as const;

const logger = globalLogger.withDefaults({ message: "[follow-ups] " });

// Import openrouter directly — bypasses customModelProvider.getModel() so
// there is zero risk of falling back to a paid model.
const followUpModel = openrouter("qwen/qwen3-8b:free");

// Hard caps — enforced on both the model prompt and the returned output so a
// hostile assistant response cannot feed oversized text into the follow-up
// generator or exfiltrate injected instructions via unusually long questions.
const MAX_INPUT_CHARS = 4000;
const MAX_QUESTION_CHARS = 200;
const MAX_QUESTIONS = 5;

const schema = z.object({
  questions: z
    .array(z.string().max(MAX_QUESTION_CHARS))
    .length(3)
    .describe(
      "Exactly 3 short follow-up questions the user might naturally ask next",
    ),
});

/**
 * Sanitize a single follow-up question before surfacing it to the client:
 * - collapse whitespace / newlines (prevents embedded instruction smuggling)
 * - hard-truncate to MAX_QUESTION_CHARS
 */
function sanitizeQuestion(q: string): string {
  return q
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, MAX_QUESTION_CHARS);
}

export async function generateFollowUps(
  responseText: string,
  signal?: AbortSignal,
): Promise<string[]> {
  try {
    if (responseText.trim().length < 80) return [];

    const { object } = await generateObject({
      model: followUpModel,
      schema,
      system:
        "Generate exactly 3 short, specific follow-up questions a user might naturally ask after receiving this AI response. Make them concrete, diverse, and useful.",
      // Truncate input so a very long assistant message cannot inflate the
      // follow-up model's context window or carry injected instructions.
      prompt: responseText.slice(0, MAX_INPUT_CHARS),
      abortSignal: signal,
    });

    // Sanitize each question, dedupe, and enforce output count cap.
    const seen = new Set<string>();
    const results: string[] = [];
    for (const raw of object.questions) {
      const q = sanitizeQuestion(raw);
      if (q && !seen.has(q)) {
        seen.add(q);
        results.push(q);
        if (results.length >= MAX_QUESTIONS) break;
      }
    }
    return results;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return [];
    }
    logger.error("generateFollowUps failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
