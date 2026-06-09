/**
 * Local-disk file storage for development.
 *
 * Files are saved to /tmp/asafe-uploads/ and served via
 * GET /api/local-files/[key] (see below).
 *
 * Do NOT use in production — no persistence across restarts.
 * Set FILE_STORAGE_TYPE=local in .env.local to enable.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { FileStorage, UploadContent, UploadOptions, UploadResult, FileMetadata } from "./file-storage.interface";

const UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR ?? "/tmp/asafe-uploads";
const BASE_URL = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3001";

async function ensureDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

async function toBuffer(content: UploadContent): Promise<Buffer> {
  if (Buffer.isBuffer(content)) return content;
  if (content instanceof ArrayBuffer) return Buffer.from(content);
  if (ArrayBuffer.isView(content)) return Buffer.from(content.buffer, content.byteOffset, content.byteLength);
  if (content instanceof Blob) return Buffer.from(await content.arrayBuffer());
  // ReadableStream — collect chunks
  const chunks: Buffer[] = [];
  const reader = (content as ReadableStream<Uint8Array>).getReader?.();
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
  throw new Error("Unsupported UploadContent type for local storage");
}

export function createLocalDiskStorage(): FileStorage {
  return {
    async upload(content: UploadContent, options?: UploadOptions): Promise<UploadResult> {
      await ensureDir();
      const buf = await toBuffer(content);
      const ext = options?.filename?.split(".").pop() ?? "bin";
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      await fs.writeFile(path.join(UPLOAD_DIR, key), buf);
      return {
        key,
        sourceUrl: `${BASE_URL}/api/local-files/${key}`,
        metadata: {
          key,
          filename: options?.filename ?? key,
          contentType: options?.contentType ?? "application/octet-stream",
          size: buf.length,
          uploadedAt: new Date(),
        },
      };
    },

    async download(key: string): Promise<Buffer> {
      return fs.readFile(path.join(UPLOAD_DIR, key));
    },

    async delete(key: string): Promise<void> {
      await fs.unlink(path.join(UPLOAD_DIR, key)).catch(() => {});
    },

    async exists(key: string): Promise<boolean> {
      return fs.access(path.join(UPLOAD_DIR, key)).then(() => true, () => false);
    },

    async getMetadata(key: string): Promise<FileMetadata | null> {
      const stat = await fs.stat(path.join(UPLOAD_DIR, key)).catch(() => null);
      if (!stat) return null;
      return {
        key,
        filename: key,
        contentType: "application/octet-stream",
        size: stat.size,
        uploadedAt: stat.mtime,
      };
    },

    async getSourceUrl(key: string): Promise<string | null> {
      const exists = await fs.access(path.join(UPLOAD_DIR, key)).then(() => true, () => false);
      return exists ? `${BASE_URL}/api/local-files/${key}` : null;
    },
  };
}
