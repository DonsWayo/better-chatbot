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
});
