import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Auth mock — control who is "logged in" per test
let mockSession: { user: { role: string } } | null = null;
vi.mock("lib/auth/server", () => ({
  getSession: () => Promise.resolve(mockSession),
}));

// DB mock — capture upserted rows
const mockSelect = vi.fn();
const mockInsert = vi.fn();
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: () => ({
      from: () => ({
        orderBy: () => mockSelect(),
      }),
    }),
    insert: () => ({
      values: (v: unknown) => ({
        onConflictDoUpdate: () => mockInsert(v),
      }),
    }),
  },
}));

vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeFeatureFlagTable: { name: "name", enabled: "enabled" },
}));

// Kill-switch cache reset mock
const mockResetCache = vi.fn();
vi.mock("lib/observability/kill-switch", () => ({
  _resetKillSwitchCache: () => mockResetCache(),
}));

// Import after mocks
import { GET, POST } from "./route";

function makeRequest(body?: unknown) {
  return {
    json: () => Promise.resolve(body),
  } as unknown as Request;
}

describe("GET /api/admin/feature-flags", () => {
  beforeEach(() => {
    mockSelect.mockClear();
    mockInsert.mockClear();
    mockResetCache.mockClear();
  });

  it("returns 401 when not authenticated", async () => {
    mockSession = null;
    const res = await GET({} as Request);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin user", async () => {
    mockSession = { user: { role: "user" } };
    const res = await GET({} as Request);
    expect(res.status).toBe(403);
  });

  it("returns 403 for editor user", async () => {
    mockSession = { user: { role: "editor" } };
    const res = await GET({} as Request);
    expect(res.status).toBe(403);
  });

  it("returns 200 with flags array for admin", async () => {
    mockSession = { user: { role: "admin" } };
    const updatedAt = new Date("2026-01-01T00:00:00.000Z");
    mockSelect.mockResolvedValue([{ name: "kill_switch", enabled: false, updatedAt }]);
    const res = await GET({} as Request);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Date serialises to ISO string in JSON
    expect(body.flags).toEqual([{ name: "kill_switch", enabled: false, updatedAt: updatedAt.toISOString() }]);
  });
});

describe("POST /api/admin/feature-flags", () => {
  beforeEach(() => {
    mockSession = { user: { role: "admin" } };
    mockSelect.mockClear();
    mockInsert.mockClear();
    mockResetCache.mockClear();
  });

  it("returns 401 when not authenticated", async () => {
    mockSession = null;
    const res = await POST(makeRequest({ name: "kill_switch", enabled: true }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    mockSession = { user: { role: "user" } };
    const res = await POST(makeRequest({ name: "kill_switch", enabled: true }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing name", async () => {
    const res = await POST(makeRequest({ enabled: true }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-boolean enabled", async () => {
    const res = await POST(makeRequest({ name: "kill_switch", enabled: "yes" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON body", async () => {
    const badReq = { json: () => Promise.reject(new Error("bad json")) } as unknown as Request;
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });

  it("upserts flag and returns 200 with name and enabled", async () => {
    mockInsert.mockResolvedValue(undefined);
    const res = await POST(makeRequest({ name: "some_flag", enabled: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ name: "some_flag", enabled: true });
    expect(mockInsert).toHaveBeenCalledOnce();
  });

  it("resets kill-switch cache when toggling kill_switch flag", async () => {
    mockInsert.mockResolvedValue(undefined);
    await POST(makeRequest({ name: "kill_switch", enabled: true }));
    expect(mockResetCache).toHaveBeenCalledOnce();
  });

  it("does NOT reset kill-switch cache for other flags", async () => {
    mockInsert.mockResolvedValue(undefined);
    await POST(makeRequest({ name: "some_other_flag", enabled: true }));
    expect(mockResetCache).not.toHaveBeenCalled();
  });

  it("returns the correct enabled=false value on deactivation", async () => {
    mockInsert.mockResolvedValue(undefined);
    const res = await POST(makeRequest({ name: "kill_switch", enabled: false }));
    const body = await res.json();
    expect(body.enabled).toBe(false);
  });

  it("POST 401 body has error field", async () => {
    mockSession = null;
    const res = await POST(makeRequest({ name: "kill_switch", enabled: true }));
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("POST 403 body has error field", async () => {
    mockSession = { user: { role: "user" } };
    const res = await POST(makeRequest({ name: "kill_switch", enabled: true }));
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("POST 400 body has error field", async () => {
    const res = await POST(makeRequest({ enabled: true }));
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("mockInsert never called when not admin", async () => {
    mockSession = { user: { role: "user" } };
    await POST(makeRequest({ name: "kill_switch", enabled: true }));
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("mockInsert never called when unauthenticated", async () => {
    mockSession = null;
    await POST(makeRequest({ name: "kill_switch", enabled: true }));
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/feature-flags — additional", () => {
  beforeEach(() => {
    mockSelect.mockClear();
    mockInsert.mockClear();
    mockResetCache.mockClear();
  });

  it("GET 401 body has error field", async () => {
    mockSession = null;
    const res = await GET({} as Request);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("GET 403 body has error field", async () => {
    mockSession = { user: { role: "user" } };
    const res = await GET({} as Request);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("mockSelect never called when not admin", async () => {
    mockSession = { user: { role: "user" } };
    await GET({} as Request);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("200 body flags is an array", async () => {
    mockSession = { user: { role: "admin" } };
    mockSelect.mockResolvedValue([]);
    const res = await GET({} as Request);
    const body = await res.json();
    expect(Array.isArray(body.flags)).toBe(true);
  });
});

describe("POST /api/admin/feature-flags — additional", () => {
  beforeEach(() => {
    mockSession = { user: { role: "admin" } };
    mockSelect.mockClear();
    mockInsert.mockClear();
    mockResetCache.mockClear();
  });

  it("response is always a Response instance", async () => {
    mockInsert.mockResolvedValue(undefined);
    const res = await POST(makeRequest({ name: "kill_switch", enabled: true }));
    expect(res).toBeInstanceOf(Response);
  });

  it("200 body has name field on success", async () => {
    mockInsert.mockResolvedValue(undefined);
    const res = await POST(makeRequest({ name: "feature_x", enabled: false }));
    const body = await res.json();
    expect(body).toHaveProperty("name");
  });

  it("200 body name matches the posted name", async () => {
    mockInsert.mockResolvedValue(undefined);
    const res = await POST(makeRequest({ name: "feature_unique_99", enabled: true }));
    const body = await res.json();
    expect(body.name).toBe("feature_unique_99");
  });

  it("mockInsert called exactly once per valid POST", async () => {
    mockInsert.mockResolvedValue(undefined);
    await POST(makeRequest({ name: "flag_once", enabled: false }));
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/admin/feature-flags — response shape", () => {
  beforeEach(() => {
    mockSelect.mockClear();
    mockInsert.mockClear();
    mockResetCache.mockClear();
    mockSession = { user: { role: "admin" } };
    mockSelect.mockResolvedValue([]);
  });

  it("returns a Response instance for 200", async () => {
    const res = await GET(makeRequest());
    expect(res).toBeInstanceOf(Response);
  });

  it("200 body is an array", async () => {
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("returns 401 when session is null", async () => {
    mockSession = null;
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("mockSelect called exactly once per GET", async () => {
    await GET(makeRequest());
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });
});
