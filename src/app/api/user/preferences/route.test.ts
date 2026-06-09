import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, getPreferencesMock, updatePreferencesMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getPreferencesMock: vi.fn(),
  updatePreferencesMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  userRepository: {
    getPreferences: getPreferencesMock,
    updatePreferences: updatePreferencesMock,
  },
}));
vi.mock("app-types/user", () => ({
  UserPreferencesZodSchema: { parse: (b: unknown) => b },
}));

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

describe("GET /api/user/preferences", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns empty object when no preferences stored", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getPreferencesMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });

  it("returns stored preferences", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const PREFS = { theme: "dark", language: "en" };
    getPreferencesMock.mockResolvedValueOnce(PREFS);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.theme).toBe("dark");
  });
});

describe("PUT /api/user/preferences", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PUT } = await import("./route");
    const res = await PUT(makeRequest({ theme: "dark" }));
    expect(res.status).toBe(401);
  });

  it("updates preferences and returns updated values", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const PREFS = { theme: "light" };
    updatePreferencesMock.mockResolvedValueOnce({ preferences: PREFS });
    const { PUT } = await import("./route");
    const res = await PUT(makeRequest(PREFS));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.preferences.theme).toBe("light");
  });

  it("never calls updatePreferences when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { PUT } = await import("./route");
    await PUT(makeRequest({ theme: "dark" }));
    expect(updatePreferencesMock).not.toHaveBeenCalled();
  });

  it("passes userId to updatePreferences", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-xyz" } });
    updatePreferencesMock.mockResolvedValueOnce({ preferences: {} });
    const { PUT } = await import("./route");
    await PUT(makeRequest({ theme: "dark" }));
    expect(updatePreferencesMock).toHaveBeenCalledWith(
      "user-xyz",
      expect.anything(),
    );
  });
});

describe("GET /api/user/preferences — guard chain", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("never calls getPreferences when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(getPreferencesMock).not.toHaveBeenCalled();
  });

  it("passes userId to getPreferences", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-abc" } });
    getPreferencesMock.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    await GET();
    expect(getPreferencesMock).toHaveBeenCalledWith("user-abc");
  });
});
