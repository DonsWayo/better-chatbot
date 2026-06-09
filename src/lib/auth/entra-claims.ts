// Wave 4 — Microsoft Entra group claim → role mapping (ADR-0005)

/**
 * Parse comma-separated group IDs from an env var.
 * Trims whitespace and drops empty strings.
 */
function parseGroupIds(envVar: string | undefined): string[] {
  return envVar?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
}

/**
 * Given an array of Entra group object IDs from the token claims,
 * return the best matching role for this user.
 *
 * Precedence: ASAFE_ENTRA_ADMIN_GROUP_IDS > ASAFE_ENTRA_EDITOR_GROUP_IDS > default.
 */
export function roleFromEntraClaims(
  groupIds: string[],
): "admin" | "editor" | "user" {
  const adminGroups = parseGroupIds(process.env.ASAFE_ENTRA_ADMIN_GROUP_IDS);
  const editorGroups = parseGroupIds(process.env.ASAFE_ENTRA_EDITOR_GROUP_IDS);

  if (adminGroups.length > 0 && groupIds.some((g) => adminGroups.includes(g)))
    return "admin";
  if (
    editorGroups.length > 0 &&
    groupIds.some((g) => editorGroups.includes(g))
  )
    return "editor";

  const defaultRole = process.env.ASAFE_DEFAULT_SSO_ROLE;
  if (defaultRole === "admin" || defaultRole === "editor") return defaultRole;
  return "user";
}

/**
 * Decode a JWT's payload section without verifying the signature.
 * Used only for reading claims from tokens that have already been validated
 * by the OAuth provider (Better Auth) before they reach this hook.
 */
export function parseJwtClaims(
  token: string,
): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
}
