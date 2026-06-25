"use server";

import {
  generateObject,
  generateText,
  jsonSchema,
  LanguageModel,
  type UIMessage,
} from "ai";

import {
  CREATE_THREAD_TITLE_PROMPT,
  generateExampleToolSchemaPrompt,
} from "lib/ai/prompts";

import type { ChatModel, ChatThread } from "app-types/chat";

import {
  agentRepository,
  chatExportRepository,
  chatRepository,
  mcpMcpToolCustomizationRepository,
  mcpServerCustomizationRepository,
} from "lib/db/repository";
import { customModelProvider } from "lib/ai/models";
import { toAny } from "lib/utils";
import { McpServerCustomizationsPrompt, MCPToolInfo } from "app-types/mcp";
import { serverCache } from "lib/cache";
import { CacheKeys } from "lib/cache/cache-keys";
import { getSession } from "auth/server";
import logger from "logger";

import { JSONSchema7 } from "json-schema";
import { ObjectJsonSchema7 } from "app-types/util";
import { jsonSchemaToZod } from "lib/json-schema-to-zod";
import { Agent } from "app-types/agent";

export async function getUserId() {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("User not found");
  }
  return userId;
}

// asafe-ai governance (ADR-0003/0009): builder Server Actions that run
// inference (generateObject for tool-schema examples / output-schema scaffolds)
// must be entitlement-confined and budget-checked like the chat seam — they run
// on the server with session context, so the role/entitlement restriction can't
// live only in the UI. A client model outside the caller's allow-list (or any
// pick by a non-entitled user) falls back to the cheap default.
const BUILDER_DEFAULT_MODEL: ChatModel = {
  provider: "openRouter",
  model: "deepseek-v4-flash",
};

async function resolveGovernedBuilderModel(
  requested?: ChatModel,
): Promise<ChatModel> {
  const userId = await getUserId(); // throws when unauthenticated
  const { getUserPrimaryTeamId } = await import("lib/admin/teams");
  const { resolveEffectiveModelAllowList } = await import(
    "lib/admin/effective-models"
  );
  const { checkBudget } = await import("lib/ai/budget");

  const teamId = await getUserPrimaryTeamId(userId);
  const allowList = await resolveEffectiveModelAllowList(userId, teamId);
  const pickAllowed =
    requested?.model &&
    (!allowList ||
      allowList.length === 0 ||
      allowList.includes(requested.model));

  const budget = await checkBudget(userId, teamId);
  if (!budget.allowed) {
    throw new Error(budget.reason ?? "Team budget exhausted");
  }
  return pickAllowed ? (requested as ChatModel) : BUILDER_DEFAULT_MODEL;
}

export async function generateTitleFromUserMessageAction({
  message,
  model,
}: { message: UIMessage; model: LanguageModel }) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  const prompt = toAny(message.parts?.at(-1))?.text || "unknown";

  const { text: title } = await generateText({
    model,
    system: CREATE_THREAD_TITLE_PROMPT,
    prompt,
  });

  return title.trim();
}

export async function selectThreadWithMessagesAction(threadId: string) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  const thread = await chatRepository.selectThread(threadId);

  if (!thread) {
    logger.error("Thread not found", threadId);
    return null;
  }
  if (thread.userId !== session?.user.id) {
    return null;
  }
  const messages = await chatRepository.selectMessagesByThreadId(threadId);
  return { ...thread, messages: messages ?? [] };
}

export async function deleteMessageAction(messageId: string) {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  // A message id alone carries no owner. Resolve its thread and verify the
  // caller owns that thread before deleting — otherwise any logged-in user
  // could delete anyone's message by guessing/enumerating ids.
  const message = await chatRepository.selectMessageById(messageId);
  if (!message) {
    return;
  }
  const hasAccess = await chatRepository.checkAccess(
    message.threadId,
    session.user.id,
  );
  if (!hasAccess) {
    throw new Error("Forbidden");
  }
  await chatRepository.deleteChatMessage(messageId);
}

export async function deleteThreadAction(threadId: string) {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  const hasAccess = await chatRepository.checkAccess(
    threadId,
    session.user.id,
  );
  if (!hasAccess) {
    throw new Error("Forbidden");
  }
  await chatRepository.deleteThread(threadId);
}

export async function deleteMessagesByChatIdAfterTimestampAction(
  messageId: string,
) {
  "use server";
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  // Truncating a thread from a pivot message: verify the caller owns the
  // thread the pivot message belongs to before deleting the tail.
  const message = await chatRepository.selectMessageById(messageId);
  if (!message) {
    return;
  }
  const hasAccess = await chatRepository.checkAccess(
    message.threadId,
    session.user.id,
  );
  if (!hasAccess) {
    throw new Error("Forbidden");
  }
  await chatRepository.deleteMessagesByChatIdAfterTimestamp(messageId);
}

export async function updateThreadAction(
  id: string,
  thread: Partial<Omit<ChatThread, "createdAt" | "updatedAt" | "userId">>,
) {
  const userId = await getUserId();
  // updateThread filters by thread id only; scope by owner so a user can't
  // rename a thread they don't own.
  const hasAccess = await chatRepository.checkAccess(id, userId);
  if (!hasAccess) {
    throw new Error("Forbidden");
  }
  await chatRepository.updateThread(id, { ...thread, userId });
}

export async function deleteThreadsAction() {
  const userId = await getUserId();
  await chatRepository.deleteAllThreads(userId);
}

export async function deleteUnarchivedThreadsAction() {
  const userId = await getUserId();
  await chatRepository.deleteUnarchivedThreads(userId);
}

export async function generateExampleToolSchemaAction(options: {
  model?: ChatModel;
  toolInfo: MCPToolInfo;
  prompt?: string;
}) {
  const model = customModelProvider.getModel(
    await resolveGovernedBuilderModel(options.model),
  );

  const schema = jsonSchema(
    toAny({
      ...options.toolInfo.inputSchema,
      properties: options.toolInfo.inputSchema?.properties ?? {},
      additionalProperties: false,
    }),
  );
  const { object } = await generateObject({
    model,
    schema,
    prompt: generateExampleToolSchemaPrompt({
      toolInfo: options.toolInfo,
      prompt: options.prompt,
    }),
  });

  return object;
}

export async function rememberMcpServerCustomizationsAction(userId: string) {
  const key = CacheKeys.mcpServerCustomizations(userId);

  const cachedMcpServerCustomizations =
    await serverCache.get<Record<string, McpServerCustomizationsPrompt>>(key);
  if (cachedMcpServerCustomizations) {
    return cachedMcpServerCustomizations;
  }

  const mcpServerCustomizations =
    await mcpServerCustomizationRepository.selectByUserId(userId);
  const mcpToolCustomizations =
    await mcpMcpToolCustomizationRepository.selectByUserId(userId);

  const serverIds: string[] = [
    ...mcpServerCustomizations.map(
      (mcpServerCustomization) => mcpServerCustomization.mcpServerId,
    ),
    ...mcpToolCustomizations.map(
      (mcpToolCustomization) => mcpToolCustomization.mcpServerId,
    ),
  ];

  const prompts = Array.from(new Set(serverIds)).reduce(
    (acc, serverId) => {
      const sc = mcpServerCustomizations.find((v) => v.mcpServerId == serverId);
      const tc = mcpToolCustomizations.filter(
        (mcpToolCustomization) => mcpToolCustomization.mcpServerId === serverId,
      );
      const data: McpServerCustomizationsPrompt = {
        name: sc?.serverName || tc[0]?.serverName || "",
        id: serverId,
        prompt: sc?.prompt || "",
        tools: tc.reduce(
          (acc, v) => {
            acc[v.toolName] = v.prompt || "";
            return acc;
          },
          {} as Record<string, string>,
        ),
      };
      acc[serverId] = data;
      return acc;
    },
    {} as Record<string, McpServerCustomizationsPrompt>,
  );

  serverCache.set(key, prompts, 1000 * 60 * 30); // 30 minutes
  return prompts;
}

export async function generateObjectAction({
  model,
  prompt,
  schema,
}: {
  model?: ChatModel;
  prompt: {
    system?: string;
    user?: string;
  };
  schema: JSONSchema7 | ObjectJsonSchema7;
}) {
  const result = await generateObject({
    model: customModelProvider.getModel(
      await resolveGovernedBuilderModel(model),
    ),
    system: prompt.system,
    prompt: prompt.user || "",
    schema: jsonSchemaToZod(schema),
  });
  return result.object;
}

export async function rememberAgentAction(
  agent: string | undefined,
  userId: string,
) {
  if (!agent) return undefined;
  const key = CacheKeys.agentInstructions(agent);
  let cachedAgent = await serverCache.get<Agent | null>(key);
  if (!cachedAgent) {
    cachedAgent = await agentRepository.selectAgentById(agent, userId);
    await serverCache.set(key, cachedAgent);
  }
  return cachedAgent as Agent | undefined;
}

export async function exportChatAction({
  threadId,
  expiresAt,
}: {
  threadId: string;
  expiresAt?: Date;
}) {
  const userId = await getUserId();

  const isAccess = await chatRepository.checkAccess(threadId, userId);
  if (!isAccess) {
    return new Response("Unauthorized", { status: 401 });
  }

  return await chatExportRepository.exportChat({
    threadId,
    exporterId: userId,
    expiresAt: expiresAt ?? undefined,
  });
}
