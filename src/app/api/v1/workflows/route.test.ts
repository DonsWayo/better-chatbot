import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateApiKeyMock, hasScopeMock, selectAllMock } = vi.hoisted(
  () => ({
    authenticateApiKeyMock: vi.fn(),
    hasScopeMock: vi.fn(),
    selectAllMock: vi.fn(),
  }),
);

vi.mock("lib/auth/api-key-auth", () => ({
  authenticateApiKey: authenticateApiKeyMock,
  hasScope: hasScopeMock,
}));
vi.mock("lib/db/repository", () => ({
  workflowRepository: {
    selectAll: selectAllMock,
  },
}));

import { GET } from "./route";

const PRINCIPAL = {
  userId: "u1",
  teamId: "t1",
  role: "editor",
  keyId: "k1",
  scopes: ["*"],
};

function getReq(auth = "Bearer ck_live_x"): Request {
  return new Request("https://x/api/v1/workflows", {
    headers: { authorization: auth },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hasScopeMock.mockReturnValue(true);
  authenticateApiKeyMock.mockResolvedValue(PRINCIPAL);
});

describe("GET /api/v1/workflows", () => {
  it("401 when Authorization header is absent", async () => {
    authenticateApiKeyMock.mockResolvedValueOnce(null);
    const req = new Request("https://x/api/v1/workflows");
    const res = await GET(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("unauthorized");
  });

  it("401 for a malformed Bearer token (no token value)", async () => {
    authenticateApiKeyMock.mockResolvedValueOnce(null);
    const res = await GET(getReq("Bearer "));
    expect(res.status).toBe(401);
  });

  it("401 for an invalid/revoked API key", async () => {
    authenticateApiKeyMock.mockResolvedValueOnce(null);
    const res = await GET(getReq("Bearer ck_live_invalid"));
    expect(res.status).toBe(401);
  });

  it("403 when the key lacks workflows:read scope", async () => {
    hasScopeMock.mockReturnValue(false);
    const res = await GET(getReq());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe("forbidden");
    expect(json.error.message).toContain("workflows:read");
  });

  it("200 with an empty array when no workflows exist", async () => {
    selectAllMock.mockResolvedValueOnce([]);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.workflows).toEqual([]);
  });

  it("200 with mapped workflow fields for the principal's user", async () => {
    const now = new Date();
    selectAllMock.mockResolvedValueOnce([
      {
        id: "wf1",
        name: "My Workflow",
        description: "desc",
        visibility: "private",
        isPublished: false,
        userId: "u1",
        updatedAt: now,
      },
    ]);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.workflows).toHaveLength(1);
    expect(json.workflows[0]).toMatchObject({
      id: "wf1",
      name: "My Workflow",
      visibility: "private",
      isPublished: false,
      userId: "u1",
    });
    // Internal fields not exposed
    expect(selectAllMock).toHaveBeenCalledWith("u1");
  });

  it("200 with null description when description is absent", async () => {
    const now = new Date();
    selectAllMock.mockResolvedValueOnce([
      {
        id: "wf2",
        name: "No Desc",
        description: null,
        visibility: "team",
        isPublished: true,
        userId: "u1",
        updatedAt: now,
      },
    ]);
    const res = await GET(getReq());
    const json = await res.json();
    expect(json.workflows[0].description).toBeNull();
  });
});
