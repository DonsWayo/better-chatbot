import { streamObject } from "ai";

import { customModelProvider } from "lib/ai/models";
import { buildAgentGenerationPrompt } from "lib/ai/prompts";
import globalLogger from "logger";
import { ChatModel } from "app-types/chat";

import { getSession } from "auth/server";
import { colorize } from "consola/utils";
import { AgentGenerateSchema } from "app-types/agent";
import { z } from "zod";
import { loadAppDefaultTools } from "../../chat/shared.chat";
import { workflowRepository } from "lib/db/repository";
import { resolveEffectiveModelAllowList } from "lib/admin/effective-models";
import { getUserPrimaryTeamId } from "lib/admin/teams";
import { checkBudget, estimateCostUsd, recordUsage } from "lib/ai/budget";
import { safe } from "ts-safe";
import { objectFlow } from "lib/utils";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `Agent Generate API: `),
});

// asafe-ai governance (ADR-0003/0009): agent generation is inference and must
// be entitlement-gated, budget-checked, and metered like every other LLM seam.
// A non-entitled client model pick falls back to this cheap default rather than
// running a premium model unmetered (the audit found this route had NO gate).
const DEFAULT_AGENT_GEN_MODEL: ChatModel = {
  provider: "openRouter",
  model: "deepseek-v4-flash",
};

export async function POST(request: Request) {
  try {
    const json = await request.json();

    const { chatModel, message = "hello" } = json as {
      chatModel?: ChatModel;
      message: string;
    };

    logger.info(`chatModel: ${chatModel?.provider}/${chatModel?.model}`);

    const session = await getSession();
    if (!session) {
      return new Response("Unauthorized", { status: 401 });
    }

    // ADR-0009 entitlement gate: resolve the caller's effective allow-list and
    // confine the model. A client-picked model outside the allow-list (or any
    // pick by a non-entitled user, whose list excludes premium models) is
    // ignored in favor of the cheap default — no unmetered premium bypass.
    const userTeamId = await getUserPrimaryTeamId(session.user.id);
    const allowList = await resolveEffectiveModelAllowList(
      session.user.id,
      userTeamId,
    );
    const pickAllowed =
      chatModel?.model &&
      (!allowList || allowList.length === 0 || allowList.includes(chatModel.model));
    const effectiveModel: ChatModel = pickAllowed
      ? (chatModel as ChatModel)
      : DEFAULT_AGENT_GEN_MODEL;

    // ADR-0003 budget gate: a team whose budget is exhausted cannot generate.
    const budgetCheck = await checkBudget(session.user.id, userTeamId);
    if (!budgetCheck.allowed) {
      return Response.json(
        { message: budgetCheck.reason ?? "Team budget exhausted" },
        { status: 402 },
      );
    }

    const toolNames = new Set<string>();

    await safe(loadAppDefaultTools)

      .ifOk((appTools) => {
        objectFlow(appTools).forEach((_, toolName) => {
          toolNames.add(toolName);
        });
      })
      .unwrap();

    await safe(mcpClientsManager.tools())
      .ifOk((tools) => {
        objectFlow(tools).forEach((mcp) => {
          toolNames.add(mcp._originToolName);
        });
      })
      .unwrap();

    await safe(workflowRepository.selectExecuteAbility(session.user.id))
      .ifOk((tools) => {
        tools.forEach((tool) => {
          toolNames.add(tool.name);
        });
      })
      .unwrap();

    const dynamicAgentTable = AgentGenerateSchema.extend({
      tools: z
        .array(
          z.enum(
            Array.from(toolNames).length > 0
              ? ([
                  Array.from(toolNames)[0],
                  ...Array.from(toolNames).slice(1),
                ] as [string, ...string[]])
              : ([""] as [string]),
          ),
        )
        .describe("Agent allowed tools name")
        .nullable()
        .default([]),
    });

    const system = buildAgentGenerationPrompt(Array.from(toolNames));

    const result = streamObject({
      model: customModelProvider.getModel(effectiveModel),
      system,
      prompt: message,
      schema: dynamicAgentTable,
      // ADR-0003 metering: record the generation in the usage ledger so agent
      // building is budget-attributed like chat inference.
      onFinish: ({ usage }) => {
        const promptTokens = usage?.inputTokens ?? 0;
        const completionTokens = usage?.outputTokens ?? 0;
        recordUsage({
          userId: session.user.id,
          teamId: userTeamId,
          sessionId: null,
          model: effectiveModel.model,
          provider: effectiveModel.provider,
          taskClass: "agent-generation",
          tier: null,
          promptTokens,
          completionTokens,
          costUsd: estimateCostUsd(
            effectiveModel.model,
            promptTokens,
            completionTokens,
          ),
        }).catch((e) => logger.error("recordUsage failed:", e));
      },
    });

    return result.toTextStreamResponse();
  } catch (error) {
    // Never resolve to `undefined` (a silent empty 200). Return an explicit 500
    // so the client sees a real error instead of a broken stream.
    logger.error(error);
    return new Response("Failed to generate agent", { status: 500 });
  }
}
