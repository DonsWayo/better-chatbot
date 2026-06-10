import { describe, expect, it } from "vitest";
import {
  getContentTypeFromFilename,
  sanitizeFilename,
  storageKeyFromUrl,
} from "./storage-utils";

describe("sanitizeFilename", () => {
  it("returns filename as-is when safe", () => {
    expect(sanitizeFilename("report.pdf")).toBe("report.pdf");
  });

  it("replaces spaces with underscores", () => {
    expect(sanitizeFilename("my file name.txt")).toBe("my_file_name.txt");
  });

  it("replaces special characters", () => {
    expect(sanitizeFilename("file@#$.csv")).toBe("file___.csv");
  });

  it("extracts basename from path separator (forward slash)", () => {
    expect(sanitizeFilename("uploads/data/file.csv")).toBe("file.csv");
  });

  it("extracts basename from path separator (backslash)", () => {
    expect(sanitizeFilename("C:\\Users\\docs\\report.pdf")).toBe("report.pdf");
  });

  it("falls back to 'file' when result is empty string", () => {
    // The fallback triggers only when the replaced result is an empty string.
    // An input of pure special chars becomes underscores (truthy), not empty.
    // To get the fallback, the input must produce "" after replace.
    expect(sanitizeFilename("")).toBe("file");
  });

  it("preserves dots and hyphens", () => {
    expect(sanitizeFilename("my-report.v2.pdf")).toBe("my-report.v2.pdf");
  });
});

describe("getContentTypeFromFilename", () => {
  it("returns image/jpeg for .jpg", () => {
    expect(getContentTypeFromFilename("photo.jpg")).toBe("image/jpeg");
  });

  it("returns image/jpeg for .jpeg", () => {
    expect(getContentTypeFromFilename("photo.jpeg")).toBe("image/jpeg");
  });

  it("returns image/png for .png", () => {
    expect(getContentTypeFromFilename("image.png")).toBe("image/png");
  });

  it("returns application/pdf for .pdf", () => {
    expect(getContentTypeFromFilename("document.pdf")).toBe("application/pdf");
  });

  it("returns text/csv for .csv", () => {
    expect(getContentTypeFromFilename("data.csv")).toBe("text/csv");
  });

  it("returns application/json for .json", () => {
    expect(getContentTypeFromFilename("config.json")).toBe("application/json");
  });

  it("returns text/markdown for .md", () => {
    expect(getContentTypeFromFilename("README.md")).toBe("text/markdown");
  });

  it("returns audio/mpeg for .mp3", () => {
    expect(getContentTypeFromFilename("song.mp3")).toBe("audio/mpeg");
  });

  it("returns video/mp4 for .mp4", () => {
    expect(getContentTypeFromFilename("video.mp4")).toBe("video/mp4");
  });

  it("returns application/octet-stream for unknown extension", () => {
    expect(getContentTypeFromFilename("file.xyz")).toBe(
      "application/octet-stream",
    );
  });

  it("returns application/octet-stream for no extension", () => {
    expect(getContentTypeFromFilename("noextension")).toBe(
      "application/octet-stream",
    );
  });

  it("is case-insensitive for extensions", () => {
    expect(getContentTypeFromFilename("IMAGE.PNG")).toBe("image/png");
    expect(getContentTypeFromFilename("DOCUMENT.PDF")).toBe("application/pdf");
  });
});

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

  it("handles deeply nested paths", () => {
    expect(
      storageKeyFromUrl("https://cdn.example.com/org/team/user/doc.pdf"),
    ).toBe("org/team/user/doc.pdf");
  });

  it("strips leading slash from path", () => {
    const key = storageKeyFromUrl("https://example.com/file.txt");
    expect(key).toBe("file.txt");
    expect(key?.startsWith("/")).toBe(false);
  });

  it("handles URL with query params and hash", () => {
    expect(
      storageKeyFromUrl(
        "https://example.com/uploads/file.csv?v=2&token=abc#section",
      ),
    ).toBe("uploads/file.csv");
  });
});
