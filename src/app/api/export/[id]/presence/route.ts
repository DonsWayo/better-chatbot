import { countDocumentViewers } from "lib/realtime/document-presence-actions";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Public "who's viewing" count for a chat-export document (/export/[id]).
 *
 * Anyone (including anonymous viewers) may read the count — it is a NUMBER
 * only, never identities, so a public page never leaks who is reading it. Only
 * logged-in viewers contribute to it (they heartbeat via
 * heartbeatDocumentPresenceAction); anonymous viewers are not counted.
 *
 * Polled by the presence pill on the export page; the network idles between
 * polls (no held-open connection), keeping the page network-idle-safe.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const count = await countDocumentViewers(id);
    return NextResponse.json({ count });
  } catch {
    // Presence is best-effort chrome; never fail the page over it.
    return NextResponse.json({ count: 0 });
  }
}
