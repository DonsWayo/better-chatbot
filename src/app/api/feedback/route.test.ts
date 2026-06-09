import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, dbInsertMock, dbDeleteMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbInsertMock: vi.fn(),
  dbDeleteMock: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));

// Insert chain with onConflictDoUpdate
const dbInsertOnConflictMock = vi.fn().mockResolvedValue([]);
const dbInsertValuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate: dbInsertOnConflictMock });
dbInsertMock.mockReturnValue({ values: dbInsertValuesMock });

// Delete chain
const dbDeleteWhereMock = vi.fn().mockResolvedValue([]);
dbDeleteMock.mockReturnValue({ where: dbDeleteWhereMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { insert: dbInsertMock, delete: dbDeleteMock },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeMessageFeedbackTable: { id: "id", userId: "userId", messageId: "messageId", rating: "rating", comment: "comment", updatedAt: "updatedAt" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
  and: vi.fn((..._args: unknown[]) => ({})),
}));

function makeRequest(body?: unknown, url = "http://localhost/api/feedback"): Request {
  return {
    json: () => Promise.resolve(body),
    url,
  } as unknown as Request;
}

describe("POST /api/feedback", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ messageId: "m-1", rating: "up" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when messageId is missing", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ rating: "up" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when rating is missing", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ messageId: "m-1" }));
    expect(res.status).toBe(400);
  });

  it("records up rating and returns ok", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({
      messageId: "m-1",
      threadId: "t-1",
      rating: "up",
      comment: "Great answer!",
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(dbInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ rating: "up", comment: "Great answer!" }),
    );
  });

  it("upserts — calling onConflictDoUpdate to handle re-votes", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    await POST(makeRequest({ messageId: "m-1", threadId: "t-1", rating: "down" }));
    expect(dbInsertOnConflictMock).toHaveBeenCalledOnce();
  });
});

describe("DELETE /api/feedback", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(undefined, "http://localhost/api/feedback?messageId=m-1"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when messageId param is missing", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(undefined, "http://localhost/api/feedback"));
    expect(res.status).toBe(400);
  });

  it("deletes feedback and returns ok", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(undefined, "http://localhost/api/feedback?messageId=m-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
