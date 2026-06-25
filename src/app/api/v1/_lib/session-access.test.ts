/**
 * Unit tests for loadOwnedSession — the IDOR guard that prevents principals
 * from reading sessions belonging to other users.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
}));

vi.mock("lib/agent-platform/sessions", () => ({
  getSession: getSessionMock,
}));

import { loadOwnedSession } from "./session-access";

const PRINCIPAL = {
  userId: "u1",
  teamId: "t1",
  role: "user",
  keyId: "k1",
  scopes: ["*"],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadOwnedSession", () => {
  it("returns ok:true with the session when the principal owns it", async () => {
    const session = { id: "s1", userId: "u1", status: "completed" };
    getSessionMock.mockResolvedValueOnce(session);
    const result = await loadOwnedSession(PRINCIPAL, "s1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session).toBe(session);
    }
  });

  it("returns ok:false with reason not_found for a missing session", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    const result = await loadOwnedSession(PRINCIPAL, "ghost");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not_found");
    }
  });

  it("returns ok:false (not_found) for a session owned by another user — IDOR guard", async () => {
    getSessionMock.mockResolvedValueOnce({ id: "s1", userId: "ATTACKER" });
    const result = await loadOwnedSession(PRINCIPAL, "s1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Must be the same response as missing — no existence leak
      expect(result.reason).toBe("not_found");
    }
  });

  it("calls getSession with the provided session id", async () => {
    getSessionMock.mockResolvedValueOnce({ id: "s99", userId: "u1" });
    await loadOwnedSession(PRINCIPAL, "s99");
    expect(getSessionMock).toHaveBeenCalledWith("s99");
  });
});
