"use server";

import { requireAdminPermission } from "lib/auth/permissions";
import { revalidatePath } from "next/cache";
import { addTeamMember, removeTeamMember, updateTeamPolicy } from "lib/admin/teams";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserTable, AsafeTeamBudgetTable } from "@/lib/db/pg/schema.pg";
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

export async function setModelAllowListAction(
  teamId: string,
  modelAllowList: string[],
) {
  await requireAdminPermission();
  await updateTeamPolicy(teamId, { modelAllowList });
  revalidatePath(`/admin/teams/${teamId}`);
}

export async function setBudgetAction(
  teamId: string,
  budgetUsd: string,
  periodStart: string,
  periodEnd: string,
) {
  await requireAdminPermission("manage team budgets");

  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  if (end <= start) {
    throw new Error("Period end must be after period start");
  }

  await db
    .insert(AsafeTeamBudgetTable)
    .values({
      teamId,
      budgetUsd,
      periodStart: start,
      periodEnd: end,
    })
    .onConflictDoUpdate({
      target: AsafeTeamBudgetTable.teamId,
      set: {
        budgetUsd,
        periodStart: start,
        periodEnd: end,
        updatedAt: new Date(),
      },
    });

  revalidatePath(`/admin/teams/${teamId}`);
}
