import { getSession } from "auth/server";
import { mentionNotificationRepository } from "lib/db/repository";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/documents/mentions
 * Returns the caller's unread @mention notifications, newest first.
 * SWR-polled by the Inbox Mentions tab and the badge counter.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mentions = await mentionNotificationRepository.getUnreadForUser(
    session.user.id,
  );
  return NextResponse.json({
    mentions: mentions.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

/**
 * PATCH /api/documents/mentions
 * Body: { ids: string[] }  — mark specific notifications as read.
 */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { ids } = (await req.json()) as { ids: string[] };
  if (!Array.isArray(ids)) {
    return NextResponse.json({ error: "ids must be an array" }, { status: 400 });
  }
  await mentionNotificationRepository.markRead(session.user.id, ids);
  return NextResponse.json({ ok: true });
}
