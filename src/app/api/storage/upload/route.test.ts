import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, checkStorageActionMock, uploadMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  checkStorageActionMock: vi.fn(),
  uploadMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("../actions", () => ({ checkStorageAction: checkStorageActionMock }));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: { upload: uploadMock },
  storageDriver: "local",
}));

function makeRequest(file?: File): Request {
  const formData = new FormData();
  if (file) formData.append("file", file);
  return { formData: () => Promise.resolve(formData) } as unknown as Request;
}

describe("POST /api/storage/upload", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 500 when storage is misconfigured", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkStorageActionMock.mockResolvedValueOnce({
      isValid: false,
      error: "No storage configured",
      solution: "Set STORAGE_DRIVER env var",
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
  });

  it("returns 400 when no file provided", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkStorageActionMock.mockResolvedValueOnce({ isValid: true });
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/file/i);
  });

  it("uploads file and returns key + url", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkStorageActionMock.mockResolvedValueOnce({ isValid: true });
    uploadMock.mockResolvedValueOnce({ key: "uploads/test.png", sourceUrl: "http://cdn/test.png" });
    const file = new File(["hello"], "test.png", { type: "image/png" });
    const { POST } = await import("./route");
    const res = await POST(makeRequest(file));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.key).toBe("uploads/test.png");
    expect(body.url).toBe("http://cdn/test.png");
  });

  it("never calls upload when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest());
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("never calls upload when storage is misconfigured", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkStorageActionMock.mockResolvedValueOnce({ isValid: false, error: "No storage", solution: "" });
    const { POST } = await import("./route");
    await POST(makeRequest());
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("401 body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("500 body has error field for misconfigured storage", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkStorageActionMock.mockResolvedValueOnce({
      isValid: false,
      error: "No storage configured",
      solution: "Set env var",
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("never calls checkStorageAction when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest());
    expect(checkStorageActionMock).not.toHaveBeenCalled();
  });

  it("upload is called exactly once per successful upload", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkStorageActionMock.mockResolvedValueOnce({ isValid: true });
    uploadMock.mockResolvedValueOnce({ key: "k", sourceUrl: "http://cdn/k" });
    const file = new File(["data"], "data.bin", { type: "application/octet-stream" });
    const { POST } = await import("./route");
    await POST(makeRequest(file));
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it("200 body has both key and url fields", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkStorageActionMock.mockResolvedValueOnce({ isValid: true });
    uploadMock.mockResolvedValueOnce({ key: "uploads/f.txt", sourceUrl: "http://cdn/f.txt" });
    const file = new File(["x"], "f.txt", { type: "text/plain" });
    const { POST } = await import("./route");
    const res = await POST(makeRequest(file));
    const body = await res.json();
    expect(body).toHaveProperty("key");
    expect(body).toHaveProperty("url");
  });
});

describe("POST /api/storage/upload — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest());
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("checkStorageAction called exactly once when authenticated", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkStorageActionMock.mockResolvedValueOnce({ isValid: false, error: "No driver", solution: "" });
    const { POST } = await import("./route");
    await POST(makeRequest());
    expect(checkStorageActionMock).toHaveBeenCalledTimes(1);
  });

  it("400 body has error field when no file", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkStorageActionMock.mockResolvedValueOnce({ isValid: true });
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
