import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { IS_DEV } from "lib/const";

const UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR ?? "/tmp/asafe-uploads";

// Only available in local dev — never exposed in production
export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ key: string }> },
) {
  if (!IS_DEV) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { key } = await props.params;

  // Prevent path traversal
  const safe = path.basename(key);
  const filePath = path.join(UPLOAD_DIR, safe);

  const buf = await fs.readFile(filePath).catch(() => null);
  if (!buf) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ext = safe.split(".").pop()?.toLowerCase() ?? "";
  const contentTypeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
    txt: "text/plain",
  };

  return new NextResponse(buf, {
    headers: {
      "Content-Type": contentTypeMap[ext] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
