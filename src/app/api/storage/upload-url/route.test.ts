import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, checkStorageActionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  checkStorageActionMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("../actions", () => ({ checkStorageAction: checkStorageActionMock }));

const createUploadUrlMock = vi.fn();
const getSourceUrlMock = vi.fn();

vi.mock("lib/file-storage", () => ({
  storageDriver: "local",
  serverFileStorage: {
    createUploadUrl: createUploadUrlMock,
    getSourceUrl: getSourceUrlMock,
  },
}));
vi.mock("lib/logger", () => ({
  default: { withDefaults: () => ({ info: vi.fn(), error: vi.fn() }) },
}));
vi.mock("consola/utils", () => ({ colorize: (_c: string, s: string) => s }));
vi.mock("@vercel/blob/client", () => ({
  handleUpload: vi.fn().mockResolvedValue({ clientToken: "tok123" }),
}));
vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), { ...init, headers: { "content-type": "application/json" } }) },
}));

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body ?? {}) } as unknown as Request;
}

describe("POST /api/storage/upload-url", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 500 when storage misconfigured", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkStorageActionMock.mockResolvedValueOnce({
      isValid: false,
      error: "No storage driver",
      solution: "Set STORAGE_DRIVER",
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("No storage driver");
  });

  it("returns fallback when createUploadUrl returns null", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkStorageActionMock.mockResolvedValueOnce({ isValid: true });
    createUploadUrlMock.mockResolvedValueOnce(null);

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ filename: "doc.pdf" }));
    const body = await res.json();
    expect(body.directUploadSupported).toBe(false);
    expect(body.fallbackUrl).toBe("/api/storage/upload");
  });

  it("returns directUploadSupported true with upload URL when storage supports it", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkStorageActionMock.mockResolvedValueOnce({ isValid: true });
    createUploadUrlMock.mockResolvedValueOnce({ key: "uploads/file.pdf", uploadUrl: "http://s3/signed" });
    getSourceUrlMock.mockResolvedValueOnce("http://cdn/uploads/file.pdf");

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ filename: "file.pdf", contentType: "application/pdf" }));
    const body = await res.json();
    expect(body.directUploadSupported).toBe(true);
    expect(body.key).toBe("uploads/file.pdf");
    expect(body.sourceUrl).toBe("http://cdn/uploads/file.pdf");
  });
});
