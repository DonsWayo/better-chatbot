"use server";

import { type ActionResult, toActionResult } from "app-types/util";
import { getSession } from "auth/server";
import {
  type Capability,
  type EntityGrant,
  type GrantableEntityType,
  canAccess,
  grantAccess,
  listGrants,
  resolveGranteeByEmail,
  resolveGranteeNames,
  revokeAccess,
} from "lib/visibility";

/**
 * Sharing management actions for the unified visibility model
 * (docs/design/visibility-model.md). Every action requires the caller to hold
 * "manage" on the target entity — which canAccess grants to the entity's
 * owner and to org admins unconditionally.
 *
 * The exported actions return a structured {@link ActionResult} instead of
 * throwing: in production Next.js masks errors thrown from a Server Action into
 * an opaque 500 ("digest"), so the carefully written permission message
 * ("You do not have permission to manage sharing for this item") would never
 * reach the client. Internal `*OrThrow` helpers keep the throwing logic for
 * server callers that want it; the exported actions wrap them.
 */

async function requireManage(
  entityType: GrantableEntityType,
  entityId: string,
): Promise<string> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("Unauthorized");
  }
  const allowed = await canAccess(entityType, entityId, userId, "manage");
  if (!allowed) {
    throw new Error(
      "You do not have permission to manage sharing for this item",
    );
  }
  return userId;
}

async function grantAccessOrThrow(input: {
  entityType: GrantableEntityType;
  entityId: string;
  granteeUserId: string;
  capability?: Capability;
}): Promise<void> {
  const userId = await requireManage(input.entityType, input.entityId);
  await grantAccess({
    entityType: input.entityType,
    entityId: input.entityId,
    granteeUserId: input.granteeUserId,
    capability: input.capability ?? "use",
    grantedBy: userId,
  });
}

export async function grantAccessAction(input: {
  entityType: GrantableEntityType;
  entityId: string;
  granteeUserId: string;
  capability?: Capability;
}): Promise<ActionResult> {
  return toActionResult(() => grantAccessOrThrow(input));
}

async function revokeAccessOrThrow(input: {
  entityType: GrantableEntityType;
  entityId: string;
  granteeUserId: string;
  capability?: Capability;
}): Promise<void> {
  await requireManage(input.entityType, input.entityId);
  await revokeAccess(input);
}

export async function revokeAccessAction(input: {
  entityType: GrantableEntityType;
  entityId: string;
  granteeUserId: string;
  capability?: Capability;
}): Promise<ActionResult> {
  return toActionResult(() => revokeAccessOrThrow(input));
}

export interface GrantWithGrantee extends EntityGrant {
  granteeName: string | null;
  granteeEmail: string | null;
}

async function listGrantsOrThrow(input: {
  entityType: GrantableEntityType;
  entityId: string;
}): Promise<GrantWithGrantee[]> {
  await requireManage(input.entityType, input.entityId);
  const grants = await listGrants(input.entityType, input.entityId);
  const names = await resolveGranteeNames(grants.map((g) => g.granteeUserId));
  return grants.map((g) => ({
    ...g,
    granteeName: names[g.granteeUserId]?.name ?? null,
    granteeEmail: names[g.granteeUserId]?.email ?? null,
  }));
}

/**
 * Grant list enriched with each grantee's display name + email, for the
 * "shared" grant manager. Requires "manage" on the entity (owner / admin).
 */
export async function listGrantsAction(input: {
  entityType: GrantableEntityType;
  entityId: string;
}): Promise<ActionResult<GrantWithGrantee[]>> {
  return toActionResult(() => listGrantsOrThrow(input));
}

async function resolveGranteeByEmailOrThrow(input: {
  entityType: GrantableEntityType;
  entityId: string;
  email: string;
}): Promise<{ id: string; name: string; email: string } | null> {
  await requireManage(input.entityType, input.entityId);
  return resolveGranteeByEmail(input.email);
}

/**
 * Resolve an email to a grantable user for the "shared" picker. Requires the
 * caller to hold "manage" on the entity (so non-managers can't probe which
 * emails map to accounts). Returns null when no user owns that email.
 */
export async function resolveGranteeByEmailAction(input: {
  entityType: GrantableEntityType;
  entityId: string;
  email: string;
}): Promise<ActionResult<{ id: string; name: string; email: string } | null>> {
  return toActionResult(() => resolveGranteeByEmailOrThrow(input));
}
