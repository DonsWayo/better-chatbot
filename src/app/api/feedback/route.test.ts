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

  it("never calls dbInsert when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ messageId: "m-1", rating: "up" }));
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("401 body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ messageId: "m-1", rating: "up" }));
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("never calls dbInsert when validation fails", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    await POST(makeRequest({ rating: "up" })); // missing messageId
    expect(dbInsertMock).not.toHaveBeenCalled();
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

  it("never calls dbDelete when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(undefined, "http://localhost/api/feedback?messageId=m-1"));
    expect(dbDeleteMock).not.toHaveBeenCalled();
  });

  it("never calls dbDelete when messageId is missing", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(undefined, "http://localhost/api/feedback"));
    expect(dbDeleteMock).not.toHaveBeenCalled();
  });

  it("401 body has error field for DELETE", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(undefined, "http://localhost/api/feedback?messageId=m-1"));
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

describe("POST /api/feedback — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ messageId: "m-1", rating: "up" }));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("400 body has error when messageId is missing", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ rating: "up" }));
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("dbInsert called exactly once on valid POST", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    await POST(makeRequest({ messageId: "m-1", rating: "up" }));
    expect(dbInsertMock).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /api/feedback — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("getSession called exactly once per DELETE", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(undefined, "http://localhost/api/feedback?messageId=m-1"));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("400 body has error when messageId param is missing", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(undefined, "http://localhost/api/feedback"));
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("dbDelete called exactly once on successful delete", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(undefined, "http://localhost/api/feedback?messageId=m-1"));
    expect(dbDeleteMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/feedback — response shape", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("response is always a Response instance", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ messageId: "m-1", rating: "up" }));
    expect(res).toBeInstanceOf(Response);
  });

  it("200 body has ok true on successful feedback", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ messageId: "m-1", rating: "up" }));
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("DELETE response is always a Response instance", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(undefined, "http://localhost/api/feedback?messageId=m-1"));
    expect(res).toBeInstanceOf(Response);
  });

  it("DELETE 200 body has ok true on successful delete", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { DELETE } = await import("./route");
    const res = await DELETE(makeRequest(undefined, "http://localhost/api/feedback?messageId=m-1"));
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

describe("POST and DELETE /api/feedback — call count invariants", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); dbInsertMock.mockReturnValue({ values: dbInsertValuesMock }); dbDeleteMock.mockReturnValue({ where: dbDeleteWhereMock }); });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ messageId: "m1", rating: 1 }));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("dbInsert never called when POST unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ messageId: "m1", rating: 1 }));
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("dbDelete never called when DELETE unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    await DELETE(makeRequest(undefined, "http://localhost/api/feedback?messageId=m-1"));
    expect(dbDeleteMock).not.toHaveBeenCalled();
  });

  it("POST returns Response with status 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ messageId: "m1", rating: 1 }));
    expect(res.status).toBe(401);
  });
});
