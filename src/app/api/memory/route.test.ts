import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getTeamMock: vi.fn(),
  resolvePolicyMock: vi.fn(),
  getPreferencesMock: vi.fn(),
  listActiveMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: h.getSessionMock }));
vi.mock("lib/admin/teams", () => ({ getUserPrimaryTeamId: h.getTeamMock }));
vi.mock("lib/memory/policy", () => ({
  resolveMemoryPolicy: h.resolvePolicyMock,
}));
vi.mock("lib/memory/store", () => ({ listActiveMemories: h.listActiveMock }));
vi.mock("lib/db/repository", () => ({
  userRepository: { getPreferences: h.getPreferencesMock },
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  h.getSessionMock.mockResolvedValue({ user: { id: "u1" } });
  h.getTeamMock.mockResolvedValue("team-1");
  h.resolvePolicyMock.mockResolvedValue({
    enabled: true,
    implicitExtraction: false,
  });
  h.getPreferencesMock.mockResolvedValue(null);
  h.listActiveMock.mockResolvedValue([]);
});

describe("GET /api/memory", () => {
  it("returns 401 when unauthenticated", async () => {
    h.getSessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(h.listActiveMock).not.toHaveBeenCalled();
  });

  it("returns policy, mode (default on) and memories without embeddings", async () => {
    h.listActiveMock.mockResolvedValue([
      {
        id: "m1",
        kind: "preference",
        content: "Prefers Spanish",
        confidence: 1,
        embedding: [0.1],
        createdAt: new Date("2026-06-01"),
        lastUsedAt: new Date("2026-06-09"),
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.policy).toEqual({ enabled: true, implicitExtraction: false });
    expect(json.mode).toBe("on");
    expect(json.memories).toHaveLength(1);
    expect(json.memories[0].content).toBe("Prefers Spanish");
    expect(json.memories[0]).not.toHaveProperty("embedding");
    expect(h.resolvePolicyMock).toHaveBeenCalledWith("team-1");
  });

  it("surfaces the user's stored memory mode", async () => {
    h.getPreferencesMock.mockResolvedValue({ memoryMode: "paused" });
    const res = await GET();
    const json = await res.json();
    expect(json.mode).toBe("paused");
  });
});
