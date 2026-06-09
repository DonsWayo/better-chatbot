import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getSessionMock,
  serverFileStorageMock,
  checkStorageActionMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  serverFileStorageMock: {
    createUploadUrl: vi.fn(),
    getSourceUrl: vi.fn(),
  },
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
vi.mock("@vercel/blob/client", () => ({
  handleUpload: vi.fn().mockResolvedValue({ url: "blob://uploaded" }),
}));
vi.mock("lib/logger", () => ({
  default: {
    withDefaults: () => ({ info: vi.fn(), error: vi.fn() }),
  },
}));
vi.mock("consola/utils", () => ({ colorize: (_: string, s: string) => s }));

import { POST } from "./route";

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/storage/upload-url", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  checkStorageActionMock.mockResolvedValue({ isValid: true });
});

describe("POST /api/storage/upload-url", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ filename: "test.csv" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when session has no user id", async () => {
    getSessionMock.mockResolvedValue({ user: {} });
    const res = await POST(makeRequest({ filename: "test.csv" }));
    expect(res.status).toBe(401);
  });

  it("returns 500 when storage is not configured", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    checkStorageActionMock.mockResolvedValue({
      isValid: false,
      error: "S3 not configured",
      solution: "Set AWS credentials",
    });
    const res = await POST(makeRequest({ filename: "test.csv" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("S3 not configured");
  });

  it("returns 400 on invalid JSON body", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await POST(
      new Request("http://localhost/api/storage/upload-url", {
        method: "POST",
        body: "invalid-json",
        headers: { "content-type": "text/plain" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns fallback response when storage does not support createUploadUrl", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const storageMock = { ...serverFileStorageMock };
    delete (storageMock as Record<string, unknown>).createUploadUrl;
    vi.mocked(serverFileStorageMock).createUploadUrl = undefined as unknown as typeof serverFileStorageMock.createUploadUrl;
    const res = await POST(makeRequest({ filename: "test.csv" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.directUploadSupported).toBe(false);
    expect(body.fallbackUrl).toBe("/api/storage/upload");
  });

  it("returns presigned url when storage supports createUploadUrl", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    serverFileStorageMock.createUploadUrl = vi.fn().mockResolvedValue({
      key: "uploads/test.csv",
      url: "https://s3.example.com/presigned",
    });
    serverFileStorageMock.getSourceUrl.mockResolvedValue(
      "https://cdn.example.com/uploads/test.csv",
    );
    const res = await POST(makeRequest({ filename: "test.csv" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.directUploadSupported).toBe(true);
    expect(body.key).toBe("uploads/test.csv");
    expect(body.sourceUrl).toBe("https://cdn.example.com/uploads/test.csv");
  });

  it("returns fallback when createUploadUrl returns null", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    serverFileStorageMock.createUploadUrl = vi.fn().mockResolvedValue(null);
    const res = await POST(makeRequest({ filename: "test.csv" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.directUploadSupported).toBe(false);
  });

  it("does not call checkStorage when session is missing", async () => {
    getSessionMock.mockResolvedValue(null);
    await POST(makeRequest({ filename: "test.csv" }));
    expect(checkStorageActionMock).not.toHaveBeenCalled();
  });

  it("calls checkStorageAction exactly once per request when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    serverFileStorageMock.createUploadUrl = undefined as unknown as typeof serverFileStorageMock.createUploadUrl;
    await POST(makeRequest({ filename: "test.csv" }));
    expect(checkStorageActionMock).toHaveBeenCalledTimes(1);
  });

  it("500 body includes solution when storage not configured", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    checkStorageActionMock.mockResolvedValue({
      isValid: false,
      error: "S3 not configured",
      solution: "Set AWS_BUCKET env var",
    });
    const res = await POST(makeRequest({ filename: "test.csv" }));
    const body = await res.json();
    expect(body.solution).toBe("Set AWS_BUCKET env var");
  });
});
