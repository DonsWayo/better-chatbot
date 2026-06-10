"use server";

import { getSession } from "auth/server";
import {
  cancelSession,
  getSessionWithSteps,
} from "lib/agent-platform/sessions";
import { getIsUserAdmin } from "lib/user/utils";

export async function cancelRunAction(id: string): Promise<void> {
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
