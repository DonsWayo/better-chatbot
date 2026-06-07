"use server";

import { requireAdminPermission } from "lib/auth/permissions";
import { revalidatePath } from "next/cache";
import { addTeamMember, removeTeamMember } from "lib/admin/teams";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserTable } from "@/lib/db/pg/schema.pg";
import { eq } from "drizzle-orm";

export async function addTeamMemberAction(
  teamId: string,
  email: string,
  role: "admin" | "editor" | "member",
) {
  await requireAdminPermission();
  const [user] = await db
    .select()
    .from(UserTable)
    .where(eq(UserTable.email, email))
    .limit(1);
  if (!user) throw new Error("User not found");
  await addTeamMember(teamId, user.id, role);
  revalidatePath(`/admin/teams/${teamId}`);
}

export async function removeTeamMemberAction(
  memberId: string,
  teamId: string,
) {
  await requireAdminPermission();
  await removeTeamMember(memberId);
  revalidatePath(`/admin/teams/${teamId}`);
}
