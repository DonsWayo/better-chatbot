/**
 * Integration tests for the file attachment upload route
 * (/api/storage/upload — the POST handler used for all file attachments).
 *
 * Coverage goals:
 *  - Auth: no session → 401; valid session → proceeds
 *  - File type allowlist (F3 fix from commit d0aea16): permitted and forbidden MIME types
 *  - File size limit: under 20 MB → accepted; over 20 MB → 413
 *  - IDOR prevention (F1 fix): ownership recorded at upload, download requires auth
 *  - CSV-specific: CSV uploads bind ownership; access without session → 401
 *  - Internals: uploadMock / recordStorageObject call counts and arguments
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── hoisted mocks ────────────────────────────────────────────────────────────
const {
  getSessionMock,
  checkStorageActionMock,
  uploadMock,
  recordStorageObjectMock,
  canAccessStorageKeyMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  checkStorageActionMock: vi.fn(),
  uploadMock: vi.fn(),
  recordStorageObjectMock: vi.fn(),
  canAccessStorageKeyMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("../storage/actions", () => ({
  checkStorageAction: checkStorageActionMock,
}));
vi.mock("lib/db/repository", () => ({
  storageObjectRepository: {
    recordStorageObject: recordStorageObjectMock,
    canAccessStorageKey: canAccessStorageKeyMock,
  },
}));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: { upload: uploadMock },
  storageDriver: "local",
}));
vi.mock("lib/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    withDefaults: () => ({ info: vi.fn(), error: vi.fn() }),
  },
}));

// ─── helpers ──────────────────────────────────────────────────────────────────
function makeFile(name: string, mimeType: string, sizeBytes = 64): File {
  const content = new Uint8Array(sizeBytes).fill(0x41); // 'A' × sizeBytes
  return new File([content], name, { type: mimeType });
}

function makeRequest(file?: File): Request {
  const formData = new FormData();
  if (file) formData.append("file", file);
  return { formData: () => Promise.resolve(formData) } as unknown as Request;
}

function sessionFor(userId: string, role?: string) {
  return { user: { id: userId, ...(role ? { role } : {}) } };
}

function storageOk() {
  checkStorageActionMock.mockResolvedValueOnce({ isValid: true });
}

function uploadSuccess(key = "uploads/file.bin", url = "http://cdn/file.bin") {
  uploadMock.mockResolvedValueOnce({ key, sourceUrl: url });
  recordStorageObjectMock.mockResolvedValueOnce(undefined);
}

// Alias to the real route under test — imported lazily so vi.mock hoisting runs first.
async function importRoute() {
  return import(
    "/Users/donswayo/Documents/GitHub/asafechat/src/app/api/storage/upload/route"
  );
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
describe("Auth guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when no session exists", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await importRoute();
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("401 body contains an error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await importRoute();
    const res = await POST(makeRequest());
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("never checks storage config when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await importRoute();
    await POST(makeRequest());
    expect(checkStorageActionMock).not.toHaveBeenCalled();
  });

  it("never calls upload when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await importRoute();
    await POST(makeRequest());
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("proceeds past auth when a valid session is present", async () => {
    getSessionMock.mockResolvedValue(sessionFor("u1"));
    checkStorageActionMock.mockResolvedValueOnce({
      isValid: false,
      error: "no driver",
      solution: "",
    });
    const { POST } = await importRoute();
    const res = await POST(makeRequest());
    // We got past auth (storage check was called); the 500 is expected here
    expect(checkStorageActionMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(500);
  });
});

// ─── File-type allowlist (F3 — P2 security fix) ───────────────────────────────
describe("File type allowlist — accepted MIME types", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(sessionFor("u1"));
  });

  it("accepts text/plain (.txt)", async () => {
    storageOk();
    uploadSuccess();
    const { POST } = await importRoute();
    const res = await POST(makeRequest(makeFile("notes.txt", "text/plain")));
    expect(res.status).toBe(200);
  });

  it("accepts application/pdf (.pdf)", async () => {
    storageOk();
    uploadSuccess();
    const { POST } = await importRoute();
    const res = await POST(makeRequest(makeFile("doc.pdf", "application/pdf")));
    expect(res.status).toBe(200);
  });

  it("accepts image/png (.png)", async () => {
    storageOk();
    uploadSuccess();
    const { POST } = await importRoute();
    const res = await POST(makeRequest(makeFile("img.png", "image/png")));
    expect(res.status).toBe(200);
  });

  it("accepts image/jpeg (.jpg)", async () => {
    storageOk();
    uploadSuccess();
    const { POST } = await importRoute();
    const res = await POST(makeRequest(makeFile("photo.jpg", "image/jpeg")));
    expect(res.status).toBe(200);
  });

  it("accepts image/gif (.gif)", async () => {
    storageOk();
    uploadSuccess();
    const { POST } = await importRoute();
    const res = await POST(makeRequest(makeFile("anim.gif", "image/gif")));
    expect(res.status).toBe(200);
  });

  it("accepts image/webp (.webp)", async () => {
    storageOk();
    uploadSuccess();
    const { POST } = await importRoute();
    const res = await POST(makeRequest(makeFile("pic.webp", "image/webp")));
    expect(res.status).toBe(200);
  });

  it("accepts text/csv (.csv)", async () => {
    storageOk();
    uploadSuccess();
    const { POST } = await importRoute();
    const res = await POST(makeRequest(makeFile("data.csv", "text/csv")));
    expect(res.status).toBe(200);
  });
});

describe("File type allowlist — rejected MIME types", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(sessionFor("u1"));
  });

  it("rejects application/javascript (.js) with 415", async () => {
    storageOk();
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest(makeFile("script.js", "application/javascript")),
    );
    expect(res.status).toBe(415);
  });

  it("rejects application/x-php (.php) with 415", async () => {
    storageOk();
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest(makeFile("shell.php", "application/x-php")),
    );
    expect(res.status).toBe(415);
  });

  it("rejects application/x-msdownload (.exe) with 415", async () => {
    storageOk();
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest(makeFile("malware.exe", "application/x-msdownload")),
    );
    expect(res.status).toBe(415);
  });

  it("rejects text/html (.html) with 415", async () => {
    storageOk();
    const { POST } = await importRoute();
    const res = await POST(makeRequest(makeFile("page.html", "text/html")));
    expect(res.status).toBe(415);
  });

  it("svg is in the allowlist and returns 200 (not a rejection)", async () => {
    storageOk();
    uploadSuccess();
    const { POST } = await importRoute();
    const res = await POST(makeRequest(makeFile("icon.svg", "image/svg+xml")));
    // SVG is permitted — expect 200
    expect(res.status).toBe(200);
  });

  it("rejected file returns error message mentioning the content type", async () => {
    storageOk();
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest(makeFile("script.js", "application/javascript")),
    );
    const body = await res.json();
    expect(body.error).toContain("application/javascript");
  });

  it("never calls upload for a forbidden MIME type", async () => {
    storageOk();
    const { POST } = await importRoute();
    await POST(makeRequest(makeFile("virus.exe", "application/x-msdownload")));
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("file with no extension and no MIME (falls back to octet-stream) → 415", async () => {
    // Simulate a file with type="" — route fills in "application/octet-stream"
    storageOk();
    const emptyTypeFile = new File([new Uint8Array(32)], "noextension", {
      type: "",
    });
    const { POST } = await importRoute();
    const res = await POST(makeRequest(emptyTypeFile));
    expect(res.status).toBe(415);
  });

  it("double-extension file with exe outer MIME is rejected", async () => {
    storageOk();
    // "report.pdf.exe" with MIME application/x-msdownload
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest(makeFile("report.pdf.exe", "application/x-msdownload")),
    );
    expect(res.status).toBe(415);
  });
});

// ─── File size limit ──────────────────────────────────────────────────────────
describe("File size limits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts a file well under 20 MB", async () => {
    getSessionMock.mockResolvedValue(sessionFor("u1"));
    storageOk();
    uploadSuccess("uploads/small.pdf", "http://cdn/small.pdf");
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest(makeFile("small.pdf", "application/pdf", 1024 * 100)), // 100 KB
    );
    expect(res.status).toBe(200);
  });

  it("rejects a file over 20 MB with 413", async () => {
    getSessionMock.mockResolvedValue(sessionFor("u1"));
    storageOk();
    const TWENTY_ONE_MB = 21 * 1024 * 1024;
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest(makeFile("huge.pdf", "application/pdf", TWENTY_ONE_MB)),
    );
    expect(res.status).toBe(413);
  });

  it("413 body contains an error mentioning the upload limit", async () => {
    getSessionMock.mockResolvedValue(sessionFor("u1"));
    storageOk();
    const TWENTY_ONE_MB = 21 * 1024 * 1024;
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest(makeFile("huge.pdf", "application/pdf", TWENTY_ONE_MB)),
    );
    const body = await res.json();
    expect(body.error).toMatch(/20 mb|upload limit/i);
  });

  it("never calls upload when file exceeds size limit", async () => {
    getSessionMock.mockResolvedValue(sessionFor("u1"));
    storageOk();
    const TWENTY_ONE_MB = 21 * 1024 * 1024;
    const { POST } = await importRoute();
    await POST(
      makeRequest(makeFile("huge.pdf", "application/pdf", TWENTY_ONE_MB)),
    );
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

// ─── No file provided ─────────────────────────────────────────────────────────
describe("Missing file", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when no file field is in the form data", async () => {
    getSessionMock.mockResolvedValue(sessionFor("u1"));
    storageOk();
    const { POST } = await importRoute();
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
  });

  it("400 body has an error field", async () => {
    getSessionMock.mockResolvedValue(sessionFor("u1"));
    storageOk();
    const { POST } = await importRoute();
    const res = await POST(makeRequest());
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ─── Storage config error ─────────────────────────────────────────────────────
describe("Storage misconfiguration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(sessionFor("u1"));
  });

  it("returns 500 when storage is not configured", async () => {
    checkStorageActionMock.mockResolvedValueOnce({
      isValid: false,
      error: "No storage configured",
      solution: "Set STORAGE_DRIVER",
    });
    const { POST } = await importRoute();
    // Must provide a file so the request doesn't fail at the 400 gate before
    // reaching the storage-config check.
    const res = await POST(makeRequest(makeFile("doc.pdf", "application/pdf")));
    expect(res.status).toBe(500);
  });

  it("never calls upload when storage is misconfigured", async () => {
    checkStorageActionMock.mockResolvedValueOnce({
      isValid: false,
      error: "No storage",
      solution: "",
    });
    const { POST } = await importRoute();
    await POST(makeRequest(makeFile("doc.pdf", "application/pdf")));
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

// ─── IDOR prevention — ownership recording (F3 fix) ──────────────────────────
describe("IDOR prevention — ownership binding at upload time", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records ownership with the uploader's userId", async () => {
    getSessionMock.mockResolvedValue(sessionFor("userA"));
    storageOk();
    uploadSuccess("uploads/userA-file.csv", "http://cdn/userA-file.csv");
    const { POST } = await importRoute();
    await POST(makeRequest(makeFile("data.csv", "text/csv")));
    expect(recordStorageObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ uploaderUserId: "userA" }),
    );
  });

  it("records ownership with the correct storage key", async () => {
    getSessionMock.mockResolvedValue(sessionFor("userA"));
    storageOk();
    uploadSuccess("uploads/userA-file.csv", "http://cdn/userA-file.csv");
    const { POST } = await importRoute();
    await POST(makeRequest(makeFile("data.csv", "text/csv")));
    expect(recordStorageObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ storageKey: "uploads/userA-file.csv" }),
    );
  });

  it("still returns 200 if recordStorageObject fails (fail-open on bookkeeping)", async () => {
    getSessionMock.mockResolvedValue(sessionFor("userA"));
    storageOk();
    uploadMock.mockResolvedValueOnce({
      key: "uploads/userA-file.csv",
      sourceUrl: "http://cdn/userA-file.csv",
    });
    recordStorageObjectMock.mockRejectedValueOnce(new Error("db down"));
    const { POST } = await importRoute();
    const res = await POST(makeRequest(makeFile("data.csv", "text/csv")));
    expect(res.status).toBe(200);
  });

  it("user B uploading gets user B's userId recorded — not user A's", async () => {
    getSessionMock.mockResolvedValue(sessionFor("userB"));
    storageOk();
    uploadSuccess("uploads/userB-file.pdf", "http://cdn/userB-file.pdf");
    const { POST } = await importRoute();
    await POST(makeRequest(makeFile("doc.pdf", "application/pdf")));
    expect(recordStorageObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ uploaderUserId: "userB" }),
    );
    expect(recordStorageObjectMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ uploaderUserId: "userA" }),
    );
  });

  it("recordStorageObject called exactly once per successful upload", async () => {
    getSessionMock.mockResolvedValue(sessionFor("userA"));
    storageOk();
    uploadSuccess("uploads/once.csv", "http://cdn/once.csv");
    const { POST } = await importRoute();
    await POST(makeRequest(makeFile("data.csv", "text/csv")));
    expect(recordStorageObjectMock).toHaveBeenCalledTimes(1);
  });
});

// ─── CSV-specific IDOR (F1 — P1 security fix) ────────────────────────────────
describe("CSV IDOR — upload phase guards", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for CSV upload attempt without a session", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await importRoute();
    const res = await POST(makeRequest(makeFile("secret.csv", "text/csv")));
    expect(res.status).toBe(401);
  });

  it("never uploads a CSV when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await importRoute();
    await POST(makeRequest(makeFile("leak.csv", "text/csv")));
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("a CSV upload by user A records user A as owner — not null", async () => {
    getSessionMock.mockResolvedValue(sessionFor("userA"));
    checkStorageActionMock.mockResolvedValueOnce({ isValid: true });
    uploadMock.mockResolvedValueOnce({
      key: "uploads/userA.csv",
      sourceUrl: "http://cdn/userA.csv",
    });
    recordStorageObjectMock.mockResolvedValueOnce(undefined);
    const { POST } = await importRoute();
    await POST(makeRequest(makeFile("report.csv", "text/csv")));
    expect(recordStorageObjectMock).toHaveBeenCalledTimes(1);
    const call = recordStorageObjectMock.mock.calls[0][0] as {
      uploaderUserId: string;
    };
    expect(call.uploaderUserId).toBeTruthy();
    expect(call.uploaderUserId).toBe("userA");
  });

  it("successful CSV upload response includes a key the caller can reference", async () => {
    getSessionMock.mockResolvedValue(sessionFor("userA"));
    checkStorageActionMock.mockResolvedValueOnce({ isValid: true });
    uploadMock.mockResolvedValueOnce({
      key: "uploads/userA-data.csv",
      sourceUrl: "http://cdn/userA-data.csv",
    });
    recordStorageObjectMock.mockResolvedValueOnce(undefined);
    const { POST } = await importRoute();
    const res = await POST(makeRequest(makeFile("data.csv", "text/csv")));
    const body = await res.json();
    expect(body).toHaveProperty("key");
    expect(body.key).toBe("uploads/userA-data.csv");
  });
});

// ─── Successful upload response shape ────────────────────────────────────────
describe("Successful upload response shape", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 on a valid upload", async () => {
    getSessionMock.mockResolvedValue(sessionFor("u1"));
    storageOk();
    uploadSuccess("uploads/result.pdf", "http://cdn/result.pdf");
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest(makeFile("result.pdf", "application/pdf")),
    );
    expect(res.status).toBe(200);
  });

  it("response body has success:true", async () => {
    getSessionMock.mockResolvedValue(sessionFor("u1"));
    storageOk();
    uploadSuccess("uploads/result.pdf", "http://cdn/result.pdf");
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest(makeFile("result.pdf", "application/pdf")),
    );
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("response body has both key and url fields", async () => {
    getSessionMock.mockResolvedValue(sessionFor("u1"));
    storageOk();
    uploadSuccess("uploads/result.pdf", "http://cdn/result.pdf");
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest(makeFile("result.pdf", "application/pdf")),
    );
    const body = await res.json();
    expect(body).toHaveProperty("key");
    expect(body).toHaveProperty("url");
  });

  it("upload is called exactly once per successful request", async () => {
    getSessionMock.mockResolvedValue(sessionFor("u1"));
    storageOk();
    uploadSuccess("uploads/result.pdf", "http://cdn/result.pdf");
    const { POST } = await importRoute();
    await POST(makeRequest(makeFile("result.pdf", "application/pdf")));
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it("getSession is called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(sessionFor("u1"));
    storageOk();
    uploadSuccess("uploads/result.pdf", "http://cdn/result.pdf");
    const { POST } = await importRoute();
    await POST(makeRequest(makeFile("result.pdf", "application/pdf")));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("every response is a Response instance", async () => {
    getSessionMock.mockResolvedValue(sessionFor("u1"));
    storageOk();
    uploadSuccess("uploads/result.pdf", "http://cdn/result.pdf");
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest(makeFile("result.pdf", "application/pdf")),
    );
    expect(res).toBeInstanceOf(Response);
  });
});
