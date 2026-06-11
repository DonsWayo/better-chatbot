import {
  UIMessage,
  convertToModelMessages,
  generateObject,
  generateText,
} from "ai";
import { ApprovalPendingError } from "lib/agent-platform/approval-error";
import { resolvePolicy } from "lib/ai/guardrails/policies";
import {
  type GuardrailFiring,
  scanInput,
  scanOutput,
} from "lib/ai/guardrails/scan";
import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";
import { customModelProvider } from "lib/ai/models";
import { DefaultToolName } from "lib/ai/tools";
import {
  exaContentsToolForWorkflow,
  exaSearchToolForWorkflow,
} from "lib/ai/tools/web/web-search";
import { AppError } from "lib/errors";
import { jsonSchemaToZod } from "lib/json-schema-to-zod";
import { toAny } from "lib/utils";
import { checkConditionBranch } from "../condition";
import {
  convertTiptapJsonToAiMessage,
  convertTiptapJsonToText,
} from "../shared.workflow";
import {
  ApprovalNodeData,
  ConditionNodeData,
  HttpNodeData,
  InputNodeData,
  LLMNodeData,
  OutputNodeData,
  OutputSchemaSourceKey,
  TemplateNodeData,
  ToolNodeData,
  WorkflowNodeData,
} from "../workflow.interface";
import { WorkflowRuntimeState } from "./graph-store";

/**
 * Interface for node executor functions.
 * Each node type implements this interface to define its execution behavior.
 *
 * @param input - Contains the node data and current workflow state
 * @returns Object with optional input and output data to be stored in workflow state
 */
export type NodeExecutor<T extends WorkflowNodeData = any> = (input: {
  node: T;
  state: WorkflowRuntimeState;
}) =>
  | Promise<{
      input?: any; // Input data used by this node (for debugging/history)
      output?: any; // Output data produced by this node (available to subsequent nodes)
    }>
  | {
      input?: any;
      output?: any;
    };

/**
 * Input Node Executor
 * Entry point of the workflow - passes the initial query data to subsequent nodes
 */
export const inputNodeExecutor: NodeExecutor<InputNodeData> = ({ state }) => {
  return {
    output: state.query, // Pass through the initial workflow input
  };
};

/**
 * Output Node Executor
 * Exit point of the workflow - collects data from specified source nodes
 * and combines them into the final workflow result
 */
export const outputNodeExecutor: NodeExecutor<OutputNodeData> = ({
  node,
  state,
}) => {
  return {
    output: node.outputData.reduce((acc, cur) => {
      // Collect data from each configured source node
      acc[cur.key] = state.getOutput(cur.source!);
      return acc;
    }, {} as object),
  };
};

// ── W7 guardrails at the workflow LLM seam (ADR-0008) ────────────────────────
// Workflow LLM nodes run user-authored prompts against company data, OUTSIDE
// the chat route's wrapLanguageModel middleware — so the same input/output
// scanning is applied here. Policy comes from the invoking team's posture
// (state.guardrailPolicy, injected by the caller) or the org default.

const guardrailsEnabled = () =>
  process.env.ASAFE_GUARDRAILS_ENABLED !== "false";

function recordWorkflowFirings(
  state: WorkflowRuntimeState,
  firings: GuardrailFiring[],
  blocked: boolean,
  posture: string,
): void {
  if (firings.length === 0 || !state.userId) return;
  // Lazy import keeps the DB/metrics dependency out of this module's static graph.
  import("lib/ai/guardrails")
    .then((g) =>
      g.recordGuardrailFirings(state.userId!, firings, blocked, posture),
    )
    .catch(() => {});
}

/**
 * scanInput over the RESOLVED prompt content (mentions already substituted
 * with upstream node data). Blocked → node error with a clear message;
 * redact → redacted content flows on to the provider.
 */
function applyInputGuardrails(
  messages: Omit<UIMessage, "id">[],
  state: WorkflowRuntimeState,
): Omit<UIMessage, "id">[] {
  if (!guardrailsEnabled()) return messages;
  const policy = resolvePolicy(state.guardrailPolicy);
  const firings: GuardrailFiring[] = [];
  let blockReason: string | undefined;

  const processed = messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => {
      if (part.type !== "text") return part;
      const r = scanInput(part.text, policy);
      firings.push(...r.firings);
      if (r.blocked && !blockReason) blockReason = r.blockReason;
      return r.text !== part.text ? { ...part, text: r.text } : part;
    }),
  }));

  recordWorkflowFirings(state, firings, Boolean(blockReason), policy.posture);
  if (blockReason) {
    throw new Error(`Guardrail blocked LLM node input: ${blockReason}`);
  }
  return processed;
}

/** Output-stage leak scrub, honoring the policy's outputLeakProtection flag. */
function applyOutputGuardrails(
  text: string,
  state: WorkflowRuntimeState,
): string {
  if (!guardrailsEnabled()) return text;
  const policy = resolvePolicy(state.guardrailPolicy);
  if (!policy.outputLeakProtection) return text;
  return scanOutput(text).text;
}

/**
 * LLM Node Executor
 * Executes Large Language Model interactions with support for:
 * - Multiple messages (system, user, assistant)
 * - References to previous node outputs via mentions
 * - Configurable model selection
 */
export const llmNodeExecutor: NodeExecutor<LLMNodeData> = async ({
  node,
  state,
}) => {
  const model = customModelProvider.getModel(node.model);

  // Convert TipTap JSON messages to AI SDK format, resolving mentions to actual data
  // W7: then run the resolved content through the input guardrail stage.
  const messages: Omit<UIMessage, "id">[] = applyInputGuardrails(
    node.messages.map((message) =>
      convertTiptapJsonToAiMessage({
        role: message.role,
        getOutput: state.getOutput, // Provides access to previous node outputs
        json: message.content,
      }),
    ),
    state,
  );

  const isTextResponse =
    node.outputSchema.properties?.answer?.type === "string";

  state.setInput(node.id, {
    chatModel: node.model,
    messages,
    responseFormat: isTextResponse ? "text" : "object",
  });

  if (isTextResponse) {
    const response = await generateText({
      model,
      messages: convertToModelMessages(messages),
    });
    return {
      output: {
        totalTokens: response.usage.totalTokens,
        // W7: output-stage scrub (system-prompt-leak markers) per policy
        answer: applyOutputGuardrails(response.text, state),
      },
    };
  }

  const response = await generateObject({
    model,
    messages: convertToModelMessages(messages),
    schema: jsonSchemaToZod(node.outputSchema.properties.answer),
    maxRetries: 3,
  });

  return {
    output: {
      totalTokens: response.usage.totalTokens,
      answer: response.object,
    },
  };
};

/**
 * Condition Node Executor
 * Evaluates conditional logic and determines which branch(es) to execute next.
 * Supports if-elseIf-else structure with AND/OR logical operators.
 */
export const conditionNodeExecutor: NodeExecutor<ConditionNodeData> = async ({
  node,
  state,
}) => {
  // Evaluate conditions in order: if, then elseIf branches, finally else
  const okBranch =
    [node.branches.if, ...(node.branches.elseIf || [])].find((branch) => {
      return checkConditionBranch(branch, state.getOutput);
    }) || node.branches.else;

  // Find the target nodes for the selected branch
  const nextNodes = state.edges
    .filter(
      (edge) =>
        edge.uiConfig.sourceHandle === okBranch.id && edge.source == node.id,
    )
    .map((edge) => state.nodes.find((node) => node.id === edge.target)!)
    .filter(Boolean);

  return {
    output: {
      type: okBranch.type, // Which branch was taken
      branch: okBranch.id, // Branch identifier
      nextNodes, // Nodes to execute next (used by dynamic edge resolution)
    },
  };
};

/**
 * Tool Node Executor
 * Executes external tools (primarily MCP tools) with optional LLM-generated parameters.
 *
 * Workflow:
 * 1. If tool has parameter schema, use LLM to generate parameters from message
 * 2. Execute the tool with generated or empty parameters
 * 3. Return the tool execution result
 */
export const toolNodeExecutor: NodeExecutor<ToolNodeData> = async ({
  node,
  state,
}) => {
  const result: {
    input: any;
    output: any;
  } = {
    input: undefined,
    output: undefined,
  };

  if (!node.tool) throw new Error("Tool not found");

  // Handle parameter generation
  if (!node.tool?.parameterSchema) {
    // Tool doesn't need parameters
    result.input = {
      parameter: undefined,
    };
  } else {
    // Use LLM to generate tool parameters from the provided message
    let prompt: string | undefined = node.message
      ? toAny(
          convertTiptapJsonToAiMessage({
            role: "user",
            getOutput: state.getOutput, // Access to previous node outputs
            json: node.message,
          }),
        ).parts[0]?.text
      : undefined;

    // W7: this prompt is user-authored + resolved upstream data and goes to a
    // provider — same input guardrail stage as the LLM node.
    if (prompt && guardrailsEnabled()) {
      const policy = resolvePolicy(state.guardrailPolicy);
      const r = scanInput(prompt, policy);
      recordWorkflowFirings(state, r.firings, r.blocked, policy.posture);
      if (r.blocked) {
        throw new Error(`Guardrail blocked tool node prompt: ${r.blockReason}`);
      }
      prompt = r.text;
    }

    const response = await generateText({
      model: customModelProvider.getModel(node.model),
      toolChoice: "required", // Force the model to call the tool
      prompt: prompt || "",
      tools: {
        [node.tool.id]: {
          description: node.tool.description,
          inputSchema: jsonSchemaToZod(node.tool.parameterSchema),
        },
      },
    });

    result.input = {
      parameter: response.toolCalls.find((call) => call.input)?.input,
      prompt,
    };
  }

  // Execute the tool based on its type
  if (node.tool.type == "mcp-tool") {
    const toolResult = (await mcpClientsManager.toolCall(
      node.tool.serverId,
      node.tool.id,
      result.input.parameter,
    )) as any;
    if (toolResult.isError) {
      throw new Error(
        toolResult.error?.message ||
          toolResult.error?.name ||
          JSON.stringify(toolResult),
      );
    }
    result.output = {
      tool_result: toolResult,
    };
  } else if (node.tool.type == "app-tool") {
    const executor =
      node.tool.id == DefaultToolName.WebContent
        ? exaContentsToolForWorkflow.execute
        : node.tool.id == DefaultToolName.WebSearch
          ? exaSearchToolForWorkflow.execute
          : () => "Unknown tool";

    const toolResult = await executor?.(result.input.parameter, {
      messages: [],
      toolCallId: "",
    });
    result.output = {
      tool_result: toolResult,
    };
  } else {
    // Placeholder for future tool types
    result.output = {
      tool_result: {
        error: `Not implemented "${toAny(node.tool)?.type}"`,
      },
    };
  }

  return result;
};

/**
 * Resolves HttpValue to actual string value
 * Handles string literals and references to other node outputs
 */
function resolveHttpValue(
  value: string | OutputSchemaSourceKey | undefined,
  getOutput: WorkflowRuntimeState["getOutput"],
): string {
  if (value === undefined) return "";

  if (typeof value === "string") return value;

  // It's an OutputSchemaSourceKey - resolve from node output
  const output = getOutput(value);
  if (output === undefined || output === null) return "";

  if (typeof output === "string" || typeof output === "number") {
    return output.toString();
  }

  // For objects/arrays, stringify them
  return JSON.stringify(output);
}

/**
 * HTTP Node Executor
 * Performs HTTP requests to external services with configurable parameters.
 *
 * Features:
 * - Support for all standard HTTP methods (GET, POST, PUT, DELETE, PATCH, HEAD)
 * - Dynamic URL, headers, query parameters, and body with variable substitution
 * - Configurable timeout
 * - Comprehensive response data including status, headers, and body
 */
export const httpNodeExecutor: NodeExecutor<HttpNodeData> = async ({
  node,
  state,
}) => {
  // Default timeout of 30 seconds
  const timeout = node.timeout || 30000;

  // Resolve URL with variable substitution
  const url = resolveHttpValue(node.url, state.getOutput);

  if (!url) {
    throw new Error("HTTP node requires a URL");
  }

  // Build query parameters
  const searchParams = new URLSearchParams();
  for (const queryParam of node.query || []) {
    if (queryParam.key && queryParam.value !== undefined) {
      const value = resolveHttpValue(queryParam.value, state.getOutput);
      if (value) {
        searchParams.append(queryParam.key, value);
      }
    }
  }

  // Construct final URL with query parameters
  const finalUrl = searchParams.toString()
    ? `${url}${url.includes("?") ? "&" : "?"}${searchParams.toString()}`
    : url;

  // Build headers
  const headers: Record<string, string> = {};
  for (const header of node.headers || []) {
    if (header.key && header.value !== undefined) {
      const value = resolveHttpValue(header.value, state.getOutput);
      if (value) {
        headers[header.key] = value;
      }
    }
  }

  // Build request body
  let body: string | undefined;
  if (node.body && ["POST", "PUT", "PATCH"].includes(node.method)) {
    body = resolveHttpValue(node.body, state.getOutput);

    // Set default content-type if not specified and body is present
    if (body && !headers["Content-Type"] && !headers["content-type"]) {
      // Try to detect JSON format
      try {
        JSON.parse(body);
        headers["Content-Type"] = "application/json";
      } catch {
        headers["Content-Type"] = "text/plain";
      }
    }
  }

  const startTime = Date.now();

  try {
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(finalUrl, {
      method: node.method,
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Parse response body as string
    let responseBody: string;
    try {
      responseBody = await response.text();
    } catch {
      // If parsing fails, return empty string
      responseBody = "";
    }

    // Convert response headers to object
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const duration = Date.now() - startTime;

    const request = {
      url: finalUrl,
      method: node.method,
      headers,
      body,
      timeout,
    };
    const responseData = {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: responseHeaders,
      body: responseBody,
      duration,
      size: response.headers.get("content-length")
        ? parseInt(response.headers.get("content-length")!)
        : undefined,
    };
    if (!response.ok) {
      state.setInput(node.id, {
        request,
        response: responseData,
      });
      throw new AppError(response.status.toString(), response.statusText);
    }

    return {
      input: {
        request,
      },
      output: {
        response: responseData,
      },
    };
  } catch (error: any) {
    if (error instanceof AppError) {
      throw error;
    }
    const duration = Date.now() - startTime;

    // Handle different types of errors
    let errorMessage = error.message;
    let errorType = "unknown";

    if (error.name === "AbortError") {
      errorMessage = `Request timeout after ${timeout}ms`;
      errorType = "timeout";
    } else if (error.code === "ENOTFOUND") {
      errorMessage = `DNS resolution failed for ${finalUrl}`;
      errorType = "dns";
    } else if (error.code === "ECONNREFUSED") {
      errorMessage = `Connection refused to ${finalUrl}`;
      errorType = "connection";
    }
    state.setInput(node.id, {
      request: { url: finalUrl, method: node.method, headers, body, timeout },
      response: {
        status: 0,
        statusText: errorMessage,
        ok: false,
        headers: {},
        body: "",
        duration,
        error: {
          type: errorType,
          message: errorMessage,
        },
      },
    });
    throw error;
  }
};

/**
 * Approval Node Executor (Agent Platform #24)
 *
 * The approval semantic is "park the run", not "compute a value":
 * 1. Reads the governing agent session id from the workflow runtime state
 *    (`state.agentSessionId`, injected by the caller that created the
 *    session — see createWorkflowExecutor / the execute route). Without it
 *    the node fails: an ungoverned run has nothing to park.
 * 2. Writes a pending approval_request row and flips the session to
 *    awaiting_approval (createApprovalRequest).
 * 3. Throws ApprovalPendingError so the ts-edge graph halts. Catchers
 *    (route / worker) must treat that error as a pause via
 *    isApprovalPending(), not as a failure.
 *
 * The recorded stepIndex is best-effort: the count of nodes that have
 * produced output so far (the persistent step index lives in
 * persistent-executor's closure and is not reachable from inside a node).
 *
 * `createApprovalRequest` is imported dynamically so this module stays
 * importable without pulling the server-only DB layer until an approval
 * node actually runs.
 */
export const approvalNodeExecutor: NodeExecutor<ApprovalNodeData> = async ({
  node,
  state,
}) => {
  const sessionId = state.agentSessionId;
  if (!sessionId) {
    throw new Error(
      "Approval node requires a governed agent session (no agentSessionId in workflow runtime state)",
    );
  }

  const stepIndex = Object.keys(state.outputs ?? {}).length;
  const { createApprovalRequest } = await import(
    "lib/agent-platform/approvals"
  );
  const request = await createApprovalRequest({
    sessionId,
    stepIndex,
    requestedRole: node.requestedRole ?? "team-admin",
    payload: {
      nodeId: node.id,
      nodeName: node.name,
      message: node.message,
    },
  });

  throw new ApprovalPendingError(sessionId, request.id, node.message);
};

/**
 * Template Node Executor
 * Processes text templates with variable substitution using TipTap content.
 *
 * Features:
 * - Variable substitution from previous node outputs
 * - Support for mentions in template content
 * - Simple text output for easy consumption by other nodes
 */
export const templateNodeExecutor: NodeExecutor<TemplateNodeData> = ({
  node,
  state,
}) => {
  let text: string = "";
  // Convert TipTap template content to text with variable substitution
  if (node.template.type == "tiptap") {
    text = convertTiptapJsonToText({
      getOutput: state.getOutput, // Access to previous node outputs for variable substitution
      json: node.template.tiptap,
    });
  }
  return {
    output: {
      template: text,
    },
  };
};
