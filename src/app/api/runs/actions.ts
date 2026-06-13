"use server";

import { type ActionResult, toActionResult } from "app-types/util";
import { getSession } from "auth/server";
import {
  cancelSession,
  getSessionWithSteps,
} from "lib/agent-platform/sessions";
import { getIsUserAdmin } from "lib/user/utils";

async function cancelRunOrThrow(id: string): Promise<void> {
  const session = await getSession();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const result = await getSessionWithSteps(id);
  if (!result) {
    throw new Error("Not Found");
  }

  const isOwner = result.session.userId === session.user.id;
  if (!isOwner && !getIsUserAdmin(session.user)) {
    throw new Error("Forbidden");
  }

  await cancelSession(id);
}

// Returns a structured {@link ActionResult} rather than throwing: production
// Next.js masks errors thrown from a Server Action into an opaque 500
// ("digest"), so "Unauthorized" / "Not Found" / "Forbidden" would never reach
// the Runs rail's handleErrorWithToast (which also rolls back the optimistic
// cancel). The auth LOGIC is unchanged — only the delivery moves to a return.
export async function cancelRunAction(id: string): Promise<ActionResult> {
  return toActionResult(() => cancelRunOrThrow(id));
}
