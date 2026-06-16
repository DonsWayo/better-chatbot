import {
  type ApiPrincipal,
  authenticateApiKey,
  hasScope,
} from "lib/auth/api-key-auth";
import { checkRateLimit } from "lib/rate-limit";

// Shared helpers for the public /api/v1 surface: clean JSON error envelopes
// with stable string `code`s, and an auth guard that turns a missing/invalid
// key into a 401 and an out-of-scope key into a 403.

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "budget_exhausted"
  | "internal_error";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 400,
  budget_exhausted: 402,
  internal_error: 500,
};

export function apiError(
  code: ApiErrorCode,
  message: string,
  status?: number,
): Response {
  return Response.json(
    { error: { code, message } },
    { status: status ?? STATUS_BY_CODE[code] },
  );
}

export function apiOk(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/**
 * Authenticate the request and (optionally) require a scope. Returns the
 * principal on success, or a ready-to-return Response (401/403/429) on
 * failure. For mutating scopes (scope string ending in `:write`), also checks
 * the per-user rate limiter — the same sliding-window bucket used by the chat
 * route — to prevent a compromised API key from flooding the session queue.
 */
export async function requirePrincipal(
  request: Request,
  scope?: string,
): Promise<ApiPrincipal | Response> {
  const principal = await authenticateApiKey(request);
  if (!principal) {
    return apiError(
      "unauthorized",
      "Missing or invalid API key. Pass `Authorization: Bearer ck_live_...`.",
    );
  }
  if (scope && !hasScope(principal, scope)) {
    return apiError(
      "forbidden",
      `API key is missing the required scope: ${scope}`,
    );
  }
  // Rate-limit mutating requests so a leaked key can't flood the worker queue.
  if (scope?.endsWith(":write")) {
    const rl = await checkRateLimit(principal.userId).catch(() => null);
    if (rl && !rl.allowed) {
      return new Response(
        JSON.stringify({ error: { code: "rate_limited", message: "Too many requests. Retry after the reset window." } }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Limit": String(rl.limit),
            "X-RateLimit-Remaining": String(rl.remaining),
            "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
            "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          },
        },
      );
    }
  }
  return principal;
}
