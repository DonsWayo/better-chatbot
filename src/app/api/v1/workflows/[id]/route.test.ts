import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authenticateApiKeyMock,
  hasScopeMock,
  checkAccessMock,
  selectByIdMock,
} = vi.hoisted(() => ({
  authenticateApiKeyMock: vi.fn(),
  hasScopeMock: vi.fn(),
  checkAccessMock: vi.fn(),
  selectByIdMock: vi.fn(),
}));

vi.mock("lib/auth/api-key-auth", () => ({
  authenticateApiKey: authenticateApiKeyMock,
  hasScope: hasScopeMock,
}));
vi.mock("lib/db/repository", () => ({
  workflowRepository: {
    checkAccess: checkAccessMock,
    selectById: selectByIdMock,
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

const params = Promise.resolve({ id: "wf1" });

function getReq(auth = "Bearer ck_live_x"): Request {
  return new Request("https://x/api/v1/workflows/wf1", {
    headers: { authorization: auth },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hasScopeMock.mockReturnValue(true);
  authenticateApiKeyMock.mockResolvedValue(PRINCIPAL);
  checkAccessMock.mockResolvedValue(true);
});

describe("GET /api/v1/workflows/[id]", () => {
  it("401 without a valid key", async () => {
    authenticateApiKeyMock.mockResolvedValueOnce(null);
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(401);
  });

  it("403 when the key lacks workflows:read scope", async () => {
    hasScopeMock.mockReturnValue(false);
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(403);
  });

  it("404 when checkAccess returns false (no leak of existence)", async () => {
    checkAccessMock.mockResolvedValueOnce(false);
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("not_found");
    // selectById must NOT be called — we don't leak workflow existence
    expect(selectByIdMock).not.toHaveBeenCalled();
  });

  it("404 when access passes but selectById returns null (race/deleted)", async () => {
    checkAccessMock.mockResolvedValueOnce(true);
    selectByIdMock.mockResolvedValueOnce(null);
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(404);
  });

  it("200 with full workflow fields on the happy path", async () => {
    const now = new Date();
    checkAccessMock.mockResolvedValueOnce(true);
    selectByIdMock.mockResolvedValueOnce({
      id: "wf1",
      name: "My Flow",
      description: "A description",
      visibility: "shared",
      isPublished: true,
      userId: "u1",
      createdAt: now,
      updatedAt: now,
    });
    const res = await GET(getReq(), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      id: "wf1",
      name: "My Flow",
      description: "A description",
      visibility: "shared",
      isPublished: true,
      userId: "u1",
    });
    // checkAccess called with correct args
    expect(checkAccessMock).toHaveBeenCalledWith("wf1", "u1", true);
  });

  it("200 with null description when description is absent", async () => {
    const now = new Date();
    selectByIdMock.mockResolvedValueOnce({
      id: "wf1",
      name: "No Desc",
      description: null,
      visibility: "private",
      isPublished: false,
      userId: "u1",
      createdAt: now,
      updatedAt: now,
    });
    const res = await GET(getReq(), { params });
    const json = await res.json();
    expect(json.description).toBeNull();
  });
});
