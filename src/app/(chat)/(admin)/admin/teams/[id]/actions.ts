"use server";

import { AsafeTeamBudgetTable, UserTable } from "@/lib/db/pg/schema.pg";
import { type ActionResult, toActionResult } from "app-types/util";
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

// The exported actions return a structured {@link ActionResult} rather than
// throwing: production Next.js masks errors thrown from a Server Action into an
// opaque 500 ("digest"), so the user-instructional messages ("User not found",
// "Period end must be after period start", the permission denials) would never
// reach the client toast / inline error. Internal `*OrThrow` helpers keep the
// throwing logic. (deleteTeamAction is the exception — see its note.)

async function addTeamMemberOrThrow(
  teamId: string,
  email: string,
  role: "admin" | "editor" | "member",
): Promise<void> {
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

export async function addTeamMemberAction(
  teamId: string,
  email: string,
  role: "admin" | "editor" | "member",
): Promise<ActionResult> {
  return toActionResult(() => addTeamMemberOrThrow(teamId, email, role));
}

async function removeTeamMemberOrThrow(
  memberId: string,
  teamId: string,
): Promise<void> {
  await requireTeamManagePermission(teamId);
  // Scope the delete to teamId so a team admin cannot remove members of
  // other teams by passing a foreign memberId.
  await removeTeamMember(memberId, teamId);
  revalidatePath(`/admin/teams/${teamId}`);
}

export async function removeTeamMemberAction(
  memberId: string,
  teamId: string,
): Promise<ActionResult> {
  return toActionResult(() => removeTeamMemberOrThrow(memberId, teamId));
}

async function setModelAllowListOrThrow(
  teamId: string,
  modelAllowList: string[],
): Promise<void> {
  await requireAdminPermission();
  await updateTeamPolicy(teamId, { modelAllowList });
  revalidatePath(`/admin/teams/${teamId}`);
}

export async function setModelAllowListAction(
  teamId: string,
  modelAllowList: string[],
): Promise<ActionResult> {
  return toActionResult(() => setModelAllowListOrThrow(teamId, modelAllowList));
}

async function setEmailDomainsOrThrow(
  teamId: string,
  allowedEmailDomains: string[],
): Promise<void> {
  await requireAdminPermission();
  await updateTeamPolicy(teamId, { allowedEmailDomains });
  revalidatePath(`/admin/teams/${teamId}`);
}

export async function setEmailDomainsAction(
  teamId: string,
  allowedEmailDomains: string[],
): Promise<ActionResult> {
  return toActionResult(() =>
    setEmailDomainsOrThrow(teamId, allowedEmailDomains),
  );
}

type TeamPolicyPatch = {
  guardrailPolicy?: "strict" | "standard" | "permissive";
  allowImageGen?: boolean;
  allowVision?: boolean;
  allowSpeech?: boolean;
  // Per-tool flags (Feature B) — default-ON, enforced server-side in chat.
  allowWebSearch?: boolean;
  allowCodeExec?: boolean;
  allowHttp?: boolean;
};

async function setPolicyOrThrow(
  teamId: string,
  patch: TeamPolicyPatch,
): Promise<void> {
  await requireAdminPermission();
  await updateTeamPolicy(teamId, patch);
  revalidatePath(`/admin/teams/${teamId}`);
}

export async function setPolicyAction(
  teamId: string,
  patch: TeamPolicyPatch,
): Promise<ActionResult> {
  return toActionResult(() => setPolicyOrThrow(teamId, patch));
}

async function updateMemberRoleOrThrow(
  memberId: string,
  teamId: string,
  role: "admin" | "editor" | "member",
): Promise<void> {
  await requireTeamManagePermission(teamId);
  // Scoped to teamId — same defense-in-depth as removeTeamMemberAction.
  await updateTeamMemberRole(memberId, role, teamId);
  revalidatePath(`/admin/teams/${teamId}`);
}

export async function updateMemberRoleAction(
  memberId: string,
  teamId: string,
  role: "admin" | "editor" | "member",
): Promise<ActionResult> {
  return toActionResult(() => updateMemberRoleOrThrow(memberId, teamId, role));
}

async function renameTeamOrThrow(
  teamId: string,
  name: string,
  description?: string | null,
): Promise<void> {
  await requireTeamManagePermission(teamId);
  await updateTeam(teamId, { name, description: description ?? null });
  revalidatePath(`/admin/teams/${teamId}`);
}

export async function renameTeamAction(
  teamId: string,
  name: string,
  description?: string | null,
): Promise<ActionResult> {
  return toActionResult(() => renameTeamOrThrow(teamId, name, description));
}

/**
 * Unlike its siblings this does NOT wrap the whole body in toActionResult:
 * `redirect()` works by throwing a NEXT_REDIRECT control-flow signal that MUST
 * propagate to Next.js. We run only the gated mutation through toActionResult
 * and, on success, redirect (whose throw propagates normally); a permission
 * failure comes back as { success:false } so the client can toast it.
 */
export async function deleteTeamAction(teamId: string): Promise<ActionResult> {
  const result = await toActionResult(async () => {
    await requireAdminPermission();
    await deleteTeam(teamId);
    revalidatePath("/admin/teams");
  });
  if (!result.success) return result;
  redirect("/admin/teams");
}

async function setBudgetOrThrow(
  teamId: string,
  budgetUsd: string,
  periodStart: string,
  periodEnd: string,
): Promise<void> {
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

export async function setBudgetAction(
  teamId: string,
  budgetUsd: string,
  periodStart: string,
  periodEnd: string,
): Promise<ActionResult> {
  return toActionResult(() =>
    setBudgetOrThrow(teamId, budgetUsd, periodStart, periodEnd),
  );
}
