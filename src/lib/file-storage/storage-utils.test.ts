import { describe, expect, it, vi, afterEach } from "vitest";
import {
  storageKeyFromUrl,
  sanitizeFilename,
  getContentTypeFromFilename,
  resolveStoragePrefix,
  toBuffer,
  getBase64Data,
} from "./storage-utils";

describe("storageKeyFromUrl", () => {
  it("extracts key from absolute URL", () => {
    expect(storageKeyFromUrl("https://example.com/uploads/sample.csv")).toBe(
      "uploads/sample.csv",
    );
  });

  it("decodes encoded path segments", () => {
    expect(
      storageKeyFromUrl(
        "https://example.com/uploads/My%20File%20(1).csv?token=123",
      ),
    ).toBe("uploads/My File (1).csv");
  });

  it("returns null for invalid URLs", () => {
    expect(storageKeyFromUrl("not-a-url")).toBeNull();
  });
});

describe("storageKeyFromUrl — return type invariants", () => {
  it("returns a string for valid URLs", () => {
    const result = storageKeyFromUrl("https://cdn.example.com/path/to/file.png");
    expect(typeof result).toBe("string");
  });

  it("returns null for empty string", () => {
    expect(storageKeyFromUrl("")).toBeNull();
  });

  it("returns null for just a domain with no path", () => {
    const result = storageKeyFromUrl("https://example.com");
    expect(result === null || result === "").toBeTruthy();
  });

  it("strips the leading slash from pathname", () => {
    const result = storageKeyFromUrl("https://example.com/my/key.txt");
    expect(result).not.toMatch(/^\//);
  });
});

describe("storageKeyFromUrl — edge case invariants", () => {
  it("handles URLs with query strings", () => {
    const result = storageKeyFromUrl("https://example.com/uploads/file.txt?token=abc&v=1");
    expect(result).toBe("uploads/file.txt");
  });

  it("handles URLs with fragments", () => {
    const result = storageKeyFromUrl("https://example.com/uploads/file.txt#section");
    expect(result).toBe("uploads/file.txt");
  });

  it("decodes percent-encoded spaces", () => {
    const result = storageKeyFromUrl("https://example.com/uploads/my%20file.csv");
    expect(result).toBe("uploads/my file.csv");
  });

  it("decodes percent-encoded parens", () => {
    const result = storageKeyFromUrl("https://example.com/uploads/file%281%29.txt");
    expect(result).toBe("uploads/file(1).txt");
  });

  it("returns null for relative paths", () => {
    expect(storageKeyFromUrl("/relative/path")).toBeNull();
  });
});

describe("sanitizeFilename", () => {
  it("returns the filename as-is for safe names", () => {
    expect(sanitizeFilename("photo.jpg")).toBe("photo.jpg");
  });

  it("replaces spaces with underscores", () => {
    expect(sanitizeFilename("my file.txt")).toBe("my_file.txt");
  });

  it("replaces special characters", () => {
    expect(sanitizeFilename("file (1)!.pdf")).toBe("file__1__.pdf");
  });

  it("extracts basename from path with slashes", () => {
    expect(sanitizeFilename("/uploads/deep/photo.png")).toBe("photo.png");
  });

  it("extracts basename from Windows-style paths", () => {
    expect(sanitizeFilename("C:\\Users\\file.txt")).toBe("file.txt");
  });

  it("returns 'file' for empty string", () => {
    expect(sanitizeFilename("")).toBe("file");
  });

  it("preserves dots and hyphens", () => {
    expect(sanitizeFilename("my-file.v2.tar.gz")).toBe("my-file.v2.tar.gz");
  });
});

describe("getContentTypeFromFilename", () => {
  it("returns image/jpeg for .jpg", () => {
    expect(getContentTypeFromFilename("photo.jpg")).toBe("image/jpeg");
  });

  it("returns image/jpeg for .jpeg", () => {
    expect(getContentTypeFromFilename("image.jpeg")).toBe("image/jpeg");
  });

  it("returns image/png for .png", () => {
    expect(getContentTypeFromFilename("logo.png")).toBe("image/png");
  });

  it("returns application/pdf for .pdf", () => {
    expect(getContentTypeFromFilename("report.pdf")).toBe("application/pdf");
  });

  it("returns application/json for .json", () => {
    expect(getContentTypeFromFilename("data.json")).toBe("application/json");
  });

  it("returns text/csv for .csv", () => {
    expect(getContentTypeFromFilename("spreadsheet.csv")).toBe("text/csv");
  });

  it("returns video/mp4 for .mp4", () => {
    expect(getContentTypeFromFilename("video.mp4")).toBe("video/mp4");
  });

  it("returns audio/mpeg for .mp3", () => {
    expect(getContentTypeFromFilename("audio.mp3")).toBe("audio/mpeg");
  });

  it("returns application/octet-stream for unknown extension", () => {
    expect(getContentTypeFromFilename("binary.xyz")).toBe("application/octet-stream");
  });

  it("returns application/octet-stream for no extension", () => {
    expect(getContentTypeFromFilename("noext")).toBe("application/octet-stream");
  });

  it("is case-insensitive for extensions", () => {
    expect(getContentTypeFromFilename("PHOTO.JPG")).toBe("image/jpeg");
  });
});

describe("resolveStoragePrefix", () => {
  afterEach(() => {
    delete process.env.FILE_STORAGE_PREFIX;
  });

  it("defaults to 'uploads' when env var is not set", () => {
    delete process.env.FILE_STORAGE_PREFIX;
    expect(resolveStoragePrefix()).toBe("uploads");
  });

  it("returns custom prefix from env var", () => {
    process.env.FILE_STORAGE_PREFIX = "data";
    expect(resolveStoragePrefix()).toBe("data");
  });

  it("strips leading and trailing slashes", () => {
    process.env.FILE_STORAGE_PREFIX = "/my/prefix/";
    expect(resolveStoragePrefix()).toBe("my/prefix");
  });

  it("strips leading dots", () => {
    process.env.FILE_STORAGE_PREFIX = "...prefix";
    expect(resolveStoragePrefix()).toBe("prefix");
  });
});

describe("toBuffer", () => {
  it("returns Buffer unchanged when given a Buffer", async () => {
    const buf = Buffer.from("hello");
    const result = await toBuffer(buf);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString()).toBe("hello");
  });

  it("converts Uint8Array to Buffer", async () => {
    const arr = new Uint8Array([72, 101, 108, 108, 111]);
    const result = await toBuffer(arr);
    expect(result.toString()).toBe("Hello");
  });

  it("converts ArrayBuffer to Buffer", async () => {
    const arr = new Uint8Array([87, 111, 114, 108, 100]);
    const result = await toBuffer(arr.buffer);
    expect(result.toString()).toBe("World");
  });

  it("converts Blob to Buffer", async () => {
    const blob = new Blob(["test content"], { type: "text/plain" });
    const result = await toBuffer(blob);
    expect(result.toString()).toBe("test content");
  });

  it("throws for unsupported type", async () => {
    await expect(toBuffer("string-not-supported" as Parameters<typeof toBuffer>[0])).rejects.toThrow(
      "Unsupported upload content type",
    );
  });
});

describe("getBase64Data", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("converts Buffer to base64", async () => {
    const buf = Buffer.from("hello world");
    const result = await getBase64Data({ data: buf, mimeType: "text/plain" });
    expect(result.data).toBe(buf.toString("base64"));
    expect(result.mimeType).toBe("text/plain");
  });

  it("converts Uint8Array to base64", async () => {
    const arr = new Uint8Array([1, 2, 3]);
    const result = await getBase64Data({ data: arr, mimeType: "application/octet-stream" });
    expect(result.data).toBe(Buffer.from(arr).toString("base64"));
  });

  it("converts ArrayBuffer to base64", async () => {
    const arr = new Uint8Array([10, 20, 30]);
    const result = await getBase64Data({ data: arr.buffer, mimeType: "application/octet-stream" });
    expect(result.data).toBe(Buffer.from(arr.buffer).toString("base64"));
  });

  it("extracts base64 from data URL", async () => {
    const b64 = "aGVsbG8=";
    const dataUrl = `data:text/plain;base64,${b64}`;
    const result = await getBase64Data({ data: dataUrl, mimeType: "text/plain" });
    expect(result.data).toBe(b64);
  });

  it("passes through pure base64 string", async () => {
    const b64 = "aGVsbG8=";
    const result = await getBase64Data({ data: b64, mimeType: "text/plain" });
    expect(result.data).toBe(b64);
  });

  it("fetches https URL and returns base64", async () => {
    const content = "fetched";
    const srcBuf = Buffer.from(content);
    const arrayBuffer = srcBuf.buffer.slice(srcBuf.byteOffset, srcBuf.byteOffset + srcBuf.byteLength);
    const mockFetch = vi.fn().mockResolvedValue({
      arrayBuffer: vi.fn().mockResolvedValue(arrayBuffer),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await getBase64Data({
      data: "https://example.com/image.png",
      mimeType: "image/png",
    });
    expect(result.data).toBe(srcBuf.toString("base64"));
  });

  it("throws for invalid data URL", async () => {
    await expect(
      getBase64Data({ data: "data:text/plain;BAD", mimeType: "text/plain" }),
    ).rejects.toThrow("Invalid data URL format");
  });

  it("throws when no data provided", async () => {
    await expect(
      getBase64Data({ data: "" as Parameters<typeof getBase64Data>[0]["data"], mimeType: "image/png" }),
    ).rejects.toThrow("No image data provided");
  });
});
