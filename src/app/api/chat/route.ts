import {
  Tool,
  UIMessage,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  smoothStream,
  stepCountIs,
  streamText,
} from "ai";

import { customModelProvider, isToolCallUnsupportedModel } from "lib/ai/models";
import { routeModel } from "lib/ai/routing/route-model";

import {
  ChatMention,
  ChatMetadata,
  chatApiSchemaRequestBodySchema,
} from "app-types/chat";
import {
  buildMcpServerCustomizationsSystemPrompt,
  buildToolCallUnsupportedModelSystemPrompt,
  buildUserSystemPrompt,
} from "lib/ai/prompts";
import { agentRepository, chatRepository } from "lib/db/repository";
import globalLogger from "logger";

import { errorIf, safe } from "ts-safe";

import { buildCsvIngestionPreviewParts } from "@/lib/ai/ingest/csv-ingest";
import { retrieveChunks } from "lib/ai/embeddings/ingest";
import { getSession } from "auth/server";
import { colorize } from "consola/utils";
import { ImageToolName } from "lib/ai/tools";
import { nanoBananaTool, openaiImageTool } from "lib/ai/tools/image";
import { serverFileStorage } from "lib/file-storage";
import { chatErrorsTotal, chatLatencyMs, routingDecisionsTotal } from "lib/observability/metrics";
import {
  activeRequests,
  providerErrorsTotal,
  rateLimitActivations,
  ttftMs,
} from "lib/observability/slo";
import { checkKillSwitch } from "lib/observability/kill-switch";
import { checkRateLimit } from "lib/rate-limit";
import { checkBudget, estimateCostUsd, recordUsage } from "lib/ai/budget";
import { getUserPrimaryTeamId, getTeamPolicy } from "lib/admin/teams";
import { getUserPreferences } from "lib/user/server";
import { auditMcpInvocation } from "lib/ai/mcp/audit";
import { generateUUID } from "lib/utils";
// W11: compression wired via wrapWithCompression middleware at model creation (line ~253)
import {
  rememberAgentAction,
  rememberMcpServerCustomizationsAction,
} from "./actions";
import {
  convertToSavePart,
  excludeToolExecution,
  extractInProgressToolPart,
  filterMcpServerCustomizations,
  handleError,
  loadAppDefaultTools,
  loadMcpTools,
  loadWorkFlowTools,
  manualToolExecuteByLastMessage,
  mergeSystemPrompt,
} from "./shared.chat";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `Chat API: `),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();

    const session = await getSession();

    if (!session?.user.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const userTeamId = await getUserPrimaryTeamId(session.user.id);
    const teamPolicy = userTeamId ? await getTeamPolicy(userTeamId) : null;

    // W12: kill switch — operator can block all inference instantly, no deploy required
    const killSwitchResp = await checkKillSwitch(userTeamId);
    if (killSwitchResp) return killSwitchResp;

    // asafe-ai: per-user rate limiting (Postgres-backed, multi-pod safe)
    const rateCheck = await checkRateLimit(session.user.id);
    const rateLimitHeaders = {
      "X-RateLimit-Limit": String(rateCheck.limit),
      "X-RateLimit-Remaining": String(rateCheck.remaining),
      "X-RateLimit-Reset": String(Math.ceil(rateCheck.resetAt / 1000)),
    };
    if (!rateCheck.allowed) {
      chatErrorsTotal.inc({ type: "rate_limited" });
      rateLimitActivations.inc({ team_id: userTeamId ?? "none" });
      return Response.json(
        { message: "Rate limit exceeded. Please wait before sending another message." },
        {
          status: 429,
          headers: {
            ...rateLimitHeaders,
            "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)),
          },
        },
      );
    }

    // asafe-ai Wave 12: SLO — track overall request latency (auth + setup + inference)
    const requestStart = Date.now();

    const {
      id,
      message,
      chatModel,
      toolChoice,
      allowedAppDefaultToolkit,
      allowedMcpServers,
      imageTool,
      mentions = [],
      attachments = [],
      ragCollectionId,
    } = chatApiSchemaRequestBodySchema.parse(json);

    let thread = await chatRepository.selectThreadDetails(id);

    if (!thread) {
      logger.info(`create chat thread: ${id}`);
      const newThread = await chatRepository.insertThread({
        id,
        title: "",
        userId: session.user.id,
      });
      thread = await chatRepository.selectThreadDetails(newThread.id);
    }

    if (thread!.userId !== session.user.id) {
      return new Response("Forbidden", { status: 403 });
    }

    const messages: UIMessage[] = (thread?.messages ?? []).map((m) => {
      return {
        id: m.id,
        role: m.role,
        parts: m.parts,
        metadata: m.metadata,
      };
    });

    if (messages.at(-1)?.id == message.id) {
      messages.pop();
    }
    const ingestionPreviewParts = await buildCsvIngestionPreviewParts(
      attachments,
      (key) => serverFileStorage.download(key),
    );
    if (ingestionPreviewParts.length) {
      const baseParts = [...message.parts];
      let insertionIndex = -1;
      for (let i = baseParts.length - 1; i >= 0; i -= 1) {
        if (baseParts[i]?.type === "text") {
          insertionIndex = i;
          break;
        }
      }
      if (insertionIndex !== -1) {
        baseParts.splice(insertionIndex, 0, ...ingestionPreviewParts);
        message.parts = baseParts;
      } else {
        message.parts = [...baseParts, ...ingestionPreviewParts];
      }
    }

    // W9: vision gate — strip image parts if team hasn't enabled vision
    if (!teamPolicy?.allowVision) {
      message.parts = (message.parts ?? []).filter(
        (p: any) => p?.type !== "image" && p?.type !== "image_url",
      );
    }

    if (attachments.length) {
      const firstTextIndex = message.parts.findIndex(
        (part: any) => part?.type === "text",
      );
      const attachmentParts: any[] = [];

      attachments.forEach((attachment) => {
        const exists = message.parts.some(
          (part: any) =>
            part?.type === attachment.type && part?.url === attachment.url,
        );
        if (exists) return;

        if (attachment.type === "file") {
          attachmentParts.push({
            type: "file",
            url: attachment.url,
            mediaType: attachment.mediaType,
            filename: attachment.filename,
          });
        } else if (attachment.type === "source-url") {
          attachmentParts.push({
            type: "source-url",
            url: attachment.url,
            mediaType: attachment.mediaType,
            title: attachment.filename,
          });
        }
      });

      if (attachmentParts.length) {
        if (firstTextIndex >= 0) {
          message.parts = [
            ...message.parts.slice(0, firstTextIndex),
            ...attachmentParts,
            ...message.parts.slice(firstTextIndex),
          ];
        } else {
          message.parts = [...message.parts, ...attachmentParts];
        }
      }
    }

    messages.push(message);

    // asafe-ai entitlements (ADR-0009, role-based v1): normal users (role "user") cannot pick the
    // model or use tools — both default OFF and are enforced here SERVER-SIDE, not just hidden in
    // the UI. Fine-grained per-team/per-user grants come in Wave 4; admin/editor keep control.
    const canSelectModel = session.user.role !== "user";
    const canUseTools = session.user.role !== "user";

    // asafe-ai routing (ADR-0004): task-aware Auto unless an entitled user explicitly picked a
    // model. A non-entitled user's model choice is ignored.
    const lastUserText = (message.parts ?? [])
      .filter((p: any) => p?.type === "text")
      .map((p: any) => p.text as string)
      .join(" ");
    const totalChars = messages.reduce(
      (n, m) =>
        n +
        (m.parts ?? [])
          .filter((p: any) => p?.type === "text")
          .reduce((s: number, p: any) => s + (p.text?.length ?? 0), 0),
      0,
    );
    const routing =
      canSelectModel && chatModel
        ? null
        : routeModel({
            text: lastUserText,
            hasImage: attachments.some((a) =>
              a.mediaType?.startsWith("image/"),
            ),
            hasAttachments: attachments.length > 0,
            hasTools:
              canUseTools && (mentions.length > 0 || toolChoice !== "none"),
            totalChars,
          });
    const effectiveModel = routing ? routing.model : chatModel;

    // W4: per-team model allow-list enforcement
    const teamAllowList = teamPolicy?.modelAllowList ?? [];
    if (teamAllowList.length > 0 && effectiveModel?.model && !teamAllowList.includes(effectiveModel.model)) {
      return Response.json(
        { message: `Model "${effectiveModel.model}" is not permitted for your team.` },
        { status: 403 },
      );
    }

    const rawModel = customModelProvider.getModel(effectiveModel);
    const { wrapWithGuardrails } = await import("lib/ai/guardrails");
    const { wrapWithCompression, compressionLevelFromPolicy } = await import(
      "lib/ai/compression"
    );
    const { wrapWithFallback, FALLBACK_MODEL_IDS } = await import(
      "lib/ai/fallback"
    );
    // W12.1: approved fallbacks, cheapest first, excluding the selected primary
    const fallbackModels = FALLBACK_MODEL_IDS
      .filter((id) => id !== effectiveModel?.model)
      .map((id) => customModelProvider.getModel({ provider: "openRouter", model: id }));
    const modelWithFallback = wrapWithFallback(rawModel, fallbackModels);
    const guardedModel = wrapWithGuardrails(modelWithFallback, session.user.id, teamPolicy?.guardrailPolicy);
    const model = wrapWithCompression(guardedModel, {
      level: compressionLevelFromPolicy(teamPolicy?.guardrailPolicy),
      teamId: userTeamId,
    });

    // W8: fire-and-forget audit log for this request lifecycle
    const { auditChatRequest, hashContent } = await import("lib/compliance/audit");
    const lastUserMsg = messages.findLast((m: { role: string }) => m.role === "user") as { role: string; content?: unknown } | undefined;
    const promptText = typeof lastUserMsg?.content === "string" ? lastUserMsg.content : JSON.stringify(lastUserMsg?.content ?? "");
    auditChatRequest({
      userId: session.user.id,
      teamId: userTeamId,
      model: `${effectiveModel?.provider ?? "unknown"}/${effectiveModel?.model ?? "unknown"}`,
      promptHash: hashContent(promptText),
      guardrailFired: false, // updated by guardrails middleware via event
      ragUsed: mentions.some((m: { type: string }) => m.type === "knowledge"),
    });
    if (routing) {
      logger.info(`routing: ${routing.reason}`);
      routingDecisionsTotal.inc({
        task_class: routing.taskClass,
        tier: routing.tier,
        model: routing.model.model,
      });
    }

    const supportToolCall = !isToolCallUnsupportedModel(model);

    const agentId = (
      mentions.find((m) => m.type === "agent") as Extract<
        ChatMention,
        { type: "agent" }
      >
    )?.agentId;

    const agent = await rememberAgentAction(agentId, session.user.id);

    if (agent?.instructions?.mentions) {
      mentions.push(...agent.instructions.mentions);
    }

    const useImageTool = canUseTools && Boolean(imageTool?.model);

    const isToolCallAllowed =
      canUseTools &&
      supportToolCall &&
      (toolChoice != "none" || mentions.length > 0) &&
      !useImageTool;

    // asafe-ai Wave 3 (ADR-0003): enforce team budget before starting inference
    const budgetCheck = await checkBudget(session.user.id, userTeamId);
    if (!budgetCheck.allowed) {
      chatErrorsTotal.inc({ type: "budget_exceeded" });
      return Response.json({ message: budgetCheck.reason }, { status: 402 });
    }

    const metadata: ChatMetadata = {
      agentId: agent?.id,
      toolChoice: toolChoice,
      toolCount: 0,
      chatModel: effectiveModel,
      routingReason: routing?.reason,
    };

    // W12: only inc once we're certain we'll start inference (past all early-return guards)
    activeRequests.inc();
    let ttftObserved = false;

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        const MCP_TOOLS = await safe()
          .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
          .map(() =>
            loadMcpTools({
              mentions,
              allowedMcpServers,
            }),
          )
          .orElse({});

        const WORKFLOW_TOOLS = await safe()
          .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
          .map(() =>
            loadWorkFlowTools({
              mentions,
              dataStream,
            }),
          )
          .orElse({});

        const APP_DEFAULT_TOOLS = await safe()
          .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
          .map(() =>
            loadAppDefaultTools({
              mentions,
              allowedAppDefaultToolkit,
            }),
          )
          .orElse({});
        const inProgressToolParts = extractInProgressToolPart(message);
        if (inProgressToolParts.length) {
          await Promise.all(
            inProgressToolParts.map(async (part) => {
              const output = await manualToolExecuteByLastMessage(
                part,
                { ...MCP_TOOLS, ...WORKFLOW_TOOLS, ...APP_DEFAULT_TOOLS },
                request.signal,
              );
              part.output = output;

              dataStream.write({
                type: "tool-output-available",
                toolCallId: part.toolCallId,
                output,
              });
            }),
          );
        }

        // W9: fall back to DB preferences for new threads that don't yet have thread-level prefs
        const userPreferences =
          thread?.userPreferences ||
          (await getUserPreferences(session.user.id)) ||
          undefined;

        const mcpServerCustomizations = await safe()
          .map(() => {
            if (Object.keys(MCP_TOOLS ?? {}).length === 0)
              throw new Error("No tools found");
            return rememberMcpServerCustomizationsAction(session.user.id);
          })
          .map((v) => filterMcpServerCustomizations(MCP_TOOLS!, v))
          .orElse({});

        // Wave 6 (ADR-0007): retrieve relevant knowledge chunks when a collection is active
        // ragCollectionId is passed directly in the request body; no thread.metadata column exists yet
        let ragContext: string | null = null;
        if (ragCollectionId) {
          const lastUserMessage = messages.findLast(m => m.role === "user");
          const queryText = lastUserMessage?.parts
            ?.filter((p: any) => p.type === "text")
            ?.map((p: any) => p.text)
            ?.join(" ") ?? "";
          if (queryText) {
            const chunks = await retrieveChunks(queryText, ragCollectionId).catch(() => null);
            if (chunks && chunks.length > 0) {
              ragContext = chunks
                .map((c, i) => `[Source ${i + 1}: ${c.sourceRef}]\n${c.chunkText}`)
                .join("\n\n");
            }
          }
        }

        const systemPrompt = mergeSystemPrompt(
          buildUserSystemPrompt(session.user, userPreferences, agent),
          buildMcpServerCustomizationsSystemPrompt(mcpServerCustomizations),
          !supportToolCall && buildToolCallUnsupportedModelSystemPrompt,
          ragContext ? `<knowledge_base>\nThe following context was retrieved from the company knowledge base. Use it to ground your response and cite sources as [Source N].\n\n${ragContext}\n</knowledge_base>` : undefined,
        );

        // asafe-ai Wave 5 (ADR-0005): wrap each MCP tool's execute to emit an audit record
        const AUDITED_MCP_TOOLS =
          MCP_TOOLS && Object.keys(MCP_TOOLS).length > 0
            ? Object.fromEntries(
                Object.entries(MCP_TOOLS).map(([name, tool]) => {
                  const originalExecute = (tool as any).execute;
                  if (typeof originalExecute !== "function") return [name, tool];
                  return [
                    name,
                    {
                      ...tool,
                      execute: async (...args: unknown[]) => {
                        const start = Date.now();
                        try {
                          const result = await (originalExecute as any)(...args);
                          auditMcpInvocation({
                            userId: session.user.id,
                            teamId: null, // TODO: wire teamId in Wave 4 follow-up
                            toolName: name,
                            outcome: "success",
                            durationMs: Date.now() - start,
                          }).catch(() => {}); // fire-and-forget
                          return result;
                        } catch (err) {
                          auditMcpInvocation({
                            userId: session.user.id,
                            teamId: null,
                            toolName: name,
                            outcome: "error",
                            durationMs: Date.now() - start,
                          }).catch(() => {});
                          throw err;
                        }
                      },
                    },
                  ];
                }),
              )
            : MCP_TOOLS;

        const IMAGE_TOOL: Record<string, Tool> = useImageTool
          ? {
              [ImageToolName]:
                imageTool?.model === "google"
                  ? nanoBananaTool
                  : openaiImageTool,
            }
          : {};
        const vercelAITooles = safe({
          ...AUDITED_MCP_TOOLS,
          ...WORKFLOW_TOOLS,
        })
          .map((t) => {
            const bindingTools =
              toolChoice === "manual" ||
              (message.metadata as ChatMetadata)?.toolChoice === "manual"
                ? excludeToolExecution(t)
                : t;
            return {
              ...bindingTools,
              ...APP_DEFAULT_TOOLS, // APP_DEFAULT_TOOLS Not Supported Manual
              ...IMAGE_TOOL,
            };
          })
          .unwrap();
        metadata.toolCount = Object.keys(vercelAITooles).length;

        const allowedMcpTools = Object.values(allowedMcpServers ?? {})
          .map((t) => t.tools)
          .flat();

        logger.info(
          `${agent ? `agent: ${agent.name}, ` : ""}tool mode: ${toolChoice}, mentions: ${mentions.length}`,
        );

        logger.info(
          `allowedMcpTools: ${allowedMcpTools.length ?? 0}, allowedAppDefaultToolkit: ${allowedAppDefaultToolkit?.length ?? 0}`,
        );
        if (useImageTool) {
          logger.info(`binding tool count Image: ${imageTool?.model}`);
        } else {
          logger.info(
            `binding tool count APP_DEFAULT: ${Object.keys(APP_DEFAULT_TOOLS ?? {}).length}, MCP: ${Object.keys(MCP_TOOLS ?? {}).length}, Workflow: ${Object.keys(WORKFLOW_TOOLS ?? {}).length}`,
          );
        }
        logger.info(
          `model: ${effectiveModel?.provider}/${effectiveModel?.model}`,
        );

        const result = streamText({
          model,
          system: systemPrompt,
          messages: convertToModelMessages(messages),
          experimental_transform: smoothStream({ chunking: "word" }),
          maxRetries: 2,
          tools: vercelAITooles,
          stopWhen: stepCountIs(10),
          toolChoice: "auto",
          abortSignal: request.signal,
          onChunk: ({ chunk }) => {
            if (!ttftObserved && chunk.type === "text-delta") {
              ttftMs.observe(
                {
                  provider: effectiveModel?.provider ?? "unknown",
                  model: effectiveModel?.model ?? "unknown",
                  task_class: routing?.taskClass ?? "unknown",
                },
                Date.now() - requestStart,
              );
              ttftObserved = true;
            }
          },
        });
        result.consumeStream();
        dataStream.merge(
          result.toUIMessageStream({
            messageMetadata: ({ part }) => {
              if (part.type == "finish") {
                metadata.usage = part.totalUsage;
                return metadata;
              }
            },
          }),
        );
      },

      generateId: generateUUID,
      onFinish: async ({ responseMessage }) => {
        if (responseMessage.id == message.id) {
          await chatRepository.upsertMessage({
            threadId: thread!.id,
            ...responseMessage,
            parts: responseMessage.parts.map(convertToSavePart),
            metadata,
          });
        } else {
          await chatRepository.upsertMessage({
            threadId: thread!.id,
            role: message.role,
            parts: message.parts.map(convertToSavePart),
            id: message.id,
          });
          await chatRepository.upsertMessage({
            threadId: thread!.id,
            role: responseMessage.role,
            id: responseMessage.id,
            parts: responseMessage.parts.map(convertToSavePart),
            metadata,
          });
        }

        if (agent) {
          agentRepository.updateAgent(agent.id, session.user.id, {
            updatedAt: new Date(),
          } as any);
        }

        // asafe-ai Wave 3 (ADR-0003): record usage event after inference
        if (metadata.usage) {
          const inputTokens = metadata.usage.inputTokens ?? 0;
          const outputTokens = metadata.usage.outputTokens ?? 0;
          const costUsd = estimateCostUsd(
            effectiveModel?.model ?? "",
            inputTokens,
            outputTokens,
          );
          recordUsage({
            userId: session.user.id,
            teamId: userTeamId,
            sessionId: thread?.id ?? null,
            model: effectiveModel?.model ?? "",
            provider: effectiveModel?.provider ?? "",
            taskClass: routing?.taskClass ?? null,
            tier: routing?.tier ?? null,
            promptTokens: inputTokens,
            completionTokens: outputTokens,
            costUsd,
          }).catch((e) => logger.error("recordUsage failed:", e));
        }

        // asafe-ai Wave 12: record end-to-end latency and release active-request slot
        activeRequests.dec();
        chatLatencyMs.observe(
          {
            provider: effectiveModel?.provider ?? "unknown",
            model: effectiveModel?.model ?? "unknown",
            task_class: routing?.taskClass ?? "unknown",
          },
          Date.now() - requestStart,
        );
      },
      onError: (err: unknown) => {
        activeRequests.dec();
        // W12: track provider-level errors so Grafana can alert on elevated rates
        const status = (err as any)?.statusCode ?? (err as any)?.status ?? 0;
        const errorType =
          status === 429 ? "rate_limited" :
          status >= 500 ? "provider_error" :
          status >= 400 ? "client_error" :
          "unknown";
        providerErrorsTotal.inc({
          provider: effectiveModel?.provider ?? "unknown",
          model: effectiveModel?.model ?? "unknown",
          error_type: errorType,
        });
        return handleError(err);
      },
      originalMessages: messages,
    });

    const streamResponse = createUIMessageStreamResponse({ stream });
    Object.entries(rateLimitHeaders).forEach(([k, v]) => streamResponse.headers.set(k, v));
    return streamResponse;
  } catch (error: any) {
    logger.error(error);
    return Response.json({ message: error.message }, { status: 500 });
  }
}
