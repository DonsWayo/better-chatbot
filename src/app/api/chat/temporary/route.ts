import {
  UIMessage,
  convertToModelMessages,
  smoothStream,
  streamText,
} from "ai";
import { getSession } from "auth/server";
import { customModelProvider } from "lib/ai/models";
import { buildUserSystemPrompt } from "lib/ai/prompts";
import { getUserPreferences } from "lib/user/server";
import globalLogger from "logger";

import { colorize } from "consola/utils";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `Temporary Chat API: `),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();

    const session = await getSession();
    if (!session) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { messages, chatModel, instructions } = json as {
      messages: UIMessage[];
      chatModel?: {
        provider: string;
        model: string;
      };
      instructions?: string;
    };
    logger.info(`model: ${chatModel?.provider}/${chatModel?.model}`);
    // W7 GA gate (ADR-0008): same guardrail posture as the main chat route.
    // Temporary chats have no thread/team context, so the org default policy
    // applies (resolvePolicy(undefined) → "standard").
    const { wrapWithGuardrails } = await import("lib/ai/guardrails");
    const model = wrapWithGuardrails(
      customModelProvider.getModel(chatModel),
      session.user.id,
    );
    const userPreferences =
      (await getUserPreferences(session.user.id)) || undefined;

    return streamText({
      model,
      system: `${buildUserSystemPrompt(session.user, userPreferences)} ${
        instructions ? `\n\n${instructions}` : ""
      }`.trim(),
      messages: convertToModelMessages(messages),
      experimental_transform: smoothStream({ chunking: "word" }),
    }).toUIMessageStreamResponse();
  } catch (error: any) {
    logger.error(error);
    return new Response(error.message || "Oops, an error occured!", {
      status: 500,
    });
  }
}
