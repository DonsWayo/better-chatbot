import {
  UIMessage,
  convertToModelMessages,
  smoothStream,
  streamText,
} from "ai";
import { getSession } from "auth/server";
import { resolveEffectiveModelAllowList } from "lib/admin/effective-models";
import {
  getTeamPolicy,
  getUserPrimaryTeamId,
  resolveStrictestGuardrailPolicy,
} from "lib/admin/teams";
import { checkBudget, estimateCostUsd, recordUsage } from "lib/ai/budget";
import { customModelProvider } from "lib/ai/models";
import { buildUserSystemPrompt } from "lib/ai/prompts";
import { routeModel } from "lib/ai/routing/route-model";
import { aupGateResponse } from "lib/compliance/aup";
import { checkKillSwitch } from "lib/observability/kill-switch";
import { checkRateLimit } from "lib/rate-limit";
import { getUserPreferences } from "lib/user/server";
import globalLogger from "logger";

import { colorize } from "consola/utils";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `Temporary Chat API: `),
});

/** Text content of a message's parts (typed; no `any` casts). */
function textOfParts(parts: UIMessage["parts"] | undefined): string[] {
  return (parts ?? []).flatMap((p) => (p.type === "text" ? [p.text] : []));
}

export async function POST(request: Request) {
  try {
    const json = await request.json();

    const session = await getSession();
    if (!session?.user.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    // AUP hard gate (EU AI Act Art. 50) — same backstop as the main chat route.
    const aupGate = await aupGateResponse(session.user.id);
    if (aupGate) return aupGate;

    const { messages, chatModel, instructions } = json as {
      messages: UIMessage[];
      chatModel?: {
        provider: string;
        model: string;
      };
      instructions?: string;
    };

    // asafe-ai governance: temporary chats are NOT persistence-free of policy.
    // Resolve the same seam as the main route — team, kill switch, rate limit,
    // model entitlement gate, budget, metering — only persistence is skipped.
    //
    // PARALLEL setup group 1 — pure userId-keyed reads with no dependency on
    // each other (getUserPrimaryTeamId + the strictest cross-team guardrail
    // posture, now TTL-cached in teams.ts). checkRateLimit is deliberately
    // EXCLUDED: it mutates (increments the per-user bucket) and the kill switch
    // must be able to return before a token is consumed (same order as before).
    const [userTeamId, strictestGuardrail] = await Promise.all([
      getUserPrimaryTeamId(session.user.id),
      resolveStrictestGuardrailPolicy(session.user.id),
    ]);

    // PARALLEL group 2 — both reads need userTeamId and are side-effect-free:
    // teamPolicy (capabilities + guardrail fallback) and the kill-switch read.
    const [teamPolicy, killSwitchResp] = await Promise.all([
      userTeamId ? getTeamPolicy(userTeamId) : Promise.resolve(null),
      // W12: kill switch — operator can block all inference instantly.
      checkKillSwitch(userTeamId),
    ]);
    if (killSwitchResp) return killSwitchResp;

    // Per-user rate limiting (Postgres-backed, multi-pod safe). Runs (and
    // increments the bucket) only after the kill-switch return.
    const rateCheck = await checkRateLimit(session.user.id);
    if (!rateCheck.allowed) {
      return Response.json(
        {
          message:
            "Rate limit exceeded. Please wait before sending another message.",
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(rateCheck.limit),
            "X-RateLimit-Remaining": String(rateCheck.remaining),
            "X-RateLimit-Reset": String(Math.ceil(rateCheck.resetAt / 1000)),
            "Retry-After": String(
              Math.ceil((rateCheck.resetAt - Date.now()) / 1000),
            ),
          },
        },
      );
    }

    // asafe-ai entitlements (ADR-0009, role-based v1): non-elevated users cannot
    // pick the model — their choice is ignored and they are confined to the
    // effective allow-list via Auto routing. Enforced SERVER-SIDE here, not just
    // hidden in the UI. Fail CLOSED: only known elevated roles may pick.
    const isElevated =
      session.user.role === "admin" || session.user.role === "editor";
    const canSelectModel = isElevated;

    // Resolve the layered org → team → user allow-list ONCE. `null` = unrestricted.
    const effectiveModelAllowList = await resolveEffectiveModelAllowList(
      session.user.id,
      userTeamId,
    );

    // Auto-route unless an entitled user explicitly picked a model. A
    // non-entitled user's pick is ignored; Auto only routes among entitled
    // models, so it never selects a model the user can't use.
    const lastUserMessage = messages.findLast((m) => m.role === "user");
    const lastUserText = textOfParts(lastUserMessage?.parts).join(" ");
    const totalChars = messages.reduce(
      (n, m) => n + textOfParts(m.parts).reduce((s, t) => s + t.length, 0),
      0,
    );
    const routing =
      canSelectModel && chatModel
        ? null
        : routeModel({
            text: lastUserText,
            totalChars,
            allowedModels: effectiveModelAllowList ?? undefined,
          });
    const effectiveModel = routing ? routing.model : chatModel;

    // ADR-0009 backstop: the layered list gates BOTH explicit picks and routed
    // decisions (routing pre-filters; this 403 covers an allow-list that
    // excludes every routable tier).
    if (
      effectiveModelAllowList &&
      effectiveModelAllowList.length > 0 &&
      effectiveModel?.model &&
      !effectiveModelAllowList.includes(effectiveModel.model)
    ) {
      return Response.json(
        {
          message: `Model "${effectiveModel.model}" is not permitted for your team.`,
        },
        { status: 403 },
      );
    }

    logger.info(`model: ${effectiveModel?.provider}/${effectiveModel?.model}`);

    // asafe-ai Wave 3 (ADR-0003): enforce team budget before starting inference.
    const budgetCheck = await checkBudget(session.user.id, userTeamId);
    if (!budgetCheck.allowed) {
      return Response.json({ message: budgetCheck.reason }, { status: 402 });
    }

    // W7 GA gate (ADR-0008): same guardrail posture as the main chat route —
    // the STRICTEST guardrail across ALL the user's teams (most-restrictive
    // wins), not just the primary team. Falls back to the primary team's
    // posture (then org default) when the user has no team. Resolved once in
    // setup group 1 above (reused here — no second cross-team scan).
    const effectiveGuardrailPolicy =
      strictestGuardrail ?? teamPolicy?.guardrailPolicy;
    const { wrapWithGuardrails } = await import("lib/ai/guardrails");
    const model = wrapWithGuardrails(
      customModelProvider.getModel(effectiveModel),
      session.user.id,
      effectiveGuardrailPolicy,
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
      // asafe-ai Wave 3 (ADR-0003): meter usage even for temporary (non-persisted)
      // chats. No thread → sessionId is null, but the spend is still attributed
      // to the user + team budget.
      onFinish: ({ usage }) => {
        const inputTokens = usage?.inputTokens ?? 0;
        const outputTokens = usage?.outputTokens ?? 0;
        const costUsd = estimateCostUsd(
          effectiveModel?.model ?? "",
          inputTokens,
          outputTokens,
        );
        recordUsage({
          userId: session.user.id,
          teamId: userTeamId,
          sessionId: null,
          model: effectiveModel?.model ?? "",
          provider: effectiveModel?.provider ?? "",
          taskClass: routing?.taskClass ?? null,
          tier: routing?.tier ?? null,
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          costUsd,
        }).catch((e) => logger.error("recordUsage failed:", e));
      },
    }).toUIMessageStreamResponse();
  } catch (error: any) {
    logger.error(error);
    return new Response(error.message || "Oops, an error occured!", {
      status: 500,
    });
  }
}
