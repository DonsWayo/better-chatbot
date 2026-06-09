import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(
    async (_c, _cmd, { expiresIn }: { expiresIn?: number }) =>
      `https://example.com/presigned?exp=${expiresIn}`,
  ),
}));

const sendMock = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  class BaseCmd {
    constructor(public input: Record<string, unknown>) {}
  }
  return {
    S3Client: vi.fn().mockImplementation(() => ({ send: sendMock })),
    PutObjectCommand: class extends BaseCmd {},
    GetObjectCommand: class extends BaseCmd {},
    DeleteObjectCommand: class extends BaseCmd {},
    HeadObjectCommand: class extends BaseCmd {},
  };
});

import { Readable } from "stream";
import { createS3FileStorage } from "./s3-file-storage";

describe("s3-file-storage", () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.FILE_STORAGE_S3_BUCKET = "my-bucket";
    process.env.FILE_STORAGE_S3_REGION = "us-east-2";
    process.env.FILE_STORAGE_PREFIX = "uploads";
    delete process.env.FILE_STORAGE_S3_PUBLIC_BASE_URL;
    delete process.env.FILE_STORAGE_S3_ENDPOINT;
    delete process.env.FILE_STORAGE_S3_FORCE_PATH_STYLE;
  });

  it("uploads and returns sourceUrl + metadata", async () => {
    // PutObject ok
    sendMock.mockResolvedValueOnce({});
    const storage = createS3FileStorage();
    const res = await storage.upload(Buffer.from("abc"), {
      filename: "file.txt",
      contentType: "text/plain",
    });
    expect(res.key).toMatch(/^uploads\//);
    expect(res.sourceUrl).toMatch(
      /^https:\/\/my-bucket.s3.us-east-2.amazonaws.com\//,
    );
    expect(res.metadata.size).toBe(3);
  });

  it("createUploadUrl returns PUT and headers", async () => {
    const storage = createS3FileStorage();
    const out = await storage.createUploadUrl!({
      filename: "img.png",
      contentType: "image/png",
      expiresInSeconds: 600,
    });
    expect(out?.method).toBe("PUT");
    expect(out?.headers).toEqual({ "Content-Type": "image/png" });
    expect(out?.url).toContain("exp=600");
  });

  it("exists returns true/false via HeadObject", async () => {
    const storage = createS3FileStorage();
    // true
    sendMock.mockResolvedValueOnce({});
    expect(await storage.exists("uploads/a.txt")).toBe(true);
    // false
    const err = Object.assign(new Error("not found"), { $metadata: { httpStatusCode: 404 } });
    sendMock.mockRejectedValueOnce(err);
    expect(await storage.exists("uploads/missing.txt")).toBe(false);
  });

  it("getMetadata maps fields", async () => {
    const storage = createS3FileStorage();
    sendMock.mockResolvedValueOnce({
      ContentType: "text/plain",
      ContentLength: 10,
      LastModified: new Date("2020-01-01"),
    });
    const meta = await storage.getMetadata("uploads/x.txt");
    expect(meta?.contentType).toBe("text/plain");
    expect(meta?.size).toBe(10);
  });

  it("getSourceUrl respects PUBLIC_BASE_URL when set", async () => {
    process.env.FILE_STORAGE_S3_PUBLIC_BASE_URL = "https://cdn.example.com";
    const storage = createS3FileStorage();
    const url = await storage.getSourceUrl("uploads/x.txt");
    expect(url).toBe("https://cdn.example.com/uploads/x.txt");
  });
});

describe("s3-file-storage — return type invariants", () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.FILE_STORAGE_S3_BUCKET = "my-bucket";
    process.env.FILE_STORAGE_S3_REGION = "us-east-1";
    process.env.FILE_STORAGE_PREFIX = "files";
    delete process.env.FILE_STORAGE_S3_PUBLIC_BASE_URL;
  });

  it("upload returns object with key, sourceUrl, and metadata", async () => {
    sendMock.mockResolvedValueOnce({});
    const storage = createS3FileStorage();
    const res = await storage.upload(Buffer.from("x"), {
      filename: "t.txt",
      contentType: "text/plain",
    });
    expect(res).toHaveProperty("key");
    expect(res).toHaveProperty("sourceUrl");
    expect(res).toHaveProperty("metadata");
  });

  it("upload metadata.size equals buffer byteLength", async () => {
    sendMock.mockResolvedValueOnce({});
    const buf = Buffer.from("hello world");
    const storage = createS3FileStorage();
    const res = await storage.upload(buf, {
      filename: "hw.txt",
      contentType: "text/plain",
    });
    expect(res.metadata.size).toBe(buf.byteLength);
  });

  it("createUploadUrl returns object with url, method, and headers", async () => {
    const storage = createS3FileStorage();
    const res = await storage.createUploadUrl!({
      filename: "photo.jpg",
      contentType: "image/jpeg",
      expiresInSeconds: 300,
    });
    expect(res).toHaveProperty("url");
    expect(res).toHaveProperty("method");
    expect(res).toHaveProperty("headers");
  });

  it("getSourceUrl returns a string", async () => {
    const storage = createS3FileStorage();
    const url = await storage.getSourceUrl("files/some.txt");
    expect(typeof url).toBe("string");
  });
});

describe("s3-file-storage — key prefix invariants", () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.FILE_STORAGE_S3_BUCKET = "my-bucket";
    process.env.FILE_STORAGE_S3_REGION = "us-east-1";
    process.env.FILE_STORAGE_PREFIX = "data";
    delete process.env.FILE_STORAGE_S3_PUBLIC_BASE_URL;
  });

  it("upload key starts with configured prefix", async () => {
    sendMock.mockResolvedValueOnce({});
    const storage = createS3FileStorage();
    const res = await storage.upload(Buffer.from("x"), {
      filename: "f.txt",
      contentType: "text/plain",
    });
    expect(res.key.startsWith("data/")).toBe(true);
  });

  it("upload key is a non-empty string", async () => {
    sendMock.mockResolvedValueOnce({});
    const storage = createS3FileStorage();
    const res = await storage.upload(Buffer.from("x"), {
      filename: "f.txt",
      contentType: "text/plain",
    });
    expect(typeof res.key).toBe("string");
    expect(res.key.length).toBeGreaterThan(0);
  });
});

describe("s3-file-storage — delete and download", () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.FILE_STORAGE_S3_BUCKET = "my-bucket";
    process.env.FILE_STORAGE_S3_REGION = "us-east-1";
    process.env.FILE_STORAGE_PREFIX = "files";
    delete process.env.FILE_STORAGE_S3_PUBLIC_BASE_URL;
  });

  it("delete sends a command to s3", async () => {
    sendMock.mockResolvedValueOnce({});
    const storage = createS3FileStorage();
    await storage.delete("files/old.txt");
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("download sends a command to s3", async () => {
    sendMock.mockResolvedValueOnce({
      Body: Readable.from([Buffer.from([1, 2, 3])]),
    });
    const storage = createS3FileStorage();
    const result = await storage.download("files/data.bin");
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
  });

  it("upload sends exactly one command to s3", async () => {
    sendMock.mockResolvedValueOnce({});
    const storage = createS3FileStorage();
    await storage.upload(Buffer.from("test"), { filename: "t.txt", contentType: "text/plain" });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
