import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, pgDbSelectMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  pgDbSelectMock: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));

// All select chains resolve to [] by default
const makeChain = () => ({ from: () => ({ where: () => Promise.resolve([]) }) });
pgDbSelectMock.mockReturnValue(makeChain());

vi.mock("@/lib/db/pg/db.pg", () => ({
  pgDb: { select: pgDbSelectMock },
}));
vi.mock("@/lib/db/pg/schema.pg", () => ({
  ChatThreadTable: {},
  ChatMessageTable: {},
  AsafeUsageEventTable: {},
  AsafeMessageFeedbackTable: {},
  AsafePromptTemplateTable: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
}));

describe("GET /api/user/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pgDbSelectMock.mockReturnValue(makeChain());
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns JSON blob with user data for authenticated user", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "u-abc123", name: "Alice", email: "alice@example.com", role: "user" },
    });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const json = await res.json();
    expect(json.exportedAt).toBeDefined();
    expect(json.profile.id).toBe("u-abc123");
    expect(json.profile.email).toBe("alice@example.com");
    expect(json.conversations).toBeInstanceOf(Array);
  });

  it("includes userId in the filename of content-disposition", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "u-deadbeef-1234567890", name: "Bob", email: "bob@example.com", role: "user" },
    });
    const { GET } = await import("./route");
    const res = await GET();
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).toContain("u-deadbe");
  });

  it("profile includes name and role from session", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "u-profile-test", name: "Carol", email: "carol@example.com", role: "editor" },
    });
    const { GET } = await import("./route");
    const res = await GET();
    const json = await res.json();
    expect(json.profile.name).toBe("Carol");
    expect(json.profile.role).toBe("editor");
  });

  it("usageEvents and feedback are arrays in the export", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "u-1", name: "Dan", email: "dan@example.com", role: "user" },
    });
    const { GET } = await import("./route");
    const res = await GET();
    const json = await res.json();
    expect(Array.isArray(json.usageEvents)).toBe(true);
    expect(Array.isArray(json.feedback)).toBe(true);
  });

  it("401 body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("export contains promptTemplates array", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "u-2", name: "Eve", email: "eve@example.com", role: "user" },
    });
    const { GET } = await import("./route");
    const res = await GET();
    const json = await res.json();
    expect(Array.isArray(json.promptTemplates)).toBe(true);
  });

  it("exportedAt is an ISO string", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "u-3", name: "Frank", email: "f@example.com", role: "user" },
    });
    const { GET } = await import("./route");
    const res = await GET();
    const json = await res.json();
    expect(typeof json.exportedAt).toBe("string");
    expect(json.exportedAt.length).toBeGreaterThan(0);
  });

  it("content-disposition header includes 'attachment'", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "u-4", name: "Grace", email: "g@example.com", role: "user" },
    });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.headers.get("content-disposition")).toContain("attachment");
  });
});

describe("GET /api/user/export — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pgDbSelectMock.mockReturnValue(makeChain());
  });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("never calls pgDbSelect when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(pgDbSelectMock).not.toHaveBeenCalled();
  });

  it("200 body has conversations array even with no data", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "u-5", name: "Hank", email: "h@example.com", role: "user" },
    });
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(Array.isArray(body.conversations)).toBe(true);
  });

  it("profile.id matches the session user id", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "uid-match-test", name: "Iris", email: "i@example.com", role: "user" },
    });
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body.profile.id).toBe("uid-match-test");
  });
});

describe("GET /api/user/export — response shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pgDbSelectMock.mockReturnValue(makeChain());
  });

  it("returns a Response instance for 401", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res).toBeInstanceOf(Response);
  });

  it("returns a Response instance for 200", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "u-shape", name: "Jake", email: "j@example.com", role: "user" },
    });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res).toBeInstanceOf(Response);
  });

  it("200 body is not null", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "u-nn", name: "Kate", email: "k@example.com", role: "user" },
    });
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).not.toBeNull();
  });

  it("content-type is application/json for 200", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "u-ct", name: "Leo", email: "l@example.com", role: "user" },
    });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
