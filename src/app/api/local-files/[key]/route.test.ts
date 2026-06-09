import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { readFileMock, isDevMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  isDevMock: { value: false },
}));

vi.mock("node:fs/promises", () => ({ default: { readFile: readFileMock } }));
vi.mock("lib/const", () => ({
  get IS_DEV() {
    return isDevMock.value;
  },
}));

function makeRequest(): NextRequest {
  return {} as unknown as NextRequest;
}

describe("GET /api/local-files/[key] — production mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    isDevMock.value = false;
  });

  it("returns 404 in production", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "image.png" }) });
    expect(res.status).toBe(404);
  });

  it("never reads file in production", async () => {
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ key: "secret.pdf" }) });
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("returns JSON error body in production", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "file.png" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

describe("GET /api/local-files/[key] — dev mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    isDevMock.value = true;
  });

  it("returns 404 when file is not found on disk", async () => {
    readFileMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "missing.png" }) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when readFile throws", async () => {
    readFileMock.mockRejectedValueOnce(new Error("ENOENT"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "gone.png" }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 with file buffer for existing file", async () => {
    const buf = Buffer.from("fake-image-bytes");
    readFileMock.mockResolvedValueOnce(buf);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "photo.png" }) });
    expect(res.status).toBe(200);
  });

  it("sets Content-Type image/png for .png files", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from("png-bytes"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "image.png" }) });
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });

  it("sets Content-Type image/jpeg for .jpg files", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from("jpg-bytes"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "photo.jpg" }) });
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("sets Content-Type image/jpeg for .jpeg files", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from("jpeg-bytes"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "scan.jpeg" }) });
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("sets Content-Type application/pdf for .pdf files", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from("pdf-bytes"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "doc.pdf" }) });
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("sets Content-Type text/plain for .txt files", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from("text content"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "notes.txt" }) });
    expect(res.headers.get("Content-Type")).toBe("text/plain");
  });

  it("sets Content-Type image/gif for .gif files", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from("gif-bytes"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "anim.gif" }) });
    expect(res.headers.get("Content-Type")).toBe("image/gif");
  });

  it("sets Content-Type image/webp for .webp files", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from("webp-bytes"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "img.webp" }) });
    expect(res.headers.get("Content-Type")).toBe("image/webp");
  });

  it("falls back to application/octet-stream for unknown extensions", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from("binary-bytes"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "data.xyz" }) });
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  it("sets Cache-Control header", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from("bytes"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "file.png" }) });
    expect(res.headers.get("Cache-Control")).toBeTruthy();
  });

  it("prevents path traversal by using basename only", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from("bytes"));
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ key: "../../etc/passwd" }) });
    // readFile is called with a path that ends in the basename, not the full traversal path
    expect(readFileMock).toHaveBeenCalledWith(
      expect.stringMatching(/passwd$/)
    );
    const calledPath = readFileMock.mock.calls[0][0] as string;
    expect(calledPath).not.toContain("..");
  });

  it("readFile called exactly once per valid dev request", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from("data"));
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ key: "file.png" }) });
    expect(readFileMock).toHaveBeenCalledTimes(1);
  });

  it("404 body has error field on ENOENT", async () => {
    readFileMock.mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "missing.pdf" }) });
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns Response instance for existing file", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from("content"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "file.txt" }) });
    expect(res).toBeInstanceOf(Response);
  });
});

describe("GET /api/local-files/[key] — dev mode additional types", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    isDevMock.value = true;
  });

  it("sets Content-Type image/svg+xml for .svg files", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from("<svg/>"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "icon.svg" }) });
    expect(res.headers.get("Content-Type")).toContain("svg");
  });

  it("200 response has non-empty body for existing file", async () => {
    const buf = Buffer.from("hello world");
    readFileMock.mockResolvedValueOnce(buf);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "hello.txt" }) });
    expect(res.status).toBe(200);
    const body = await res.arrayBuffer();
    expect(body.byteLength).toBeGreaterThan(0);
  });

  it("returns 404 for keys with no extension", async () => {
    readFileMock.mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "noextension" }) });
    expect(res.status).toBe(404);
  });

  it("readFile not called more than once per request", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from("x"));
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ key: "x.png" }) });
    expect(readFileMock).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/local-files/[key] — call count invariants", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); isDevMock.value = true; });

  it("readFile called exactly once per GET in dev mode", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from("data"));
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ key: "file.txt" }) });
    expect(readFileMock).toHaveBeenCalledTimes(1);
  });

  it("response is always a Response instance for dev mode", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from("content"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "doc.pdf" }) });
    expect(res).toBeInstanceOf(Response);
  });

  it("404 when readFile throws ENOENT in dev mode", async () => {
    readFileMock.mockRejectedValueOnce(Object.assign(new Error("not found"), { code: "ENOENT" }));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "missing.png" }) });
    expect(res.status).toBe(404);
  });

  it("production mode returns 404 without calling readFile", async () => {
    isDevMock.value = false;
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "any.png" }) });
    expect(res.status).toBe(404);
    expect(readFileMock).not.toHaveBeenCalled();
  });
});
