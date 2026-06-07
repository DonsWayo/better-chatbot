import { getSession } from "lib/auth/server";
import { ingestDocument } from "lib/ai/embeddings/ingest";
import { pgDb as db } from "lib/db/pg/db.pg";
import { AsafeKnowledgeCollectionTable } from "@/lib/db/pg/schema.pg";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { serverFileStorage } from "lib/file-storage";
import { storageKeyFromUrl } from "lib/file-storage/storage-utils";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin required to ingest knowledge" }, { status: 403 });
  }

  const body = await req.json() as {
    collectionId: string;
    text?: string;              // inline text
    url?: string;               // storage URL to download
    key?: string;               // storage key
    sourceRef?: string;         // human-readable label (filename, URL, etc.)
    maxTokens?: number;
  };

  if (!body.collectionId) {
    return NextResponse.json({ error: "collectionId required" }, { status: 400 });
  }

  // Verify collection exists
  const [collection] = await db
    .select()
    .from(AsafeKnowledgeCollectionTable)
    .where(eq(AsafeKnowledgeCollectionTable.id, body.collectionId));

  if (!collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  let text = body.text;
  let sourceRef = body.sourceRef ?? "manual";

  // If a storage key/URL is provided, download and use as text
  if (!text && (body.key || body.url)) {
    const key = body.key ?? (body.url ? storageKeyFromUrl(body.url) : null);
    if (key) {
      const buf = await serverFileStorage.download(key);
      text = buf.toString("utf-8");
      sourceRef = body.sourceRef ?? key;
    }
  }

  if (!text) {
    return NextResponse.json({ error: "text, key, or url required" }, { status: 400 });
  }

  const chunks = await ingestDocument(text, {
    collectionId: body.collectionId,
    sourceRef,
    maxTokens: body.maxTokens,
  });

  return NextResponse.json({ ok: true, collectionId: body.collectionId, chunks, sourceRef });
}
