import { smoothStream, streamText } from "ai";

import { ChatModel } from "app-types/chat";
import { getSession } from "auth/server";
import { colorize } from "consola/utils";
import { customModelProvider } from "lib/ai/models";
import { CREATE_THREAD_TITLE_PROMPT, sanitizeTitle } from "lib/ai/prompts";
import { chatRepository } from "lib/db/repository";
import globalLogger from "logger";
import { handleError } from "../shared.chat";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `Title API: `),
});

// asafe-ai governance: title generation is PINNED server-side to the cheap
// fast-tier model and NEVER honors a client-chosen premium model. The audit
// found a basic user generating titles on claude-opus-4.8. Titles are a few
// tokens; we ignore `chatModel` from the body entirely. `getModel(undefined)`
// resolves to the registry fallback (deepseek-v4-flash); naming it here makes
// the intent explicit and keeps the cheap model stable if the fallback changes.
const TITLE_MODEL: ChatModel = {
  provider: "openRouter",
  model: "deepseek-v4-flash",
};

export async function POST(request: Request) {
  try {
    const json = await request.json();

    // `chatModel` is intentionally NOT read from the body — title generation is
    // pinned to the cheap model regardless of client input (see TITLE_MODEL).
    const { message = "hello", threadId } = json as {
      message: string;
      threadId: string;
    };

    const session = await getSession();
    if (!session) {
      return new Response("Unauthorized", { status: 401 });
    }

    logger.info(`threadId: ${threadId} (pinned model: ${TITLE_MODEL.model})`);

    const result = streamText({
      model: customModelProvider.getModel(TITLE_MODEL),
      system: CREATE_THREAD_TITLE_PROMPT,
      experimental_transform: smoothStream({ chunking: "word" }),
      prompt: message,
      abortSignal: request.signal,
      // NOTE: title generation is intentionally UNMETERED — token cost is tiny
      // (a handful of tokens on the cheapest model) and per-title usage rows
      // would be disproportionate noise in the usage ledger. The premium-model
      // bypass that mattered for cost is closed by pinning TITLE_MODEL above.
      onFinish: (ctx) => {
        chatRepository
          .upsertThread({
            id: threadId,
            // Refusal-proofing: never persist "I'm sorry, but I cannot assist…"
            // as a thread title — fall back to the user's message.
            title: sanitizeTitle(ctx.text, message),
            userId: session.user.id,
          })
          .catch((err) => logger.error(err));
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}
