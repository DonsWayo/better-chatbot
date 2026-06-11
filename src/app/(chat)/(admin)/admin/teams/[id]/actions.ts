"use server";

import { AsafeTeamBudgetTable, UserTable } from "@/lib/db/pg/schema.pg";
import { eq } from "drizzle-orm";
import {
  addTeamMember,
  canManageTeam,
  deleteTeam,
  removeTeamMember,
  updateTeam,
  updateTeamMemberRole,
  updateTeamPolicy,
} from "lib/admin/teams";
import { requireAdminPermission } from "lib/auth/permissions";
import { getSession } from "lib/auth/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// ─────────────────────────────────────────────────────────────────────────────
// Authorization split (see lib/admin/teams.ts + docs/governance/permissions):
//
//   Team admin OR global admin (requireTeamManagePermission):
//     add member, remove member, change member team-role, rename team.
//
//   Global admin ONLY (requireAdminPermission):
//     delete team, budget, model allow-list, guardrail/capability policy,
//     email-domain allow-list — org-level cost/security/compliance levers
//     a team must not be able to loosen for itself.
//
// The /admin routes are layout-gated to global admins, so team admins cannot
// reach this UI today; the action-level checks are defense in depth and the
// authorization layer for a future team-admin surface.
// ─────────────────────────────────────────────────────────────────────────────

async function requireTeamManagePermission(teamId: string): Promise<void> {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error("Unauthorized: sign-in required to manage this team");
  }
  const allowed = await canManageTeam(session.user.id, teamId);
  if (!allowed) {
    throw new Error(
      "Unauthorized: global admin or team admin access required to manage this team",
    );
  }
}

export async function addTeamMemberAction(
  teamId: string,
  email: string,
  role: "admin" | "editor" | "member",
) {
  await requireTeamManagePermission(teamId);
  const [user] = await db
    .select()
    .from(UserTable)
    .where(eq(UserTable.email, email))
    .limit(1);
  if (!user) throw new Error("User not found");
  await addTeamMember(teamId, user.id, role, user.email ?? undefined);
  revalidatePath(`/admin/teams/${teamId}`);
}

export async function removeTeamMemberAction(memberId: string, teamId: string) {
  await requireTeamManagePermission(teamId);
  // Scope the delete to teamId so a team admin cannot remove members of
  // other teams by passing a foreign memberId.
  await removeTeamMember(memberId, teamId);
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

export async function setEmailDomainsAction(
  teamId: string,
  allowedEmailDomains: string[],
) {
  await requireAdminPermission();
  await updateTeamPolicy(teamId, { allowedEmailDomains });
  revalidatePath(`/admin/teams/${teamId}`);
}

export async function setPolicyAction(
  teamId: string,
  patch: {
    guardrailPolicy?: "strict" | "standard" | "permissive";
    allowImageGen?: boolean;
    allowVision?: boolean;
    allowSpeech?: boolean;
  },
) {
  await requireAdminPermission();
  await updateTeamPolicy(teamId, patch);
  revalidatePath(`/admin/teams/${teamId}`);
}

export async function updateMemberRoleAction(
  memberId: string,
  teamId: string,
  role: "admin" | "editor" | "member",
) {
  await requireTeamManagePermission(teamId);
  // Scoped to teamId — same defense-in-depth as removeTeamMemberAction.
  await updateTeamMemberRole(memberId, role, teamId);
  revalidatePath(`/admin/teams/${teamId}`);
}

export async function renameTeamAction(
  teamId: string,
  name: string,
  description?: string | null,
) {
  await requireTeamManagePermission(teamId);
  await updateTeam(teamId, { name, description: description ?? null });
  revalidatePath(`/admin/teams/${teamId}`);
}

export async function deleteTeamAction(teamId: string) {
  await requireAdminPermission();
  await deleteTeam(teamId);
  revalidatePath("/admin/teams");
  redirect("/admin/teams");
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
