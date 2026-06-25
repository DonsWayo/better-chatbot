import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be set up before any module is imported.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => {
  // Chainable mock for db.select().from().where()
  const mockWhere = vi.fn();
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));

  return {
    getSessionMock: vi.fn(),
    repo: {
      createDocument: vi.fn(),
      updateDocument: vi.fn(),
      deleteDocument: vi.fn(),
    },
    db: { select: mockSelect },
    mockWhere,
    mockFrom,
    mockSelect,
  };
});

vi.mock("auth/server", () => ({ getSession: h.getSessionMock }));
vi.mock("lib/db/repository", () => ({ documentRepository: h.repo }));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: h.db }));

// Stub table columns with plain sentinel values; the real objects are Drizzle
// column objects but in unit tests we only care that the mocked ORM helpers
// receive them through — using simple symbols ensures identity checks work.
const USER_ID_COL = Symbol("userId");
const CREATED_AT_COL = Symbol("createdAt");
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeDocumentTable: {
    userId: USER_ID_COL,
    createdAt: CREATED_AT_COL,
  },
}));

// Stub drizzle-orm helpers so the action can call them without a real DB.
// Each helper returns a small tagged object so we can inspect call arguments.
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ __and: args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ __eq: { col, val } })),
  gte: vi.fn((col: unknown, val: unknown) => ({ __gte: { col, val } })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, s, i) => acc + s + (values[i] ?? ""), ""),
  ),
}));

// ---------------------------------------------------------------------------
// Constants shared by tests
// ---------------------------------------------------------------------------

const USER = "00000000-0000-0000-0000-00000000aaaa";
const DOC_ID = "00000000-0000-0000-0000-00000000dddd";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset all mocks and set a sensible default session + DB state. */
function setCount(n: number) {
  h.mockWhere.mockResolvedValue([{ count: n }]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("saveResearchAsDocumentAction — rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Authenticated by default
    h.getSessionMock.mockResolvedValue({ user: { id: USER } });
    // Repo happy-path defaults
    h.repo.createDocument.mockResolvedValue({ id: DOC_ID, userId: USER });
    h.repo.updateDocument.mockResolvedValue({ id: DOC_ID });
    h.repo.deleteDocument.mockResolvedValue(undefined);
  });

  // ── unauthenticated ────────────────────────────────────────────────────────

  it("returns Unauthorized when there is no session", async () => {
    h.getSessionMock.mockResolvedValue(null);
    // db.select should never be reached
    const { saveResearchAsDocumentAction } = await import("./actions");
    const res = await saveResearchAsDocumentAction("T", "body");
    expect(res).toEqual({ success: false, error: "Unauthorized" });
    expect(h.mockSelect).not.toHaveBeenCalled();
    expect(h.repo.createDocument).not.toHaveBeenCalled();
  });

  it("returns Unauthorized when session.user.id is missing", async () => {
    h.getSessionMock.mockResolvedValue({ user: {} });
    const { saveResearchAsDocumentAction } = await import("./actions");
    const res = await saveResearchAsDocumentAction("T", "body");
    expect(res).toEqual({ success: false, error: "Unauthorized" });
    expect(h.repo.createDocument).not.toHaveBeenCalled();
  });

  // ── below limit ────────────────────────────────────────────────────────────

  it("count = 0 → succeeds and creates a document", async () => {
    setCount(0);
    const { saveResearchAsDocumentAction } = await import("./actions");
    const res = await saveResearchAsDocumentAction("My doc", "Hello world");
    expect(res).toEqual({
      success: true,
      data: { id: DOC_ID, url: `/documents/${DOC_ID}` },
    });
    expect(h.repo.createDocument).toHaveBeenCalledTimes(1);
  });

  it("count = 1 → succeeds", async () => {
    setCount(1);
    const { saveResearchAsDocumentAction } = await import("./actions");
    const res = await saveResearchAsDocumentAction("T", "text");
    expect(res.success).toBe(true);
  });

  it("count = 19 → succeeds (exactly limit - 1)", async () => {
    setCount(19);
    const { saveResearchAsDocumentAction } = await import("./actions");
    const res = await saveResearchAsDocumentAction("T", "text");
    expect(res.success).toBe(true);
    expect(h.repo.createDocument).toHaveBeenCalledTimes(1);
  });

  // ── at/above limit ─────────────────────────────────────────────────────────

  it("count = 20 → returns structured rate-limit error", async () => {
    setCount(20);
    const { saveResearchAsDocumentAction } = await import("./actions");
    const res = await saveResearchAsDocumentAction("T", "text");
    expect(res.success).toBe(false);
    expect((res as { success: false; error: string }).error).toMatch(
      /20 documents/i,
    );
    expect(h.repo.createDocument).not.toHaveBeenCalled();
  });

  it("count = 50 → returns structured rate-limit error", async () => {
    setCount(50);
    const { saveResearchAsDocumentAction } = await import("./actions");
    const res = await saveResearchAsDocumentAction("T", "text");
    expect(res.success).toBe(false);
    expect((res as { success: false; error: string }).error).toMatch(
      /20 documents/i,
    );
    expect(h.repo.createDocument).not.toHaveBeenCalled();
  });

  it("count = 20 → error mentions the per-hour window", async () => {
    setCount(20);
    const { saveResearchAsDocumentAction } = await import("./actions");
    const res = await saveResearchAsDocumentAction("T", "text");
    expect((res as { success: false; error: string }).error).toMatch(/hour/i);
  });

  // ── DB error during rate-limit check ───────────────────────────────────────

  it("DB error during rate-limit check → toActionResult returns structured error", async () => {
    h.mockWhere.mockRejectedValue(new Error("connection refused"));
    const { saveResearchAsDocumentAction } = await import("./actions");
    const res = await saveResearchAsDocumentAction("T", "text");
    expect(res.success).toBe(false);
    expect((res as { success: false; error: string }).error).toBe(
      "connection refused",
    );
    expect(h.repo.createDocument).not.toHaveBeenCalled();
  });

  // ── missing row (empty result set) ─────────────────────────────────────────

  it("empty DB result → defaults count to 0 and succeeds", async () => {
    h.mockWhere.mockResolvedValue([]); // no row returned
    const { saveResearchAsDocumentAction } = await import("./actions");
    const res = await saveResearchAsDocumentAction("T", "text");
    expect(res.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// saveResearchAsDocumentAction — happy-path behaviour
// ---------------------------------------------------------------------------

describe("saveResearchAsDocumentAction — happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getSessionMock.mockResolvedValue({ user: { id: USER } });
    h.repo.createDocument.mockResolvedValue({ id: DOC_ID, userId: USER });
    h.repo.updateDocument.mockResolvedValue({ id: DOC_ID });
    h.repo.deleteDocument.mockResolvedValue(undefined);
    setCount(0);
  });

  it("creates doc with userId + title", async () => {
    const { saveResearchAsDocumentAction } = await import("./actions");
    await saveResearchAsDocumentAction("My Title", "Some text");
    expect(h.repo.createDocument).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, title: "My Title" }),
    );
  });

  it("calls updateDocument with ProseMirror content", async () => {
    const { saveResearchAsDocumentAction } = await import("./actions");
    await saveResearchAsDocumentAction("T", "Hello world");
    expect(h.repo.updateDocument).toHaveBeenCalledWith(
      DOC_ID,
      expect.objectContaining({
        title: "T",
        content: expect.objectContaining({ type: "doc" }),
      }),
      USER,
    );
  });

  it("returns { success: true, data: { id, url } }", async () => {
    const { saveResearchAsDocumentAction } = await import("./actions");
    const res = await saveResearchAsDocumentAction("T", "text");
    expect(res).toEqual({
      success: true,
      data: { id: DOC_ID, url: `/documents/${DOC_ID}` },
    });
  });

  it("does NOT call deleteDocument on success", async () => {
    const { saveResearchAsDocumentAction } = await import("./actions");
    await saveResearchAsDocumentAction("T", "text");
    expect(h.repo.deleteDocument).not.toHaveBeenCalled();
  });

  it("calls deleteDocument as orphan cleanup when updateDocument throws", async () => {
    h.repo.updateDocument.mockRejectedValue(new Error("disk full"));
    const { saveResearchAsDocumentAction } = await import("./actions");
    const res = await saveResearchAsDocumentAction("T", "text");
    expect(res.success).toBe(false);
    expect((res as { success: false; error: string }).error).toBe("disk full");
    expect(h.repo.deleteDocument).toHaveBeenCalledWith(DOC_ID, USER);
  });

  it("still surfaces the original error even when deleteDocument also fails", async () => {
    h.repo.updateDocument.mockRejectedValue(new Error("write error"));
    h.repo.deleteDocument.mockRejectedValue(new Error("delete also failed"));
    const { saveResearchAsDocumentAction } = await import("./actions");
    const res = await saveResearchAsDocumentAction("T", "text");
    expect(res.success).toBe(false);
    expect((res as { success: false; error: string }).error).toBe(
      "write error",
    );
  });
});

// ---------------------------------------------------------------------------
// assertResearchSaveRateLimit semantics
// ---------------------------------------------------------------------------

describe("assertResearchSaveRateLimit semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getSessionMock.mockResolvedValue({ user: { id: USER } });
    h.repo.createDocument.mockResolvedValue({ id: DOC_ID, userId: USER });
    h.repo.updateDocument.mockResolvedValue({ id: DOC_ID });
    setCount(0);
  });

  it("passes the correct userId to the eq filter", async () => {
    const { eq } = await import("drizzle-orm");
    const { saveResearchAsDocumentAction } = await import("./actions");
    await saveResearchAsDocumentAction("T", "text");
    expect(eq).toHaveBeenCalledWith(USER_ID_COL, USER);
  });

  it("the gte filter receives a Date approximately 60 minutes in the past", async () => {
    const { gte } = await import("drizzle-orm");
    const before = Date.now();
    const { saveResearchAsDocumentAction } = await import("./actions");
    await saveResearchAsDocumentAction("T", "text");
    const after = Date.now();

    expect(gte).toHaveBeenCalledTimes(1);
    const [[, windowStart]] = (gte as ReturnType<typeof vi.fn>).mock.calls;
    expect(windowStart).toBeInstanceOf(Date);
    const windowMs = (windowStart as Date).getTime();
    // windowStart should be ~3600 s before the call time
    expect(before - windowMs).toBeGreaterThanOrEqual(60 * 60 * 1000 - 50);
    expect(after - windowMs).toBeLessThanOrEqual(60 * 60 * 1000 + 50);
  });

  it("queries AsafeDocumentTable (not a different table)", async () => {
    const { saveResearchAsDocumentAction } = await import("./actions");
    await saveResearchAsDocumentAction("T", "text");
    // mockFrom is called with the table reference
    const { AsafeDocumentTable } = await import("lib/db/pg/schema.pg");
    expect(h.mockFrom).toHaveBeenCalledWith(AsafeDocumentTable);
  });

  it("limit is exactly 20: count 19 passes, count 20 is blocked", async () => {
    const { saveResearchAsDocumentAction } = await import("./actions");

    setCount(19);
    const pass = await saveResearchAsDocumentAction("T", "text");
    expect(pass.success).toBe(true);

    vi.clearAllMocks();
    h.getSessionMock.mockResolvedValue({ user: { id: USER } });
    h.repo.createDocument.mockResolvedValue({ id: DOC_ID, userId: USER });
    h.repo.updateDocument.mockResolvedValue({ id: DOC_ID });
    setCount(20);
    const block = await saveResearchAsDocumentAction("T", "text");
    expect(block.success).toBe(false);
  });

  it("uses and() to compose both filters into a single where clause", async () => {
    const { and } = await import("drizzle-orm");
    const { saveResearchAsDocumentAction } = await import("./actions");
    await saveResearchAsDocumentAction("T", "text");
    // and() should have been called with two arguments (the eq + gte results)
    expect(and).toHaveBeenCalledTimes(1);
    const [args] = (and as ReturnType<typeof vi.fn>).mock.calls;
    expect(args).toHaveLength(2);
  });
});
