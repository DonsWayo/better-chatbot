"use server";

import { getSession } from "lib/auth/server";
import { recordAupAcceptance } from "lib/compliance/aup";
import { redirect } from "next/navigation";

export async function acceptAupAction(): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  await recordAupAcceptance(session.user.id);
  redirect("/");
}
