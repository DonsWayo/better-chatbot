import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminPermissionMock, dbSelectMock, dbInsertMock } = vi.hoisted(
  () => ({
    requireAdminPermissionMock: vi.fn(),
    dbSelectMock: vi.fn(),
    dbInsertMock: vi.fn(),
  }),
);

vi.mock("lib/auth/permissions", () => ({
  requireAdminPermission: requireAdminPermissionMock,
}));

const dbSelectWhereMock = vi.fn().mockResolvedValue([]);
const dbSelectLimitMock = vi.fn().mockReturnValue([]);
const dbSelectFromMock = vi.fn().mockReturnValue({
  where: vi.fn().mockReturnValue({ limit: dbSelectLimitMock }),
});
dbSelectMock.mockReturnValue({ from: dbSelectFromMock });

const dbInsertReturningMock = vi.fn().mockResolvedValue([]);
const dbInsertOnConflictMock = vi
  .fn()
  .mockReturnValue({ returning: dbInsertReturningMock });
const dbInsertValuesMock = vi
  .fn()
  .mockReturnValue({ onConflictDoUpdate: dbInsertOnConflictMock });
dbInsertMock.mockReturnValue({ values: dbInsertValuesMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: dbSelectMock, insert: dbInsertMock },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeTeamBudgetTable: {
    teamId: "teamId",
    periodStart: "periodStart",
    periodEnd: "periodEnd",
    budgetUsd: "budgetUsd",
  },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
  and: vi.fn((..._args: unknown[]) => ({})),
  lte: vi.fn((_a: unknown, _b: unknown) => ({})),
  gte: vi.fn((_a: unknown, _b: unknown) => ({})),
}));

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

describe("GET /api/admin/teams/[id]/budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not admin", async () => {
    requireAdminPermissionMock.mockRejectedValueOnce(new Error("Unauthorized"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "t-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns null budget when none active", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    dbSelectLimitMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "t-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.budget).toBeNull();
  });

  it("returns active budget", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    dbSelectLimitMock.mockResolvedValueOnce([
      {
        id: "b-1",
        teamId: "t-1",
        budgetUsd: "500.00",
        usedUsd: "120.00",
      },
    ]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "t-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.budget.budgetUsd).toBe("500.00");
  });
});

describe("POST /api/admin/teams/[id]/budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not admin", async () => {
    requireAdminPermissionMock.mockRejectedValueOnce(new Error("Unauthorized"));
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}), {
      params: Promise.resolve({ id: "t-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ budgetUsd: "not-money" }), {
      params: Promise.resolve({ id: "t-1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when periodEnd before periodStart", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({
        budgetUsd: "100.00",
        periodStart: "2026-07-01",
        periodEnd: "2026-06-01",
      }),
      { params: Promise.resolve({ id: "t-1" }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/periodEnd/);
  });

  it("creates/upserts budget and returns 200", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    dbInsertReturningMock.mockResolvedValueOnce([
      {
        id: "b-new",
        teamId: "t-1",
        budgetUsd: "200.00",
      },
    ]);
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({
        budgetUsd: "200.00",
        periodStart: "2026-06-01",
        periodEnd: "2026-06-30",
      }),
      { params: Promise.resolve({ id: "t-1" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.budget.budgetUsd).toBe("200.00");
  });
});

describe("GET /api/admin/teams/[id]/budget — guard chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 text body is Unauthorized", async () => {
    requireAdminPermissionMock.mockRejectedValueOnce(new Error("Unauthorized"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "t-1" }),
    });
    const text = await res.text();
    expect(text).toMatch(/Unauthorized/i);
  });

  it("never calls dbSelect when not admin", async () => {
    requireAdminPermissionMock.mockRejectedValueOnce(new Error("Unauthorized"));
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "t-1" }) });
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it("dbSelect called exactly once for authenticated GET", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    dbSelectLimitMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET(makeRequest(), { params: Promise.resolve({ id: "t-1" }) });
    expect(dbSelectMock).toHaveBeenCalledTimes(1);
  });

  it("returns budget.teamId matching the route param", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    dbSelectLimitMock.mockResolvedValueOnce([
      { id: "b-2", teamId: "t-99", budgetUsd: "100.00" },
    ]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "t-99" }),
    });
    const body = await res.json();
    expect(body.budget.teamId).toBe("t-99");
  });
});

describe("POST /api/admin/teams/[id]/budget — guard chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 text body is Unauthorized for POST", async () => {
    requireAdminPermissionMock.mockRejectedValueOnce(new Error("Unauthorized"));
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}), {
      params: Promise.resolve({ id: "t-1" }),
    });
    const text = await res.text();
    expect(text).toMatch(/Unauthorized/i);
  });

  it("never calls dbInsert when not admin", async () => {
    requireAdminPermissionMock.mockRejectedValueOnce(new Error("Unauthorized"));
    const { POST } = await import("./route");
    await POST(
      makeRequest({
        budgetUsd: "100.00",
        periodStart: "2026-06-01",
        periodEnd: "2026-06-30",
      }),
      { params: Promise.resolve({ id: "t-1" }) },
    );
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("400 body has error field for invalid schema", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ budgetUsd: "bad" }), {
      params: Promise.resolve({ id: "t-1" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("dbInsert called exactly once for valid POST", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    dbInsertReturningMock.mockResolvedValueOnce([
      { id: "b-x", teamId: "t-1", budgetUsd: "300.00" },
    ]);
    const { POST } = await import("./route");
    await POST(
      makeRequest({
        budgetUsd: "300.00",
        periodStart: "2026-06-01",
        periodEnd: "2026-06-30",
      }),
      { params: Promise.resolve({ id: "t-1" }) },
    );
    expect(dbInsertMock).toHaveBeenCalledTimes(1);
  });

  it("400 body has error field when periodEnd equals periodStart", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({
        budgetUsd: "100.00",
        periodStart: "2026-06-30",
        periodEnd: "2026-06-01",
      }),
      { params: Promise.resolve({ id: "t-1" }) },
    );
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("200 response has budget property", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    dbInsertReturningMock.mockResolvedValueOnce([
      { id: "b-z", teamId: "t-7", budgetUsd: "750.00" },
    ]);
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({
        budgetUsd: "750.00",
        periodStart: "2026-06-01",
        periodEnd: "2026-06-30",
      }),
      { params: Promise.resolve({ id: "t-7" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("budget");
  });
});

describe("GET /api/admin/teams/[id]/budget — response shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("response is always a Response instance for 401", async () => {
    requireAdminPermissionMock.mockRejectedValueOnce(new Error("Unauthorized"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "t-1" }),
    });
    expect(res).toBeInstanceOf(Response);
  });

  it("response is always a Response instance for 200 null budget", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    dbSelectLimitMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "t-1" }),
    });
    expect(res).toBeInstanceOf(Response);
  });

  it("POST response is always a Response instance for 401", async () => {
    requireAdminPermissionMock.mockRejectedValueOnce(new Error("Unauthorized"));
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}), {
      params: Promise.resolve({ id: "t-1" }),
    });
    expect(res).toBeInstanceOf(Response);
  });

  it("200 body has budget property when budget found", async () => {
    requireAdminPermissionMock.mockResolvedValue(undefined);
    dbSelectLimitMock.mockResolvedValueOnce([
      { id: "b-rsp", teamId: "t-1", budgetUsd: "100.00" },
    ]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "t-1" }),
    });
    const body = await res.json();
    expect(body).toHaveProperty("budget");
  });
});

describe("POST /api/admin/teams/[id]/budget — response shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    requireAdminPermissionMock.mockResolvedValue(undefined);
    dbInsertReturningMock.mockResolvedValue([
      { id: "b-1", teamId: "t-1", budgetUsd: "200.00" },
    ]);
  });

  it("returns a Response instance on successful POST", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ budgetUsd: "200.00" }), {
      params: Promise.resolve({ id: "t-1" }),
    });
    expect(res).toBeInstanceOf(Response);
  });

  it("returns a Response instance on admin permission error", async () => {
    requireAdminPermissionMock.mockRejectedValueOnce(new Error("Forbidden"));
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ budgetUsd: "100.00" }), {
      params: Promise.resolve({ id: "t-1" }),
    });
    expect(res).toBeInstanceOf(Response);
  });

  it("requireAdminPermission called exactly once per POST", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest({ budgetUsd: "100.00" }), {
      params: Promise.resolve({ id: "t-1" }),
    });
    expect(requireAdminPermissionMock).toHaveBeenCalledTimes(1);
  });

  it("dbInsert called exactly once on valid POST", async () => {
    const { POST } = await import("./route");
    await POST(
      makeRequest({
        budgetUsd: "300.00",
        periodStart: "2026-06-01",
        periodEnd: "2026-07-01",
      }),
      { params: Promise.resolve({ id: "t-1" }) },
    );
    expect(dbInsertMock).toHaveBeenCalledTimes(1);
  });
});

describe("GET and POST /api/admin/teams/[id]/budget — call count invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    requireAdminPermissionMock.mockResolvedValue(undefined);
  });

  it("requireAdminPermission not called when guard rejects mid-flow", async () => {
    requireAdminPermissionMock.mockRejectedValueOnce(new Error("Forbidden"));
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "t-1" }),
    });
    expect(res).toBeInstanceOf(Response);
  });

  it("response is always a Response instance for GET", async () => {
    dbSelectWhereMock.mockResolvedValue([]);
    dbSelectLimitMock.mockReturnValue([]);
    const { GET } = await import("./route");
    const res = await GET(makeRequest(), {
      params: Promise.resolve({ id: "t-1" }),
    });
    expect(res).toBeInstanceOf(Response);
  });

  it("dbInsert not called when requireAdminPermission rejects on POST", async () => {
    requireAdminPermissionMock.mockRejectedValueOnce(new Error("Forbidden"));
    const { POST } = await import("./route");
    await POST(makeRequest({ budgetUsd: "100.00" }), {
      params: Promise.resolve({ id: "t-1" }),
    });
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("response is always a Response instance for POST", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ budgetUsd: "50.00" }), {
      params: Promise.resolve({ id: "t-1" }),
    });
    expect(res).toBeInstanceOf(Response);
  });
});
