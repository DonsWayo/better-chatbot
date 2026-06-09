import { describe, it, expect, vi, beforeEach } from "vitest";

const { downloadMock, storageKeyFromUrlMock, parseCsvPreviewMock, formatCsvPreviewTextMock } = vi.hoisted(() => ({
  downloadMock: vi.fn(),
  storageKeyFromUrlMock: vi.fn(),
  parseCsvPreviewMock: vi.fn(),
  formatCsvPreviewTextMock: vi.fn(),
}));

vi.mock("lib/file-storage", () => ({
  serverFileStorage: { download: downloadMock },
}));
vi.mock("lib/file-storage/storage-utils", () => ({
  storageKeyFromUrl: storageKeyFromUrlMock,
}));
vi.mock("lib/file-ingest/csv", () => ({
  parseCsvPreview: parseCsvPreviewMock,
  formatCsvPreviewText: formatCsvPreviewTextMock,
}));

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

describe("POST /api/storage/ingest", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 400 when neither key nor url provided", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ type: "csv" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/key|url/i);
  });

  it("returns 400 for unsupported file type", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ key: "uploads/file.docx", type: "auto" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Unsupported");
  });

  it("returns CSV preview for .csv key", async () => {
    const PREVIEW = { headers: ["a", "b"], rows: [["1", "2"]] };
    downloadMock.mockResolvedValueOnce(Buffer.from("a,b\n1,2"));
    parseCsvPreviewMock.mockReturnValueOnce(PREVIEW);
    formatCsvPreviewTextMock.mockReturnValueOnce("Preview text");
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ key: "uploads/data.csv" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.type).toBe("csv");
    expect(body.text).toBe("Preview text");
  });

  it("derives key from url when key not provided", async () => {
    storageKeyFromUrlMock.mockReturnValueOnce("uploads/data.csv");
    const PREVIEW = { headers: ["x"], rows: [] };
    downloadMock.mockResolvedValueOnce(Buffer.from("x\n"));
    parseCsvPreviewMock.mockReturnValueOnce(PREVIEW);
    formatCsvPreviewTextMock.mockReturnValueOnce("Preview");
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ url: "http://cdn.example.com/data.csv" }));
    expect(res.status).toBe(200);
    expect(storageKeyFromUrlMock).toHaveBeenCalledWith("http://cdn.example.com/data.csv");
  });
});
