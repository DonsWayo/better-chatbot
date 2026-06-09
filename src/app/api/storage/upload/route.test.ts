import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getSessionMock,
  serverFileStorageMock,
  checkStorageActionMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  serverFileStorageMock: { upload: vi.fn() },
  checkStorageActionMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: serverFileStorageMock,
  storageDriver: "local",
}));
vi.mock("../actions", () => ({
  checkStorageAction: checkStorageActionMock,
}));

import { POST } from "./route";

const makeFileRequest = (file?: File) => {
  const formData = new FormData();
  if (file) {
    formData.append("file", file);
  }
  return new Request("http://localhost/api/storage/upload", {
    method: "POST",
    body: formData,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  checkStorageActionMock.mockResolvedValue({ isValid: true });
});

describe("POST /api/storage/upload", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(makeFileRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 when session has no user id", async () => {
    getSessionMock.mockResolvedValue({ user: {} });
    const res = await POST(makeFileRequest());
    expect(res.status).toBe(401);
  });

  it("returns 500 when storage is not configured", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    checkStorageActionMock.mockResolvedValue({
      isValid: false,
      error: "Storage not configured",
      solution: "Set STORAGE_DRIVER env var",
    });
    const res = await POST(makeFileRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Storage not configured");
  });

  it("returns 400 when no file provided", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await POST(makeFileRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no file/i);
  });

  it("uploads file and returns success when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    serverFileStorageMock.upload.mockResolvedValue({
      key: "uploads/test.txt",
      sourceUrl: "http://storage/test.txt",
      metadata: { size: 100 },
    });
    const file = new File(["content"], "test.txt", { type: "text/plain" });
    const res = await POST(makeFileRequest(file));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.key).toBe("uploads/test.txt");
    expect(body.url).toBe("http://storage/test.txt");
  });

  it("calls upload with file buffer and metadata", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    serverFileStorageMock.upload.mockResolvedValue({
      key: "uploads/test.txt",
      sourceUrl: "http://storage/test.txt",
      metadata: {},
    });
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    await POST(makeFileRequest(file));
    expect(serverFileStorageMock.upload).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        filename: "hello.txt",
        contentType: "text/plain",
      }),
    );
  });

  it("returns 500 on unexpected upload error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    serverFileStorageMock.upload.mockRejectedValue(new Error("S3 error"));
    const file = new File(["data"], "file.bin", { type: "application/octet-stream" });
    const res = await POST(makeFileRequest(file));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to upload/i);
  });

  it("does not call upload when session is missing", async () => {
    getSessionMock.mockResolvedValue(null);
    const file = new File(["content"], "test.txt", { type: "text/plain" });
    await POST(makeFileRequest(file));
    expect(serverFileStorageMock.upload).not.toHaveBeenCalled();
  });

  it("does not call upload when storage is not configured", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    checkStorageActionMock.mockResolvedValue({ isValid: false, error: "Not configured", solution: "" });
    const file = new File(["content"], "test.txt", { type: "text/plain" });
    await POST(makeFileRequest(file));
    expect(serverFileStorageMock.upload).not.toHaveBeenCalled();
  });

  it("success body includes metadata", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    serverFileStorageMock.upload.mockResolvedValue({
      key: "uploads/file.pdf",
      sourceUrl: "http://cdn/file.pdf",
      metadata: { size: 512, contentType: "application/pdf" },
    });
    const file = new File(["pdf"], "file.pdf", { type: "application/pdf" });
    const res = await POST(makeFileRequest(file));
    const body = await res.json();
    expect(body.metadata).toBeDefined();
  });

  it("getSession is called exactly once per request", async () => {
    getSessionMock.mockResolvedValue(null);
    await POST(makeFileRequest());
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("calls checkStorageAction exactly once when authorized and file provided", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const file = new File(["content"], "test.txt", { type: "text/plain" });
    serverFileStorageMock.upload.mockResolvedValue({
      key: "k",
      sourceUrl: "http://x",
      metadata: {},
    });
    await POST(makeFileRequest(file));
    expect(checkStorageActionMock).toHaveBeenCalledTimes(1);
  });

  it("success body includes key and url", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    serverFileStorageMock.upload.mockResolvedValue({
      key: "uploads/img.png",
      sourceUrl: "http://cdn/img.png",
      metadata: {},
    });
    const file = new File(["img"], "img.png", { type: "image/png" });
    const res = await POST(makeFileRequest(file));
    const body = await res.json();
    expect(body.key).toBe("uploads/img.png");
    expect(body.url).toBe("http://cdn/img.png");
  });

  it("returns JSON content-type on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    serverFileStorageMock.upload.mockResolvedValue({
      key: "uploads/f.bin",
      sourceUrl: "http://cdn/f.bin",
      metadata: {},
    });
    const file = new File(["x"], "f.bin", { type: "application/octet-stream" });
    const res = await POST(makeFileRequest(file));
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("does not call upload when session has no user id", async () => {
    getSessionMock.mockResolvedValue({ user: {} });
    const file = new File(["content"], "test.txt", { type: "text/plain" });
    await POST(makeFileRequest(file));
    expect(serverFileStorageMock.upload).not.toHaveBeenCalled();
  });

  it("500 body has error field when upload throws", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    serverFileStorageMock.upload.mockRejectedValue(new Error("disk full"));
    const file = new File(["x"], "f.txt", { type: "text/plain" });
    const res = await POST(makeFileRequest(file));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
