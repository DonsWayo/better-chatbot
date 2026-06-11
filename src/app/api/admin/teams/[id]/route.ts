import { updateTeamPolicy } from "lib/admin/teams";
import { getSession } from "lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const APPROVED_MODEL_IDS = [
  "gpt-5.5",
  "claude-opus-4.8",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "kimi-k2.5",
  "deepseek-v4-flash",
  "deepseek-v4-pro",
  "hy3-preview",
] as const;

const PatchTeamSchema = z.object({
  guardrailPolicy: z.enum(["strict", "standard", "permissive"]).optional(),
  allowImageGen: z.boolean().optional(),
  allowVision: z.boolean().optional(),
  allowSpeech: z.boolean().optional(),
  modelAllowList: z.array(z.enum(APPROVED_MODEL_IDS)).optional(),
  allowedEmailDomains: z
    .array(z.string().regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/, "Invalid domain"))
    .optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin")
    return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = PatchTeamSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );

  await updateTeamPolicy(id, parsed.data);
  return NextResponse.json({ ok: true });
}
