import { grantUserModel, listUserModelGrants } from "lib/admin/user-grants";
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

const GrantBodySchema = z.object({
  modelId: z.enum(APPROVED_MODEL_IDS),
  expiresAt: z.string().datetime().optional().nullable(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin")
    return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { id: userId } = await params;
  const grants = await listUserModelGrants(userId);
  return NextResponse.json({ grants });
}

export async function POST(request: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin")
    return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { id: userId } = await params;
  const body = await request.json();
  const parsed = GrantBodySchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );

  const expiresAt = parsed.data.expiresAt
    ? new Date(parsed.data.expiresAt)
    : null;
  await grantUserModel(userId, parsed.data.modelId, session.user.id, expiresAt);
  return NextResponse.json({ ok: true });
}
