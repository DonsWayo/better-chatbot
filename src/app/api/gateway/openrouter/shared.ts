/**
 * asafe OpenRouter gateway — shared helpers (desktop "governed coding" surface).
 *
 * Implements the GATEWAY CONTRACT documented in desktop/src/opencode-manager.ts
 * and content/docs/desktop/governed-coding.mdx:
 *
 *   POST ${ASAFE_APP_URL}/api/gateway/openrouter/chat/completions
 *   GET  ${ASAFE_APP_URL}/api/gateway/openrouter/models
 *
 * AUTH — exactly what the desktop must send:
 *   `Authorization: Bearer <session-cookie-value>` where the token is the RAW
 *   VALUE of the better-auth session cookie (`better-auth.session_token`, or
 *   `__Secure-better-auth.session_token` when secure cookies are enabled) —
 *   i.e. the signed `<token>.<signature>` string exactly as stored in the
 *   browser cookie. The gateway validates it by reconstructing a Cookie header
 *   (under BOTH cookie names, so it works in dev and prod) and calling
 *   better-auth's `auth.api.getSession`. Anything else — a provider API key,
 *   an OAuth access token, a bare session id without its signature — is
 *   rejected with 401. The desktop passes this value through to the spawned
 *   opencode process as the ASAFE_SESSION_TOKEN env var.
 *
 * MODELS — the approved OpenRouter short list from lib/ai/models.ts (ADR-0001),
 * mirrored here with the friendly id ↔ OpenRouter slug alias pair. Keep in
 * sync with the `staticModels.openRouter` block in src/lib/ai/models.ts.
 */

import "server-only";

import { auth } from "auth/server";
import {
  getOrgBaseModelAllowList,
  resolveTeamModelAllowList,
} from "lib/admin/model-policy";
import { getUserPrimaryTeamId } from "lib/admin/teams";
import { getUserModelGrants } from "lib/admin/user-grants";

// ---------------------------------------------------------------------------
// Model registry (mirror of the approved short list in lib/ai/models.ts)
// ---------------------------------------------------------------------------

export interface GatewayModel {
  /** Friendly id — the id used by entitlements, budgets, and usage events. */
  id: string;
  /** Human-readable name for the desktop's model picker. */
  name: string;
  /** OpenRouter slug — what is forwarded upstream. Also accepted as an alias. */
  slug: string;
}

export const GATEWAY_MODELS: readonly GatewayModel[] = [
  { id: "gpt-5.5", name: "GPT-5.5", slug: "openai/gpt-5.5" },
  {
    id: "claude-opus-4.8",
    name: "Claude Opus 4.8",
    slug: "anthropic/claude-opus-4.8",
  },
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    slug: "google/gemini-3.5-flash",
  },
  {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    slug: "google/gemini-3.1-flash-lite",
  },
  { id: "kimi-k2.5", name: "Kimi K2.5", slug: "moonshotai/kimi-k2.5" },
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    slug: "deepseek/deepseek-v4-flash",
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    slug: "deepseek/deepseek-v4-pro",
  },
  { id: "hy3-preview", name: "Tencent Hy3", slug: "tencent/hy3-preview" },
];

/**
 * Resolve a requested model string to a registry entry. Accepts either the
 * friendly id (`gpt-5.5`) or the OpenRouter slug alias (`openai/gpt-5.5`).
 * Returns null when the model is not on the approved short list.
 */
export function resolveGatewayModel(
  requested: string | undefined,
): GatewayModel | null {
  if (!requested) return null;
  return (
    GATEWAY_MODELS.find((m) => m.id === requested || m.slug === requested) ??
    null
  );
}

// ---------------------------------------------------------------------------
// Auth — Bearer <better-auth session cookie value>
// ---------------------------------------------------------------------------

const SESSION_COOKIE = "better-auth.session_token";
const SECURE_SESSION_COOKIE = "__Secure-better-auth.session_token";

/**
 * Conservative cookie-value charset. The better-auth session cookie value is
 * url-safe base64 plus the `.` signature separator (possibly %-encoded), so
 * this never rejects a real token — it only blocks Cookie-header injection
 * (`;`, whitespace, control chars, …).
 */
const COOKIE_SAFE_TOKEN = /^[A-Za-z0-9_.\-~%+/=]+$/;

export interface GatewayCaller {
  userId: string;
  teamId: string | null;
}

/**
 * Validate the `Authorization: Bearer <session-cookie-value>` header and
 * resolve the caller (user + primary team). Returns null on any failure —
 * routes translate that into a 401.
 */
export async function authenticateGatewayRequest(
  request: Request,
): Promise<GatewayCaller | null> {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;

  const token = match[1].trim();
  if (!token || !COOKIE_SAFE_TOKEN.test(token)) return null;

  try {
    // better-auth validates the signed cookie value; present it under both
    // the secure and non-secure cookie names so the same desktop token works
    // against dev (http) and prod (https) deployments.
    const session = await auth.api.getSession({
      headers: new Headers({
        cookie: `${SESSION_COOKIE}=${token}; ${SECURE_SESSION_COOKIE}=${token}`,
      }),
    });
    const userId = session?.user?.id;
    if (!userId) return null;

    const teamId = await getUserPrimaryTeamId(userId);
    return { userId, teamId };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Entitlements — org base + team override + per-user grants (ADR-0009)
// ---------------------------------------------------------------------------

/**
 * The caller's effective entitled models, always a subset of the approved
 * registry short list:
 *   allow-list null (unrestricted) → the whole registry;
 *   otherwise → registry ∩ (team allow-list ∪ per-user grants).
 */
export async function getEntitledGatewayModels(
  caller: GatewayCaller,
): Promise<GatewayModel[]> {
  const [allowList, grants] = await Promise.all([
    caller.teamId
      ? resolveTeamModelAllowList(caller.teamId)
      : getOrgBaseModelAllowList(),
    getUserModelGrants(caller.userId),
  ]);

  if (allowList === null) return [...GATEWAY_MODELS];

  const allowed = new Set([...allowList, ...grants]);
  return GATEWAY_MODELS.filter((m) => allowed.has(m.id));
}

// ---------------------------------------------------------------------------
// Error shape (OpenAI-compatible-ish: { error: { message, code } })
// ---------------------------------------------------------------------------

export function gatewayError(
  status: number,
  code: string,
  message: string,
): Response {
  return Response.json({ error: { message, code } }, { status });
}

// ---------------------------------------------------------------------------
// Streaming usage capture (SSE pass-through)
// ---------------------------------------------------------------------------

export interface CapturedUsage {
  promptTokens: number;
  completionTokens: number;
}

/**
 * Identity TransformStream for the upstream SSE bytes that additionally scans
 * `data: {...}` events for the final usage chunk (OpenRouter emits it when
 * `stream_options.include_usage` is set — the gateway forces that flag on).
 *
 * `onUsage` fires at most once, as soon as a usage payload is seen (the spec
 * puts it in the final chunk), so usage is still recorded even if the client
 * disconnects right after. Bytes are passed through untouched.
 */
export function createUsageCapturingStream(
  onUsage: (usage: CapturedUsage) => void,
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  let buffer = "";
  let reported = false;

  const handleLine = (line: string) => {
    if (reported) return;
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const parsed: unknown = JSON.parse(payload);
      if (typeof parsed !== "object" || parsed === null) return;
      const usage = (parsed as { usage?: unknown }).usage;
      if (typeof usage !== "object" || usage === null) return;
      const { prompt_tokens, completion_tokens } = usage as {
        prompt_tokens?: unknown;
        completion_tokens?: unknown;
      };
      if (
        typeof prompt_tokens === "number" &&
        typeof completion_tokens === "number"
      ) {
        reported = true;
        onUsage({
          promptTokens: prompt_tokens,
          completionTokens: completion_tokens,
        });
      }
    } catch {
      // partial / non-JSON data line — ignore
    }
  };

  const scan = (text: string) => {
    buffer += text;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handleLine(line);
  };

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      scan(decoder.decode(chunk, { stream: true }));
    },
    flush() {
      scan(decoder.decode());
      if (buffer) handleLine(buffer);
    },
  });
}
