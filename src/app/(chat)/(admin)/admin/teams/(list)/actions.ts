"use server";

import { requireAdminPermission } from "lib/auth/permissions";
import { createTeam } from "lib/admin/teams";
import { revalidatePath } from "next/cache";

export async function createTeamAction(
  name: string,
  description?: string,
): Promise<void> {
  await requireAdminPermission();
  await createTeam(name, description);
  revalidatePath("/admin/teams");
}
