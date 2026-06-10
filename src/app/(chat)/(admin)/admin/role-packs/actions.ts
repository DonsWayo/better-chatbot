"use server";

import { requireAdminPermission } from "auth/permissions";
import { getSession } from "auth/server";
import { InstallRolePackResult, installRolePack } from "lib/role-packs/install";
import { revalidatePath } from "next/cache";

/**
 * Installs a role pack's starter content (agents, workflow, disabled
 * routine) owned by the calling admin. Admin-gated; idempotent per owner.
 */
export async function installRolePackAction(
  packId: string,
): Promise<InstallRolePackResult> {
  await requireAdminPermission("install role packs");
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("Unauthorized: session required to install role packs");
  }
  const result = await installRolePack(packId, userId);
  revalidatePath("/admin/role-packs");
  return result;
}
