import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, dbSelectMock, ingestDocumentMock, extractMock } =
  vi.hoisted(() => ({
    getSessionMock: vi.fn(),
    dbSelectMock: vi.fn(),
    ingestDocumentMock: vi.fn(),
    extractMock: vi.fn(),
  }));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/ai/embeddings/ingest", () => ({
  ingestDocument: ingestDocumentMock,
}));

class UnsupportedFileTypeError extends Error {}
class ExtractedTextTooLargeError extends Error {}

vi.mock("lib/file-ingest/extract", () => ({
  extractTextFromFile: extractMock,
  UnsupportedFileTypeError,
  ExtractedTextTooLargeError,
  MAX_UPLOAD_BYTES: 20 * 1024 * 1024,
}));

const dbSelectWhereMock = vi.fn().mockResolvedValue([]);
const dbSelectFromMock = vi.fn().mockReturnValue({ where: dbSelectWhereMock });
dbSelectMock.mockReturnValue({ from: dbSelectFromMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: dbSelectMock },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeKnowledgeCollectionTable: { id: "id" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
}));

interface FormFields {
  file?: File;
  collectionId?: string;
  sourceRef?: string;
}

function makeRequest(fields: FormFields = {}): Request {
  const fd = new FormData();
  if (fields.file) fd.append("file", fields.file);
  if (fields.collectionId) fd.append("collectionId", fields.collectionId);
  if (fields.sourceRef) fd.append("sourceRef", fields.sourceRef);
  return { formData: () => Promise.resolve(fd) } as unknown as Request;
}

function makeFile(
  content: string | Uint8Array<ArrayBuffer> = "hello",
  name = "doc.pdf",
  type = "application/pdf",
): File {
  return new File([content], name, { type });
}

const admin = { user: { id: "a1", role: "admin" } };

describe("POST /api/knowledge/ingest/upload — auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ file: makeFile(), collectionId: "col-1" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ file: makeFile(), collectionId: "col-1" }),
    );
    expect(res.status).toBe(403);
  });

  it("never extracts or ingests when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ file: makeFile(), collectionId: "col-1" }));
    expect(extractMock).not.toHaveBeenCalled();
    expect(ingestDocumentMock).not.toHaveBeenCalled();
    expect(dbSelectMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/knowledge/ingest/upload — validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(admin);
  });

  it("returns 400 when collectionId is missing", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ file: makeFile() }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/collectionId/);
  });

  it("returns 400 when file is missing", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ collectionId: "col-1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/file/);
  });

  it("returns 400 for a non-multipart body", async () => {
    const { POST } = await import("./route");
    const req = {
      formData: () => Promise.reject(new Error("not multipart")),
    } as unknown as Request;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 413 when the file exceeds the size limit", async () => {
    const { POST } = await import("./route");
    const big = makeFile(new Uint8Array(20 * 1024 * 1024 + 1), "big.pdf");
    const res = await POST(makeRequest({ file: big, collectionId: "col-1" }));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatch(/large/i);
    expect(extractMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an empty file", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ file: makeFile(new Uint8Array(0)), collectionId: "col-1" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when collection is not found", async () => {
    dbSelectWhereMock.mockResolvedValueOnce([]);
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ file: makeFile(), collectionId: "nope" }),
    );
    expect(res.status).toBe(404);
    expect(ingestDocumentMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/knowledge/ingest/upload — extraction outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(admin);
    dbSelectWhereMock.mockResolvedValue([{ id: "col-1" }]);
  });

  it("returns 415 for unsupported file types", async () => {
    extractMock.mockRejectedValueOnce(
      new UnsupportedFileTypeError("Unsupported file type"),
    );
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({
        file: makeFile("x", "deck.pptx", ""),
        collectionId: "col-1",
      }),
    );
    expect(res.status).toBe(415);
    expect(ingestDocumentMock).not.toHaveBeenCalled();
  });

  it("returns 413 when extracted text exceeds the cap", async () => {
    extractMock.mockRejectedValueOnce(
      new ExtractedTextTooLargeError("too large"),
    );
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ file: makeFile(), collectionId: "col-1" }),
    );
    expect(res.status).toBe(413);
  });

  it("returns 422 when extraction fails (corrupted file)", async () => {
    extractMock.mockRejectedValueOnce(new Error("bad xref"));
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ file: makeFile(), collectionId: "col-1" }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/extract/i);
  });

  it("returns 422 when no text could be extracted", async () => {
    extractMock.mockResolvedValueOnce({ text: "", pageCount: 3 });
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ file: makeFile(), collectionId: "col-1" }),
    );
    expect(res.status).toBe(422);
    expect(ingestDocumentMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/knowledge/ingest/upload — success", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(admin);
    dbSelectWhereMock.mockResolvedValue([{ id: "col-1" }]);
  });

  it("extracts, ingests and reports chunks + pages", async () => {
    extractMock.mockResolvedValueOnce({ text: "extracted body", pageCount: 4 });
    ingestDocumentMock.mockResolvedValueOnce(7);
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({
        file: makeFile("pdf-bytes", "report.pdf"),
        collectionId: "col-1",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      collectionId: "col-1",
      sourceRef: "report.pdf",
      chunks: 7,
      pageCount: 4,
    });
    expect(ingestDocumentMock).toHaveBeenCalledWith("extracted body", {
      collectionId: "col-1",
      sourceRef: "report.pdf",
    });
  });

  it("defaults sourceRef to the filename", async () => {
    extractMock.mockResolvedValueOnce({ text: "body" });
    ingestDocumentMock.mockResolvedValueOnce(1);
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({
        file: makeFile("x", "handbook.docx"),
        collectionId: "col-1",
      }),
    );
    const body = await res.json();
    expect(body.sourceRef).toBe("handbook.docx");
  });

  it("uses the provided sourceRef over the filename", async () => {
    extractMock.mockResolvedValueOnce({ text: "body" });
    ingestDocumentMock.mockResolvedValueOnce(2);
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({
        file: makeFile("x", "handbook.docx"),
        collectionId: "col-1",
        sourceRef: "HR Handbook 2026",
      }),
    );
    const body = await res.json();
    expect(body.sourceRef).toBe("HR Handbook 2026");
    expect(ingestDocumentMock).toHaveBeenCalledWith("body", {
      collectionId: "col-1",
      sourceRef: "HR Handbook 2026",
    });
  });

  it("passes the filename to the extractor for type detection", async () => {
    extractMock.mockResolvedValueOnce({ text: "body" });
    ingestDocumentMock.mockResolvedValueOnce(1);
    const { POST } = await import("./route");
    await POST(
      makeRequest({
        file: makeFile("x", "notes.md", ""),
        collectionId: "col-1",
      }),
    );
    expect(extractMock).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      "notes.md",
    );
  });

  it("omits pageCount for non-paged formats", async () => {
    extractMock.mockResolvedValueOnce({ text: "docx text" });
    ingestDocumentMock.mockResolvedValueOnce(3);
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ file: makeFile("x", "a.docx"), collectionId: "col-1" }),
    );
    const body = await res.json();
    expect(body.pageCount).toBeUndefined();
    expect(body.chunks).toBe(3);
  });
});
