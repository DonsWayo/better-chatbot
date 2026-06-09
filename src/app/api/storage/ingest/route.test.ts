import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  serverFileStorageMock,
  parseCsvPreviewMock,
  formatCsvPreviewTextMock,
  storageKeyFromUrlMock,
} = vi.hoisted(() => ({
  serverFileStorageMock: { download: vi.fn() },
  parseCsvPreviewMock: vi.fn(),
  formatCsvPreviewTextMock: vi.fn(),
  storageKeyFromUrlMock: vi.fn(),
}));

vi.mock("lib/file-storage", () => ({
  serverFileStorage: serverFileStorageMock,
}));
vi.mock("lib/file-ingest/csv", () => ({
  parseCsvPreview: parseCsvPreviewMock,
  formatCsvPreviewText: formatCsvPreviewTextMock,
}));
vi.mock("lib/file-storage/storage-utils", () => ({
  storageKeyFromUrl: storageKeyFromUrlMock,
}));

import { POST } from "./route";

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/storage/ingest", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const CSV_PREVIEW = {
  headers: ["name", "age"],
  rows: [["Alice", "30"]],
  totalRows: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  serverFileStorageMock.download.mockResolvedValue(Buffer.from("name,age\nAlice,30"));
  parseCsvPreviewMock.mockReturnValue(CSV_PREVIEW);
  formatCsvPreviewTextMock.mockReturnValue("name | age\nAlice | 30");
});

describe("POST /api/storage/ingest", () => {
  it("returns 400 when body is invalid JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/storage/ingest", {
        method: "POST",
        body: "not-json",
        headers: { "content-type": "text/plain" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when neither key nor url provided", async () => {
    const res = await POST(makeRequest({ type: "csv" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/key.*url/i);
  });

  it("returns 400 when file type is not supported", async () => {
    const res = await POST(makeRequest({ key: "uploads/file.pdf" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unsupported/i);
  });

  it("processes CSV by key and returns preview", async () => {
    const res = await POST(makeRequest({ key: "uploads/data.csv" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.type).toBe("csv");
    expect(body.key).toBe("uploads/data.csv");
    expect(body.preview).toEqual(CSV_PREVIEW);
  });

  it("detects CSV by explicit type", async () => {
    const res = await POST(makeRequest({ key: "uploads/file.dat", type: "csv" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("csv");
  });

  it("converts url to key via storageKeyFromUrl", async () => {
    storageKeyFromUrlMock.mockReturnValue("uploads/from-url.csv");
    const res = await POST(
      makeRequest({ url: "https://storage.example.com/uploads/from-url.csv" }),
    );
    expect(storageKeyFromUrlMock).toHaveBeenCalledWith(
      "https://storage.example.com/uploads/from-url.csv",
    );
    expect(res.status).toBe(200);
  });

  it("calls download with the resolved key", async () => {
    await POST(makeRequest({ key: "uploads/sales.csv" }));
    expect(serverFileStorageMock.download).toHaveBeenCalledWith("uploads/sales.csv");
  });

  it("calls parseCsvPreview with downloaded buffer", async () => {
    await POST(makeRequest({ key: "uploads/data.csv" }));
    expect(parseCsvPreviewMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ maxRows: 50, maxCols: 12 }),
    );
  });

  it("respects custom maxRows and maxCols within limits", async () => {
    await POST(makeRequest({ key: "uploads/data.csv", maxRows: 100, maxCols: 20 }));
    expect(parseCsvPreviewMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ maxRows: 100, maxCols: 20 }),
    );
  });

  it("clamps maxRows to 200", async () => {
    await POST(makeRequest({ key: "uploads/data.csv", maxRows: 999 }));
    expect(parseCsvPreviewMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ maxRows: 200 }),
    );
  });

  it("includes formatted text in response", async () => {
    const res = await POST(makeRequest({ key: "uploads/data.csv" }));
    const body = await res.json();
    expect(body.text).toBe("name | age\nAlice | 30");
  });
});
