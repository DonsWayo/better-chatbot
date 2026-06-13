import { NextResponse } from "next/server";
import { getSession } from "auth/server";
import { serverFileStorage, storageDriver } from "lib/file-storage";
import { storageObjectRepository } from "lib/db/repository";
import logger from "lib/logger";
import { checkStorageAction } from "../actions";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check storage configuration first
  const storageCheck = await checkStorageAction();
  if (!storageCheck.isValid) {
    return NextResponse.json(
      {
        error: storageCheck.error,
        solution: storageCheck.solution,
        storageDriver,
      },
      { status: 500 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided. Use 'file' field in FormData." },
        { status: 400 },
      );
    }

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to storage (works with any storage backend)
    const result = await serverFileStorage.upload(buffer, {
      filename: file.name,
      contentType: file.type || "application/octet-stream",
    });

    // Bind the resulting key to the uploader so ingest can enforce ownership.
    // A storage failure has already thrown above; a bookkeeping failure here
    // must not lose the user's upload — log and proceed (ingest will 403 on a
    // missing owner record, which is fail-closed).
    try {
      await storageObjectRepository.recordStorageObject({
        storageKey: result.key,
        uploaderUserId: session.user.id,
        contentType: file.type || result.metadata?.contentType || null,
        sizeBytes: buffer.byteLength,
      });
    } catch (recordError) {
      logger.error("Failed to record storage object ownership", recordError);
    }

    return NextResponse.json({
      success: true,
      key: result.key,
      url: result.sourceUrl,
      metadata: result.metadata,
    });
  } catch (error) {
    console.error("Failed to upload file", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 },
    );
  }
}
