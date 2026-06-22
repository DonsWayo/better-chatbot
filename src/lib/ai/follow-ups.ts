import { generateObject } from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";

// Use openrouter directly — bypasses customModelProvider.getModel() which
// would silently fall back to gpt-4.1 if the model lookup missed.
const followUpModel = openrouter("qwen/qwen3-8b:free");

const schema = z.object({
  questions: z
    .array(z.string().max(160))
    .length(3)
    .describe(
      "Exactly 3 short follow-up questions the user might naturally ask next",
    ),
});

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
      prompt: responseText.slice(0, 4000),
      abortSignal: signal,
    });

    // Dedupe in case the model returns near-identical strings
    return [...new Set(object.questions)];
  } catch {
    return [];
  }
}
