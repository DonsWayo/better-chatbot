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
import { getSession } from "auth/server";
import { colorize } from "consola/utils";
import { resolveEffectiveModelAllowList } from "lib/admin/effective-models";
import { getTeamPolicy, getUserPrimaryTeamId } from "lib/admin/teams";
import { checkBudget, estimateCostUsd, recordUsage } from "lib/ai/budget";
import { retrieveForChat } from "lib/ai/embeddings/retrieval";
import { auditMcpInvocation } from "lib/ai/mcp/audit";
import { ImageToolName } from "lib/ai/tools";
import { nanoBananaTool, openaiImageTool } from "lib/ai/tools/image";
import { serverFileStorage } from "lib/file-storage";
import { runPostTurnMemoryExtraction } from "lib/memory/extract";
import { buildMemoryPromptBlock } from "lib/memory/inject";
import { resolveMemoryPolicy } from "lib/memory/policy";
import { checkKillSwitch } from "lib/observability/kill-switch";
import {
  chatErrorsTotal,
  chatLatencyMs,
  routingDecisionsTotal,
} from "lib/observability/metrics";
import {
  activeRequests,
  providerErrorsTotal,
  rateLimitActivations,
  ttftMs,
} from "lib/observability/slo";
import { checkRateLimit } from "lib/rate-limit";
import { isThreadShared } from "lib/teamspaces/folders";
import { getUserPreferences } from "lib/user/server";
import { generateUUID } from "lib/utils";
// W11: compression wired via wrapWithCompression middleware at model creation (line ~253)
import {
  rememberAgentAction,
  rememberMcpServerCustomizationsAction,
} from "./actions";
import { createPartialPersister } from "./shared-stream-partials";
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
  wrapToolsWithGuardrails,
} from "./shared.chat";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `Chat API: `),
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
        {
          message:
            "Rate limit exceeded. Please wait before sending another message.",
        },
        {
          status: 429,
          headers: {
            ...rateLimitHeaders,
            "Retry-After": String(
              Math.ceil((rateCheck.resetAt - Date.now()) / 1000),
            ),
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

    // Wave 6 phase 2: chat may reference SEVERAL collections — the explicit
    // picker (ragCollectionId) plus any @knowledge mentions. Access is
    // enforced downstream by retrieveForChat (unified visibility resolver).
    const knowledgeCollectionIds = [
      ...new Set([
        ...(ragCollectionId ? [ragCollectionId] : []),
        ...mentions.flatMap((m) =>
          m.type === "knowledge" ? [m.collectionId] : [],
        ),
      ]),
    ];

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

    // asafe-ai entitlements (ADR-0009, role-based v1): normal users cannot pick
    // the model or use tools — both default OFF and are enforced here
    // SERVER-SIDE, not just hidden in the UI. Fail CLOSED: only the known
    // elevated roles get builder powers; a missing/unknown role (SSO edge
    // cases) gets the zen defaults.
    const isElevated =
      session.user.role === "admin" || session.user.role === "editor";
    const canSelectModel = isElevated;
    const canUseTools = isElevated;

    // asafe-ai entitlements (ADR-0009, layered): resolve the effective model allow-list ONCE —
    // org base → team policy (inherit/replace) → additive per-user grants. `null` = unrestricted
    // (empty lists are normalized to null inside the resolver). The same list constrains Auto
    // routing below AND backstops explicit picks server-side.
    const effectiveModelAllowList = await resolveEffectiveModelAllowList(
      session.user.id,
      userTeamId,
    );

    // asafe-ai routing (ADR-0004): task-aware Auto unless an entitled user explicitly picked a
    // model. A non-entitled user's model choice is ignored. Auto only routes among entitled
    // models (allowedModels), so it never selects a model the user can't use.
    const lastUserText = textOfParts(message.parts).join(" ");
    const totalChars = messages.reduce(
      (n, m) => n + textOfParts(m.parts).reduce((s, t) => s + t.length, 0),
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
            allowedModels: effectiveModelAllowList ?? undefined,
          });
    const effectiveModel = routing ? routing.model : chatModel;

    // ADR-0009 enforcement at the model seam: the resolved layered list gates BOTH explicit picks
    // and routed decisions (routing pre-filters candidates above; this 403 is the backstop, e.g.
    // when the allow-list excludes every routable tier).
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

    const rawModel = customModelProvider.getModel(effectiveModel);
    const { wrapWithGuardrails } = await import("lib/ai/guardrails");
    const { wrapWithCompression, compressionLevelFromPolicy } = await import(
      "lib/ai/compression"
    );
    const { wrapWithFallback, FALLBACK_MODEL_IDS } = await import(
      "lib/ai/fallback"
    );
    // W12.1: approved fallbacks, cheapest first, excluding the selected primary
    const fallbackModels = FALLBACK_MODEL_IDS.filter(
      (id) => id !== effectiveModel?.model,
    ).map((id) =>
      customModelProvider.getModel({ provider: "openRouter", model: id }),
    );
    const modelWithFallback = wrapWithFallback(rawModel, fallbackModels);
    const guardedModel = wrapWithGuardrails(
      modelWithFallback,
      session.user.id,
      teamPolicy?.guardrailPolicy,
    );
    const model = wrapWithCompression(guardedModel, {
      level: compressionLevelFromPolicy(teamPolicy?.guardrailPolicy),
      teamId: userTeamId,
    });

    // W8: fire-and-forget audit log for this request lifecycle
    const { auditChatRequest, hashContent } = await import(
      "lib/compliance/audit"
    );
    const lastUserMsg = messages.findLast(
      (m: { role: string }) => m.role === "user",
    ) as { role: string; content?: unknown } | undefined;
    const promptText =
      typeof lastUserMsg?.content === "string"
        ? lastUserMsg.content
        : JSON.stringify(lastUserMsg?.content ?? "");
    auditChatRequest({
      userId: session.user.id,
      teamId: userTeamId,
      model: `${effectiveModel?.provider ?? "unknown"}/${effectiveModel?.model ?? "unknown"}`,
      promptHash: hashContent(promptText),
      guardrailFired: false, // updated by guardrails middleware via event
      ragUsed: knowledgeCollectionIds.length > 0,
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

    // W9 feature toggle, enforced server-side like allowVision (default-deny,
    // enabled per team in /admin). Found unenforced by the wave audit.
    const imageGenAllowed = Boolean(teamPolicy?.allowImageGen);
    const useImageTool =
      canUseTools && imageGenAllowed && Boolean(imageTool?.model);

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

    // Near-live shared generation (v1): pin the assistant message id up front
    // (mirroring the SDK's own derivation — the last original message's id
    // when it is an assistant continuation, a fresh uuid otherwise) so the
    // throttled partial persists below and the final onFinish persist target
    // the SAME row. `generateId` on createUIMessageStream returns this id.
    const assistantMessageId =
      message.role === "assistant" ? message.id : generateUUID();

    // Owner-side only, server-side only: when (and only when) the thread is
    // team-shared, upsert the in-progress assistant text at most every ~2.5s
    // so teammates' read-only views grow during generation via the existing
    // Electric chat_message shape. The user message is persisted before the
    // first partial so viewers see the question and createdAt ordering stays
    // correct. Failures never break the stream (fire-and-forget).
    let userMessagePersistedForPartial = message.role === "assistant";
    const partialPersister = createPartialPersister({
      isShared: () => isThreadShared(thread!.id),
      persist: async (accumulatedText) => {
        if (!userMessagePersistedForPartial) {
          await chatRepository.upsertMessage({
            threadId: thread!.id,
            role: message.role,
            parts: message.parts.map(convertToSavePart),
            id: message.id,
          });
          userMessagePersistedForPartial = true;
        }
        await chatRepository.upsertMessage({
          threadId: thread!.id,
          id: assistantMessageId,
          role: "assistant",
          parts: [{ type: "text", text: accumulatedText }],
          metadata: { ...metadata, streaming: true, streamingAt: Date.now() },
        });
      },
      onError: (e) => logger.warn("partial stream persist failed:", e),
    });

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
              // W7: workflow LLM nodes scan with the invoking team's posture
              guardrailCtx: {
                userId: session.user.id,
                policy: teamPolicy?.guardrailPolicy,
              },
            }),
          )
          .orElse({});

        const APP_DEFAULT_TOOLS = await safe()
          .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
          .map(() =>
            loadAppDefaultTools({
              mentions,
              allowedAppDefaultToolkit,
              userId: session.user.id,
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
                // W7: shield manually-confirmed tool outputs too
                {
                  userId: session.user.id,
                  policy: teamPolicy?.guardrailPolicy,
                },
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

        // Wave 6 phase 2 (ADR-0007): hybrid retrieval (pgvector + FTS, RRF)
        // across every mentioned collection the user can access. The payload
        // carries a deduped [Source N] list that is attached to the message
        // metadata so the UI can render citations.
        let ragContext: string | null = null;
        if (knowledgeCollectionIds.length > 0) {
          const lastUserMessage = messages.findLast((m) => m.role === "user");
          const queryText =
            lastUserMessage?.parts
              ?.map((p) => (p.type === "text" ? p.text : ""))
              ?.filter(Boolean)
              ?.join(" ") ?? "";
          if (queryText) {
            const ragPayload = await retrieveForChat(
              queryText,
              knowledgeCollectionIds,
              session.user.id,
              undefined,
              userTeamId,
            ).catch((e) => {
              logger.error("RAG retrieval failed", e);
              return null;
            });
            if (ragPayload) {
              ragContext = ragPayload.context;
              metadata.ragSources = ragPayload.sources;
            }
          }
        }

        // asafe-ai user memory (docs/design/user-memory.md): persistent
        // <user_memory> block injected into the system prompt. Gated by the
        // layered org→team policy and the user's tri-state mode; temporary
        // chats are excluded automatically (they use /api/chat/temporary and
        // never reach this route). Failures must never block the chat.
        let memoryBlock: string | null = null;
        try {
          if ((userPreferences?.memoryMode ?? "on") === "on") {
            const memoryPolicy = await resolveMemoryPolicy(userTeamId);
            if (memoryPolicy.enabled) {
              memoryBlock = await buildMemoryPromptBlock(
                session.user.id,
                lastUserText,
              );
            }
          }
        } catch (e) {
          logger.error("memory injection failed:", e);
        }

        const systemPrompt = mergeSystemPrompt(
          buildUserSystemPrompt(session.user, userPreferences, agent),
          memoryBlock || undefined,
          buildMcpServerCustomizationsSystemPrompt(mcpServerCustomizations),
          !supportToolCall && buildToolCallUnsupportedModelSystemPrompt,
          ragContext
            ? `<knowledge_base>\nThe following context was retrieved from the company knowledge base. Use it to ground your response and cite sources as [Source N].\n\n${ragContext}\n</knowledge_base>`
            : undefined,
        );

        // asafe-ai Wave 5 (ADR-0005): wrap each MCP tool's execute to emit an audit record
        const AUDITED_MCP_TOOLS =
          MCP_TOOLS && Object.keys(MCP_TOOLS).length > 0
            ? Object.fromEntries(
                Object.entries(MCP_TOOLS).map(([name, tool]) => {
                  const originalExecute = (tool as Tool).execute;
                  if (typeof originalExecute !== "function")
                    return [name, tool];
                  return [
                    name,
                    {
                      ...tool,
                      execute: async (
                        ...args: Parameters<NonNullable<Tool["execute"]>>
                      ) => {
                        const start = Date.now();
                        try {
                          const result = await originalExecute(...args);
                          auditMcpInvocation({
                            userId: session.user.id,
                            teamId: userTeamId,
                            toolName: name,
                            outcome: "success",
                            durationMs: Date.now() - start,
                          }).catch(() => {}); // fire-and-forget
                          return result;
                        } catch (err) {
                          auditMcpInvocation({
                            userId: session.user.id,
                            teamId: userTeamId,
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
          // W7 GA gate (ADR-0008): tool outputs are untrusted — scan every
          // execute result for prompt-injection and spotlight/block per policy.
          .map((t) =>
            wrapToolsWithGuardrails(t, {
              userId: session.user.id,
              policy: teamPolicy?.guardrailPolicy,
            }),
          )
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
            if (chunk.type === "text-delta") {
              if (!ttftObserved) {
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
              // Shared threads only: throttled partial persistence (no-op
              // otherwise; see shared-stream-partials.ts).
              partialPersister.append(chunk.text);
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

      // Must match the partial persister's target row (near-live shared
      // generation) — the SDK calls this exactly once for the response id.
      generateId: () => assistantMessageId,
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
          agentRepository
            .updateAgent(agent.id, session.user.id, {
              updatedAt: new Date(),
            } as unknown as Parameters<
              typeof agentRepository.updateAgent
            >[2])
            .catch((e) => logger.error("touchAgent failed", e));
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

        // asafe-ai user memory: post-turn extraction, fire-and-forget — all
        // gates (org/team policy, user tri-state, explicit-remember intent
        // when implicit extraction is policy-disabled) live inside the lib.
        runPostTurnMemoryExtraction({
          userId: session.user.id,
          teamId: userTeamId,
          threadId: thread!.id,
          userText: lastUserText,
          assistantText: textOfParts(responseMessage.parts).join("\n"),
          preferences: thread?.userPreferences ?? null,
        }).catch((e) => logger.error("memory extraction failed:", e));

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
          status === 429
            ? "rate_limited"
            : status >= 500
              ? "provider_error"
              : status >= 400
                ? "client_error"
                : "unknown";
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
    Object.entries(rateLimitHeaders).forEach(([k, v]) =>
      streamResponse.headers.set(k, v),
    );
    return streamResponse;
  } catch (error: any) {
    logger.error(error);
    return Response.json({ message: error.message }, { status: 500 });
  }
}
