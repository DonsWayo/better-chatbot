import { NextRequest, NextResponse } from "next/server";
import { getSession } from "lib/auth/server";
import { updateTeamPolicy } from "lib/admin/teams";
import { z } from "zod";

const APPROVED_MODEL_IDS = ["gpt-5.1", "claude-opus-4.8", "gemini-2.5-flash", "gemini-2.5-flash-lite"] as const;

const PatchTeamSchema = z.object({
  guardrailPolicy: z.enum(["strict", "standard", "permissive"]).optional(),
  allowImageGen: z.boolean().optional(),
  allowVision: z.boolean().optional(),
  allowSpeech: z.boolean().optional(),
  modelAllowList: z.array(z.enum(APPROVED_MODEL_IDS)).optional(),
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
