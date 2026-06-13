"use server";

import { type ActionResult, toActionResult } from "app-types/util";
import { createTeam } from "lib/admin/teams";
import { requireAdminPermission } from "lib/auth/permissions";
import { revalidatePath } from "next/cache";

// Returns a structured {@link ActionResult} rather than throwing: production
// Next.js masks errors thrown from a Server Action into an opaque 500
// ("digest"), so the admin-permission denial (and DB errors such as a unique
// slug collision) would never reach the New Team dialog's toast. The
// permission LOGIC is unchanged — only the delivery moves from throw to a
// returned result.
export async function createTeamAction(
  name: string,
  description?: string,
): Promise<ActionResult> {
  return toActionResult(async () => {
    await requireAdminPermission();
    await createTeam(name, description);
    revalidatePath("/admin/teams");
  });
}
