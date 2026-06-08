import { requireAdminPermission } from "lib/auth/permissions";
import { pgDb as db } from "lib/db/pg/db.pg";
import { AsafeTeamBudgetTable } from "@/lib/db/pg/schema.pg";
import { and, eq, lte, gte } from "drizzle-orm";
import { z } from "zod";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    await requireAdminPermission("manage team budgets");
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const now = new Date();

  const [budget] = await db
    .select()
    .from(AsafeTeamBudgetTable)
    .where(
      and(
        eq(AsafeTeamBudgetTable.teamId, id),
        lte(AsafeTeamBudgetTable.periodStart, now),
        gte(AsafeTeamBudgetTable.periodEnd, now),
      ),
    )
    .limit(1);

  return Response.json({ budget: budget ?? null });
}

const PostBodySchema = z.object({
  budgetUsd: z.string().regex(/^\d+(\.\d{1,2})?$/, "Must be a valid dollar amount"),
  periodStart: z.string().datetime({ offset: true }).or(z.string().date()),
  periodEnd: z.string().datetime({ offset: true }).or(z.string().date()),
});

export async function POST(req: Request, { params }: RouteContext) {
  try {
    await requireAdminPermission("manage team budgets");
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation error", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { budgetUsd, periodStart, periodEnd } = parsed.data;
  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  if (end <= start) {
    return Response.json(
      { error: "periodEnd must be after periodStart" },
      { status: 400 },
    );
  }

  const [budget] = await db
    .insert(AsafeTeamBudgetTable)
    .values({
      teamId: id,
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
    })
    .returning();

  return Response.json({ budget });
}
