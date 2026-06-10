"use server";

import { getSession } from "auth/server";
import {
  type Capability,
  type EntityGrant,
  type GrantableEntityType,
  canAccess,
  grantAccess,
  listGrants,
  revokeAccess,
} from "lib/visibility";

/**
 * Sharing management actions for the unified visibility model
 * (docs/design/visibility-model.md). Every action requires the caller to hold
 * "manage" on the target entity — which canAccess grants to the entity's
 * owner and to org admins unconditionally.
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

export async function grantAccessAction(input: {
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

export async function revokeAccessAction(input: {
  entityType: GrantableEntityType;
  entityId: string;
  granteeUserId: string;
  capability?: Capability;
}): Promise<void> {
  await requireManage(input.entityType, input.entityId);
  await revokeAccess(input);
}

export async function listGrantsAction(input: {
  entityType: GrantableEntityType;
  entityId: string;
}): Promise<EntityGrant[]> {
  await requireManage(input.entityType, input.entityId);
  return listGrants(input.entityType, input.entityId);
}
