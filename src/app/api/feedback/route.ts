import { getSession } from "lib/auth/server";
import { pgDb as db } from "@/lib/db/pg/db.pg";
import { AsafeMessageFeedbackTable } from "@/lib/db/pg/schema.pg";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { messageId: string; threadId: string; rating: "up" | "down"; comment?: string };
  if (!body.messageId || !body.rating) {
    return NextResponse.json({ error: "messageId and rating required" }, { status: 400 });
  }

  await db.insert(AsafeMessageFeedbackTable)
    .values({
      messageId: body.messageId,
      threadId: body.threadId,
      userId: session.user.id,
      rating: body.rating,
      comment: body.comment ?? null,
    })
    .onConflictDoUpdate({
      target: [AsafeMessageFeedbackTable.userId, AsafeMessageFeedbackTable.messageId],
      set: { rating: body.rating, comment: body.comment ?? null, updatedAt: new Date() },
    });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get("messageId");
  if (!messageId) return NextResponse.json({ error: "messageId required" }, { status: 400 });

  await db.delete(AsafeMessageFeedbackTable)
    .where(and(
      eq(AsafeMessageFeedbackTable.userId, session.user.id),
      eq(AsafeMessageFeedbackTable.messageId, messageId),
    ));

  return NextResponse.json({ ok: true });
}
