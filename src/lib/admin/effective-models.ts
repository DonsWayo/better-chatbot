import "server-only";

import {
  getOrgBaseModelAllowList,
  resolveTeamModelAllowList,
} from "./model-policy";
import { getUserModelGrants } from "./user-grants";

// ---------------------------------------------------------------------------
// Request-time entitlement resolution (ADR-0009), ERP price-list style.
//
// Three layers, applied in order at the model seam:
//   1. Org BASE allow-list (asafe_org_settings)        — the company catalog
//   2. Team override (inherit ± add/remove | replace)   — the team price list
//   3. Per-user grants (asafe_user_model_grant)         — ADDITIVE line items
//
// A user grant ADDS a model on top of the team list (it never removes one),
// mirroring how the admin UI explains grants: "give this analyst the frontier
// model for two weeks" even though their team's list blocks it.
//
// Conventions:
//   null  → unrestricted (no allow-list applies)
//   array → restricted to exactly these model IDs (never empty — see below)
// ---------------------------------------------------------------------------

/**
 * Resolve the EFFECTIVE model allow-list for a request:
 * org base → team policy (inherit/replace) → user grants (additive).
 *
 * - `null` = unrestricted. An empty org/team list also resolves to `null`
 *   (legacy convention at the chat seam: empty allow-list = no restriction),
 *   so callers only ever see `null` or a non-empty list.
 * - User grants are additive overrides: they can unlock a model the team
 *   list blocks, but can never narrow an unrestricted list.
 * - Fails open per layer: an unreadable grants table simply contributes no
 *   extra models (the org/team layers already fail open inside model-policy).
 */
export async function resolveEffectiveModelAllowList(
  userId: string,
  teamId?: string | null,
): Promise<string[] | null> {
  const base = teamId
    ? await resolveTeamModelAllowList(teamId)
    : await getOrgBaseModelAllowList();

  // Unrestricted (or legacy "empty = unrestricted") — grants cannot narrow it.
  if (base === null || base.length === 0) return null;

  const grants = await getUserModelGrants(userId).catch(() => []);
  return Array.from(new Set([...base, ...grants]));
}
