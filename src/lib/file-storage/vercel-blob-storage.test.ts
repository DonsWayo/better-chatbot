import { describe, it, expect, vi, beforeEach } from "vitest";

const { putMock, headMock, delMock } = vi.hoisted(() => ({
  putMock: vi.fn(),
  headMock: vi.fn(),
  delMock: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  put: putMock,
  head: headMock,
  del: delMock,
}));

vi.mock("lib/utils", () => ({
  generateUUID: vi.fn(() => "test-uuid"),
}));

import { createVercelBlobStorage } from "./vercel-blob-storage";
import { FileNotFoundError } from "lib/errors";

const blobResult = {
  pathname: "uploads/test-uuid-file.txt",
  url: "https://blob.vercel-storage.com/uploads/test-uuid-file.txt",
  contentType: "text/plain",
  size: 3,
  uploadedAt: new Date("2024-01-01"),
  downloadUrl: "https://blob.vercel-storage.com/uploads/test-uuid-file.txt?download=1",
};

describe("createVercelBlobStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FILE_STORAGE_PREFIX = "uploads";
    delete process.env.FILE_STORAGE_S3_PUBLIC_BASE_URL;
  });

  describe("upload", () => {
    it("calls put with correct content type", async () => {
      putMock.mockResolvedValue(blobResult);
      const storage = createVercelBlobStorage();
      await storage.upload(Buffer.from("abc"), {
        filename: "file.txt",
        contentType: "text/plain",
      });
      expect(putMock).toHaveBeenCalledWith(
        expect.stringContaining("file.txt"),
        expect.any(Buffer),
        expect.objectContaining({ contentType: "text/plain" }),
      );
    });

    it("returns key, sourceUrl, and metadata", async () => {
      putMock.mockResolvedValue(blobResult);
      const storage = createVercelBlobStorage();
      const result = await storage.upload(Buffer.from("abc"), {
        filename: "file.txt",
        contentType: "text/plain",
      });
      expect(result).toHaveProperty("key");
      expect(result).toHaveProperty("sourceUrl");
      expect(result).toHaveProperty("metadata");
    });

    it("metadata.size equals buffer byteLength", async () => {
      putMock.mockResolvedValue(blobResult);
      const buf = Buffer.from("hello world");
      const storage = createVercelBlobStorage();
      const result = await storage.upload(buf, {
        filename: "hw.txt",
        contentType: "text/plain",
      });
      expect(result.metadata.size).toBe(buf.byteLength);
    });

    it("uses prefix from env at construction time", async () => {
      process.env.FILE_STORAGE_PREFIX = "custom";
      putMock.mockResolvedValue({ ...blobResult, pathname: "custom/test-uuid-x.txt" });
      const storage = createVercelBlobStorage();
      const result = await storage.upload(Buffer.from("x"), {
        filename: "x.txt",
        contentType: "text/plain",
      });
      expect(putMock).toHaveBeenCalledWith(
        expect.stringContaining("custom/"),
        expect.any(Buffer),
        expect.anything(),
      );
    });
  });

  describe("createUploadUrl", () => {
    it("returns null (uses handleUpload flow instead)", async () => {
      const storage = createVercelBlobStorage();
      const result = await storage.createUploadUrl!({
        filename: "f.jpg",
        contentType: "image/jpeg",
        expiresInSeconds: 300,
      });
      expect(result).toBeNull();
    });
  });

  describe("delete", () => {
    it("calls del with the key", async () => {
      delMock.mockResolvedValue(undefined);
      const storage = createVercelBlobStorage();
      await storage.delete("uploads/some-file.txt");
      expect(delMock).toHaveBeenCalledWith("uploads/some-file.txt");
    });
  });

  describe("exists", () => {
    it("returns true when head succeeds", async () => {
      headMock.mockResolvedValue(blobResult);
      const storage = createVercelBlobStorage();
      expect(await storage.exists("uploads/file.txt")).toBe(true);
    });

    it("returns false when head throws FileNotFoundError", async () => {
      const err = Object.assign(new Error("not found"), { name: "BlobNotFoundError" });
      headMock.mockRejectedValue(err);
      const storage = createVercelBlobStorage();
      expect(await storage.exists("uploads/missing.txt")).toBe(false);
    });

    it("rethrows non-404 errors", async () => {
      headMock.mockRejectedValue(new Error("Network error"));
      const storage = createVercelBlobStorage();
      await expect(storage.exists("uploads/x.txt")).rejects.toThrow("Network error");
    });
  });

  describe("getMetadata", () => {
    it("returns metadata object when head succeeds", async () => {
      headMock.mockResolvedValue(blobResult);
      const storage = createVercelBlobStorage();
      const meta = await storage.getMetadata("uploads/file.txt");
      expect(meta).not.toBeNull();
      expect(meta?.contentType).toBe("text/plain");
      expect(meta?.size).toBe(3);
    });

    it("returns null when file not found", async () => {
      const err = Object.assign(new Error("not found"), { name: "BlobNotFoundError" });
      headMock.mockRejectedValue(err);
      const storage = createVercelBlobStorage();
      const meta = await storage.getMetadata("uploads/missing.txt");
      expect(meta).toBeNull();
    });
  });

  describe("getSourceUrl", () => {
    it("returns the blob URL for a found key", async () => {
      headMock.mockResolvedValue(blobResult);
      const storage = createVercelBlobStorage();
      const url = await storage.getSourceUrl("uploads/file.txt");
      expect(url).toBe(blobResult.url);
    });

    it("returns null when file not found", async () => {
      const err = Object.assign(new Error("not found"), { name: "BlobNotFoundError" });
      headMock.mockRejectedValue(err);
      const storage = createVercelBlobStorage();
      const url = await storage.getSourceUrl("uploads/missing.txt");
      expect(url).toBeNull();
    });
  });

  describe("getDownloadUrl", () => {
    it("returns downloadUrl when present", async () => {
      headMock.mockResolvedValue(blobResult);
      const storage = createVercelBlobStorage();
      const url = await storage.getDownloadUrl("uploads/file.txt");
      expect(url).toBe(blobResult.downloadUrl);
    });

    it("falls back to url when downloadUrl is absent", async () => {
      const noDownloadUrl = { ...blobResult, downloadUrl: undefined };
      headMock.mockResolvedValue(noDownloadUrl);
      const storage = createVercelBlobStorage();
      const url = await storage.getDownloadUrl("uploads/file.txt");
      expect(url).toBe(blobResult.url);
    });

    it("returns null when file not found", async () => {
      const err = Object.assign(new Error("not found"), { name: "BlobNotFoundError" });
      headMock.mockRejectedValue(err);
      const storage = createVercelBlobStorage();
      const url = await storage.getDownloadUrl("uploads/missing.txt");
      expect(url).toBeNull();
    });
  });
});
