import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionMock,
  dbSelectMock,
  dbInsertMock,
  loadViewerContextMock,
  resolveAccessMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbInsertMock: vi.fn(),
  loadViewerContextMock: vi.fn(),
  resolveAccessMock: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));

const dbSelectFromMock = vi.fn().mockResolvedValue([]);
dbSelectMock.mockReturnValue({ from: dbSelectFromMock });

const dbInsertReturningMock = vi
  .fn()
  .mockResolvedValue([{ id: "col-1", name: "Docs" }]);
const dbInsertValuesMock = vi
  .fn()
  .mockReturnValue({ returning: dbInsertReturningMock });
dbInsertMock.mockReturnValue({ values: dbInsertValuesMock });

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: dbSelectMock, insert: dbInsertMock },
}));
vi.mock("lib/db/pg/schema.pg", () => ({
  AsafeKnowledgeCollectionTable: {
    id: "id",
    name: "name",
    visibility: "visibility",
    teamId: "teamId",
    teamIds: "teamIds",
    createdAt: "createdAt",
  },
}));
vi.mock("lib/visibility", () => ({
  loadViewerContext: loadViewerContextMock,
  resolveAccess: resolveAccessMock,
  knowledgeCollectionEntity: (row: Record<string, unknown>) => row,
}));

function makeRequest(body?: unknown): Request {
  return {
    json: () => Promise.resolve(body),
  } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  dbSelectMock.mockReturnValue({ from: dbSelectFromMock });
  dbSelectFromMock.mockResolvedValue([]);
  dbInsertMock.mockReturnValue({ values: dbInsertValuesMock });
  dbInsertValuesMock.mockReturnValue({ returning: dbInsertReturningMock });
  loadViewerContextMock.mockResolvedValue({
    userId: "u1",
    userTeamIds: [],
    isAdmin: false,
    grantsByEntityId: {},
  });
  resolveAccessMock.mockReturnValue(true);
});

describe("GET /api/knowledge/collections", () => {
  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 200 with visible collections for an authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectFromMock.mockResolvedValueOnce([{ id: "col-1", name: "Docs" }]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.collections).toHaveLength(1);
  });

  it("filters out collections the viewer cannot see", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectFromMock.mockResolvedValueOnce([
      { id: "col-visible", name: "Open" },
      { id: "col-hidden", name: "Secret" },
    ]);
    resolveAccessMock.mockImplementation(
      (entity: { id?: string }) => entity.id === "col-visible",
    );
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body.collections).toHaveLength(1);
    expect(body.collections[0].id).toBe("col-visible");
  });

  it("checks access with the 'view' capability", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectFromMock.mockResolvedValueOnce([{ id: "col-1", name: "Docs" }]);
    const { GET } = await import("./route");
    await GET();
    expect(resolveAccessMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "u1" }),
      "view",
    );
  });

  it("loads the viewer context for knowledge_collection grants", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { GET } = await import("./route");
    await GET();
    expect(loadViewerContextMock).toHaveBeenCalledWith(
      "knowledge_collection",
      "u1",
    );
  });

  it("passes per-entity grants to the resolver", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbSelectFromMock.mockResolvedValueOnce([{ id: "col-1", name: "Docs" }]);
    loadViewerContextMock.mockResolvedValueOnce({
      userId: "u1",
      userTeamIds: [],
      isAdmin: false,
      grantsByEntityId: { "col-1": [{ capability: "view" }] },
    });
    const { GET } = await import("./route");
    await GET();
    expect(resolveAccessMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ grants: [{ capability: "view" }] }),
      "view",
    );
  });

  it("never calls db.select when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(dbSelectMock).not.toHaveBeenCalled();
    expect(loadViewerContextMock).not.toHaveBeenCalled();
  });

  it("returns empty collections array when DB returns nothing", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.collections).toHaveLength(0);
  });

  it("401 body has error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("returns a Response instance", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res).toBeInstanceOf(Response);
  });
});

describe("POST /api/knowledge/collections", () => {
  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "Test" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "Test" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unknown visibility value", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ name: "Docs", visibility: "banana" }),
    );
    expect(res.status).toBe(400);
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("creates collection and returns 200 for admin", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    dbInsertReturningMock.mockResolvedValueOnce([
      { id: "col-new", name: "Product Docs", visibility: "company" },
    ]);
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ name: "Product Docs", visibility: "company" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.collection.name).toBe("Product Docs");
  });

  it.each(["private", "shared", "team", "company"])(
    "accepts modern visibility %s",
    async (visibility) => {
      getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
      const { POST } = await import("./route");
      const res = await POST(makeRequest({ name: "Docs", visibility }));
      expect(res.status).toBe(200);
      expect(dbInsertValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({ visibility }),
      );
    },
  );

  it("normalizes legacy 'org' to 'company' on write", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "Docs", visibility: "org" }));
    expect(res.status).toBe(200);
    expect(dbInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "company" }),
    );
  });

  it("defaults visibility to company when omitted", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "Docs" }));
    expect(dbInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "company" }),
    );
  });

  it("stores teamIds[] and keeps legacy teamId synced to teamIds[0]", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const { POST } = await import("./route");
    await POST(
      makeRequest({
        name: "Docs",
        visibility: "team",
        teamIds: ["team-1", "team-2"],
      }),
    );
    expect(dbInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        teamIds: ["team-1", "team-2"],
        teamId: "team-1",
      }),
    );
  });

  it("promotes a legacy single teamId into teamIds[]", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const { POST } = await import("./route");
    await POST(
      makeRequest({ name: "Docs", visibility: "team", teamId: "team-9" }),
    );
    expect(dbInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ teamIds: ["team-9"], teamId: "team-9" }),
    );
  });

  it("stores null teams when none provided", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "Docs" }));
    expect(dbInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ teamIds: null, teamId: null }),
    );
  });

  it("never calls db.insert when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "Test" }));
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("never calls db.insert when non-admin user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "Test" }));
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("returns 400 when name is empty string", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "" }));
    expect(res.status).toBe(400);
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("db.insert called exactly once on valid admin request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "X Docs" }));
    expect(dbInsertMock).toHaveBeenCalledTimes(1);
  });

  it("401 / 403 bodies have error field", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res401 = await POST(makeRequest({ name: "Test" }));
    expect(await res401.json()).toHaveProperty("error");

    getSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    const res403 = await POST(makeRequest({ name: "Test" }));
    expect(await res403.json()).toHaveProperty("error");
  });

  it("200 body has collection property on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ name: "Y Docs" }));
    const body = await res.json();
    expect(body).toHaveProperty("collection");
  });

  it("getSession called exactly once per POST", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    await POST(makeRequest({ name: "Test" }));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});
