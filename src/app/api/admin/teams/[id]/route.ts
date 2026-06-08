import { NextRequest, NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { updateTeamPolicy } from "lib/admin/teams";
import { z } from "zod";

const PatchTeamSchema = z.object({
  guardrailPolicy: z.enum(["strict", "standard", "permissive"]).optional(),
  allowImageGen: z.boolean().optional(),
  allowVision: z.boolean().optional(),
  allowSpeech: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const parsed = PatchTeamSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await updateTeamPolicy(id, parsed.data);
  return NextResponse.json({ ok: true });
}
