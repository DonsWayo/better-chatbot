import { streamText } from "ai";
import { getSession } from "auth/server";
import { resolveEffectiveModelAllowList } from "lib/admin/effective-models";
import { getUserPrimaryTeamId } from "lib/admin/teams";
import { checkBudget, estimateCostUsd, recordUsage } from "lib/ai/budget";
import { customModelProvider } from "lib/ai/models";
import { routeModel } from "lib/ai/routing/route-model";
import { documentRepository } from "lib/db/repository";
import { checkKillSwitch } from "lib/observability/kill-switch";
import { checkRateLimit } from "lib/rate-limit";
import { z } from "zod";

const bodySchema = z.object({
  action: z.enum([
    "improve",
    "shorten",
    "expand",
    "tone-formal",
    "tone-casual",
    "translate-es",
    "translate-fr",
    "translate-de",
    "autocomplete",
    "reply-comment",
  ]),
  selectedText: z.string().min(1).max(20_000),
  documentId: z.string(),
  commentContext: z.string().max(2_000).optional(),
});

const SYSTEM_PROMPTS: Record<string, string> = {
  improve:
    "You are an expert editor. Rewrite the given text to improve clarity, flow, and quality. Return ONLY the rewritten text — no preamble, no explanation, no quotes.",
  shorten:
    "You are an expert editor. Condense the given text to be 40–60% shorter while preserving all key meaning. Return ONLY the shortened text.",
  expand:
    "You are an expert editor. Expand the given text with more detail, examples, and context. Return ONLY the expanded text.",
  "tone-formal":
    "You are an expert editor. Rewrite the given text in a professional, formal tone suitable for business communication. Return ONLY the rewritten text.",
  "tone-casual":
    "You are an expert editor. Rewrite the given text in a warm, friendly, conversational tone. Return ONLY the rewritten text.",
  "translate-es":
    "Translate the following text into Spanish. Return ONLY the translation.",
  "translate-fr":
    "Translate the following text into French. Return ONLY the translation.",
  "translate-de":
    "Translate the following text into German. Return ONLY the translation.",
  autocomplete:
    "You are an intelligent writing assistant. Continue the given text naturally with 1–3 sentences. Return ONLY the continuation — no repeat of the original text.",
  "reply-comment":
    "You are a helpful collaborator. Write a concise, constructive reply to the following document comment. Be specific and actionable. Return ONLY the reply text.",
};

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.user.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const rateCheck = await checkRateLimit(session.user.id).catch(() => ({
      allowed: true,
      limit: 60,
      remaining: 60,
      resetAt: 0,
    }));
    if (!rateCheck.allowed) {
      return Response.json(
        { message: "Rate limit exceeded. Please slow down." },
        { status: 429 },
      );
    }

    const json = await request.json();
    const body = bodySchema.safeParse(json);
    if (!body.success) {
      return Response.json({ error: body.error.message }, { status: 400 });
    }

    const { action, selectedText, documentId, commentContext } = body.data;

    // Verify edit access — viewers must not be able to trigger AI rewrites.
    const accessible = await documentRepository
      .checkAccess(documentId, session.user.id, false)
      .catch((err) => {
        console.error("[documents/ai] checkAccess error", err);
        return false;
      });
    if (!accessible) {
      return new Response("Forbidden", { status: 403 });
    }

    const userTeamId = await getUserPrimaryTeamId(session.user.id);

    const killed = await checkKillSwitch(userTeamId).catch(() => null);
    if (killed) return killed;

    const budgetCheck = await checkBudget(session.user.id, userTeamId);
    if (!budgetCheck.allowed) {
      return Response.json(
        { message: budgetCheck.reason ?? "Team budget exhausted" },
        { status: 402 },
      );
    }

    const allowList = await resolveEffectiveModelAllowList(
      session.user.id,
      userTeamId,
    );

    const decision = routeModel({
      text: selectedText,
      declaredTaskClass: "quick_rewrite",
      allowedModels: allowList ?? undefined,
    });

    const model = customModelProvider.getModel(decision.model);

    const userPrompt =
      action === "reply-comment" && commentContext
        ? `Comment:\n${commentContext}`
        : selectedText;

    const result = streamText({
      model,
      system: SYSTEM_PROMPTS[action],
      prompt: userPrompt,
      onFinish: async ({ usage }) => {
        const promptTokens = usage?.inputTokens ?? 0;
        const completionTokens = usage?.outputTokens ?? 0;
        await recordUsage({
          userId: session.user.id,
          teamId: userTeamId,
          sessionId: null,
          model: decision.model.model,
          provider: decision.model.provider,
          taskClass: "quick_rewrite",
          tier: null,
          promptTokens,
          completionTokens,
          costUsd: estimateCostUsd(
            decision.model.model,
            promptTokens,
            completionTokens,
          ),
        }).catch((err) =>
          console.error("[documents/ai] recordUsage error", err),
        );
      },
    });

    return result.toTextStreamResponse();
  } catch (err) {
    console.error("[documents/ai]", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
