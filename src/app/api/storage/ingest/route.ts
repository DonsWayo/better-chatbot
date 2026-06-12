import { NextResponse } from "next/server";
import { getSession } from "auth/server";
import { serverFileStorage } from "lib/file-storage";
import { parseCsvPreview, formatCsvPreviewText } from "lib/file-ingest/csv";
import {
  resolveStoragePrefix,
  storageKeyFromUrl,
} from "lib/file-storage/storage-utils";

type Body = {
  key?: string; // storage key (preferred)
  url?: string; // will be converted to key if possible
  type?: "csv" | "auto";
  maxRows?: number;
  maxCols?: number;
};

export async function POST(req: Request) {
  // This endpoint previously had NO auth: any caller could supply an arbitrary
  // storage key/url and get the file's contents back as a CSV preview. Step 1
  // is to require a session.
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const key = body.key || (body.url ? storageKeyFromUrl(body.url) : undefined);
  if (!key) {
    return NextResponse.json(
      { error: "Missing 'key' or 'url'" },
      { status: 400 },
    );
  }

  // There is no per-key owner record in the schema (uploads generate keys of
  // the form `${prefix}/${uuid}-${name}` with no user binding — see
  // s3-file-storage buildKey / local-disk-storage). Until a per-key ownership
  // table exists (schema change — see report), the best available containment
  // is: reject path traversal and only allow keys inside the configured upload
  // namespace, so a caller can't read arbitrary server paths or other buckets.
  // NOTE: this still lets one authenticated user read another user's uploaded
  // key if they can guess the UUID; a true owner binding needs the schema work.
  const normalizedKey = key.replace(/^\/+/, "");
  const prefix = resolveStoragePrefix();
  const hasTraversal =
    normalizedKey.includes("..") || normalizedKey.includes("\0");
  const inNamespace = prefix
    ? normalizedKey === prefix || normalizedKey.startsWith(`${prefix}/`)
    : true;
  if (hasTraversal || !inNamespace) {
    return NextResponse.json(
      { error: "Forbidden: key outside the allowed upload namespace" },
      { status: 403 },
    );
  }

  // Infer type from extension when auto
  const type = body.type || "auto";
  const isCsv =
    type === "csv" ||
    /\.(csv)$/i.test(key) ||
    /(^|[?&])contentType=text\/csv(&|$)/i.test(body.url || "");

  if (!isCsv) {
    return NextResponse.json(
      {
        error: "Unsupported file type for ingest",
        solution:
          "Currently supported: CSV. Convert your spreadsheet to CSV or paste sample rows.",
      },
      { status: 400 },
    );
  }

  const buf = await serverFileStorage.download(normalizedKey);
  const preview = parseCsvPreview(buf, {
    maxRows: Math.min(200, Math.max(1, body.maxRows ?? 50)),
    maxCols: Math.min(40, Math.max(1, body.maxCols ?? 12)),
  });

  const text = formatCsvPreviewText(normalizedKey, preview);

  return NextResponse.json({
    ok: true,
    type: "csv",
    key: normalizedKey,
    preview,
    text,
  });
}
