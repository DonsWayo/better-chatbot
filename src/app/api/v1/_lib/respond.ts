import {
  type ApiPrincipal,
  authenticateApiKey,
  hasScope,
} from "lib/auth/api-key-auth";

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
 * principal on success, or a ready-to-return Response (401/403) on failure.
 * Usage:
 *   const auth = await requirePrincipal(request, "sessions:write");
 *   if (auth instanceof Response) return auth;
 *   const principal = auth;
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
  return principal;
}
