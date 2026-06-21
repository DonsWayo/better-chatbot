import { generateObject } from "ai";
import { z } from "zod";
import { customModelProvider } from "lib/ai/models";

const FOLLOW_UP_MODEL_ID = {
  provider: "openRouter" as const,
  model: "qwen3-8b:free",
};

const schema = z.object({
  questions: z
    .array(z.string().max(160))
    .min(1)
    .max(4)
    .describe(
      "3-4 short follow-up questions the user might naturally ask next",
    ),
});

export async function generateFollowUps(
  responseText: string,
  signal?: AbortSignal,
): Promise<string[]> {
  try {
    if (responseText.trim().length < 80) return [];

    const model = customModelProvider.getModel(FOLLOW_UP_MODEL_ID);

    const { object } = await generateObject({
      model,
      schema,
      system:
        "You generate 3 short, specific follow-up questions a user might naturally ask after receiving this AI response. Make them concrete, diverse, and useful. Return exactly 3 questions.",
      prompt: responseText.slice(0, 4000),
      abortSignal: signal,
    });

    return object.questions.slice(0, 3);
  } catch {
    return [];
  }
}
