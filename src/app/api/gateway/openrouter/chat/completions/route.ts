/**
 * POST /api/gateway/openrouter/chat/completions
 *
 * OpenAI-compatible chat-completions proxy for the desktop's governed coding
 * surface (opencode). See ../../shared.ts for the full contract; in short:
 *
 *   1. AUTH        — `Authorization: Bearer <better-auth session cookie value>`
 *                    (the signed `better-auth.session_token` cookie value the
 *                    desktop exports as ASAFE_SESSION_TOKEN). 401 otherwise.
 *   2. ENTITLEMENT — requested model (friendly id or OpenRouter slug alias)
 *                    must be on the approved short list AND in the caller's
 *                    effective allow-list (org base + team override + user
 *                    grants). 403 otherwise.
 *   3. BUDGET      — checkBudget before forwarding (402 when exhausted);
 *                    recordUsage + estimateCostUsd after completion (final
 *                    usage SSE chunk when streaming, response.usage otherwise).
 *   4. PROXY       — forwards to OpenRouter with the server-held
 *                    OPENROUTER_API_KEY (the client's Authorization header is
 *                    never forwarded; the key is never echoed in errors).
 *                    SSE pass-through for `stream: true`. 60s timeout to
 *                    receive upstream HEADERS — an established stream may run
 *                    longer.
 *   5. AUDIT       — fire-and-forget `gateway_completion` event with
 *                    { model, originSurface: "opencode", stream }; prompt
 *                    content is never logged.
 */

import { checkBudget, estimateCostUsd, recordUsage } from "lib/ai/budget";
import { writeAuditLog } from "lib/compliance/audit";
import globalLogger from "logger";
import {
  authenticateGatewayRequest,
  createUsageCapturingStream,
  gatewayError,
  getEntitledGatewayModels,
  resolveGatewayModel,
} from "../../shared";

const logger = globalLogger.withDefaults({ message: "gateway/openrouter: " });

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
/** Time allowed for OpenRouter to return response HEADERS (not the body). */
const UPSTREAM_HEADERS_TIMEOUT_MS = 60_000;
/** Cap on how much of an upstream error body we read / relay. */
const MAX_UPSTREAM_ERROR_BYTES = 4096;

/** Never let the provider key leak through relayed upstream error text. */
function scrubSecret(text: string, secret: string): string {
  return secret ? text.split(secret).join("[redacted]") : text;
}

async function readUpstreamErrorMessage(
  upstream: Response,
  secret: string,
): Promise<string> {
  try {
    const raw = (await upstream.text()).slice(0, MAX_UPSTREAM_ERROR_BYTES);
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      const err = (parsed as { error?: unknown }).error;
      if (typeof err === "object" && err !== null) {
        const message = (err as { message?: unknown }).message;
        if (typeof message === "string" && message) {
          return scrubSecret(message, secret);
        }
      }
      const message = (parsed as { message?: unknown }).message;
      if (typeof message === "string" && message) {
        return scrubSecret(message, secret);
      }
    }
  } catch {
    // unreadable / non-JSON upstream error body
  }
  return "OpenRouter upstream error";
}

export async function POST(request: Request) {
  // 1. AUTH ------------------------------------------------------------------
  const caller = await authenticateGatewayRequest(request);
  if (!caller) {
    return gatewayError(
      401,
      "unauthorized",
      "Invalid or missing session token. Send `Authorization: Bearer <better-auth session cookie value>`.",
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("not an object");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return gatewayError(
      400,
      "invalid_request",
      "Request body must be a JSON object.",
    );
  }

  // 2. ENTITLEMENTS ------------------------------------------------------------
  const requested = typeof body.model === "string" ? body.model : undefined;
  const model = resolveGatewayModel(requested);
  if (!model) {
    return gatewayError(
      403,
      "model_not_allowed",
      `Model "${requested ?? ""}" is not on the approved model list.`,
    );
  }

  const entitled = await getEntitledGatewayModels(caller);
  if (!entitled.some((m) => m.id === model.id)) {
    return gatewayError(
      403,
      "model_not_allowed",
      `Model "${model.id}" is not permitted for your team.`,
    );
  }

  // 3. BUDGET (pre-flight) -----------------------------------------------------
  const budget = await checkBudget(caller.userId, caller.teamId);
  if (!budget.allowed) {
    return gatewayError(
      402,
      "budget_exhausted",
      budget.reason ?? "Team budget exhausted.",
    );
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === "****") {
    return gatewayError(
      503,
      "gateway_not_configured",
      "The OpenRouter gateway is not configured on this server.",
    );
  }

  // 4. PROXY -------------------------------------------------------------------
  const stream = body.stream === true;
  const upstreamBody: Record<string, unknown> = { ...body, model: model.slug };
  if (stream) {
    // Force the final usage chunk so streamed completions are metered too.
    const streamOptions =
      typeof body.stream_options === "object" && body.stream_options !== null
        ? (body.stream_options as Record<string, unknown>)
        : {};
    upstreamBody.stream_options = { ...streamOptions, include_usage: true };
  }

  const controller = new AbortController();
  const headerTimeout = setTimeout(
    () => controller.abort(),
    UPSTREAM_HEADERS_TIMEOUT_MS,
  );

  let upstream: Response;
  try {
    upstream = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        // The client's Authorization header is NOT forwarded — only the
        // server-held provider key goes upstream.
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(upstreamBody),
      signal: controller.signal,
    });
  } catch (err) {
    const timedOut = controller.signal.aborted;
    logger.error("upstream fetch failed:", timedOut ? "timeout" : err);
    return gatewayError(
      timedOut ? 504 : 502,
      timedOut ? "upstream_timeout" : "upstream_unreachable",
      timedOut
        ? "OpenRouter did not respond within 60s."
        : "Could not reach OpenRouter.",
    );
  } finally {
    clearTimeout(headerTimeout);
  }

  if (!upstream.ok) {
    const message = await readUpstreamErrorMessage(upstream, apiKey);
    return gatewayError(upstream.status, "upstream_error", message);
  }

  // 5. AUDIT (fire-and-forget; no prompt content) -------------------------------
  void writeAuditLog({
    userId: caller.userId,
    teamId: caller.teamId,
    eventType: "gateway_completion",
    actorType: "human",
    details: { model: model.id, originSurface: "opencode", stream },
  });

  const recordCompletionUsage = (
    promptTokens: number,
    completionTokens: number,
  ) => {
    const costUsd = estimateCostUsd(model.id, promptTokens, completionTokens);
    recordUsage({
      userId: caller.userId,
      teamId: caller.teamId,
      sessionId: null,
      model: model.id,
      provider: "openRouter",
      taskClass: null,
      tier: null,
      promptTokens,
      completionTokens,
      costUsd,
    }).catch((e) => logger.error("recordUsage failed:", e));
  };

  // Streaming: byte-for-byte SSE pass-through, teeing off the usage chunk.
  if (stream && upstream.body) {
    const usageCapture = createUsageCapturingStream((usage) =>
      recordCompletionUsage(usage.promptTokens, usage.completionTokens),
    );
    return new Response(upstream.body.pipeThrough(usageCapture), {
      status: 200,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ??
          "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
      },
    });
  }

  // Non-streaming: relay the JSON and meter response.usage.
  let json: Record<string, unknown>;
  try {
    json = (await upstream.json()) as Record<string, unknown>;
  } catch {
    return gatewayError(
      502,
      "upstream_error",
      "OpenRouter returned an unreadable response.",
    );
  }

  const usage =
    typeof json.usage === "object" && json.usage !== null
      ? (json.usage as { prompt_tokens?: unknown; completion_tokens?: unknown })
      : null;
  recordCompletionUsage(
    typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : 0,
    typeof usage?.completion_tokens === "number" ? usage.completion_tokens : 0,
  );

  return Response.json(json);
}
