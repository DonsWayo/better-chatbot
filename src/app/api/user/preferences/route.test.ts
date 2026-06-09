import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getSessionMock, userRepositoryMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  userRepositoryMock: {
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
  },
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({ userRepository: userRepositoryMock }));

import { GET, PUT } from "./route";

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/user/preferences", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const PREFERENCES = { displayName: "Alice", profession: "Engineer" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/user/preferences", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 401 when session has no user id", async () => {
    getSessionMock.mockResolvedValue({ user: {} });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns preferences when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    userRepositoryMock.getPreferences.mockResolvedValue(PREFERENCES);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.displayName).toBe("Alice");
  });

  it("calls getPreferences with user id from session", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-42" } });
    userRepositoryMock.getPreferences.mockResolvedValue(PREFERENCES);
    await GET();
    expect(userRepositoryMock.getPreferences).toHaveBeenCalledWith("user-42");
  });

  it("returns empty object when preferences not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    userRepositoryMock.getPreferences.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });

  it("returns 500 on unexpected error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    userRepositoryMock.getPreferences.mockRejectedValue(new Error("DB fail"));
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("DB fail");
  });
});

describe("PUT /api/user/preferences", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await PUT(makeRequest(PREFERENCES));
    expect(res.status).toBe(401);
  });

  it("returns 401 when session has no user id", async () => {
    getSessionMock.mockResolvedValue({ user: {} });
    const res = await PUT(makeRequest(PREFERENCES));
    expect(res.status).toBe(401);
  });

  it("updates and returns preferences when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    userRepositoryMock.updatePreferences.mockResolvedValue({
      preferences: PREFERENCES,
    });
    const res = await PUT(makeRequest(PREFERENCES));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.preferences.displayName).toBe("Alice");
  });

  it("calls updatePreferences with userId from session", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-session" } });
    userRepositoryMock.updatePreferences.mockResolvedValue({
      preferences: PREFERENCES,
    });
    await PUT(makeRequest({ displayName: "Bob" }));
    expect(userRepositoryMock.updatePreferences).toHaveBeenCalledWith(
      "user-session",
      expect.objectContaining({ displayName: "Bob" }),
    );
  });

  it("accepts partial preferences (all fields optional)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    userRepositoryMock.updatePreferences.mockResolvedValue({
      preferences: { displayName: "Bob" },
    });
    const res = await PUT(makeRequest({ displayName: "Bob" }));
    expect(res.status).toBe(200);
  });

  it("returns 500 on unexpected error", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    userRepositoryMock.updatePreferences.mockRejectedValue(
      new Error("Update failed"),
    );
    const res = await PUT(makeRequest(PREFERENCES));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Update failed");
  });

  it("does not call updatePreferences when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    await PUT(makeRequest(PREFERENCES));
    expect(userRepositoryMock.updatePreferences).not.toHaveBeenCalled();
  });

  it("returns JSON content-type on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    userRepositoryMock.updatePreferences.mockResolvedValue({
      preferences: PREFERENCES,
    });
    const res = await PUT(makeRequest(PREFERENCES));
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });
});

describe("GET /api/user/preferences — extra coverage", () => {
  it("getSession is called exactly once per GET request", async () => {
    getSessionMock.mockResolvedValue(null);
    await GET();
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("does not call getPreferences when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    await GET();
    expect(userRepositoryMock.getPreferences).not.toHaveBeenCalled();
  });
});
