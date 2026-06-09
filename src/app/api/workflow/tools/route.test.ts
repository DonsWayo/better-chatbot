import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, selectExecuteAbilityMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  selectExecuteAbilityMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  workflowRepository: {
    selectExecuteAbility: selectExecuteAbilityMock,
  },
}));

describe("GET /api/workflow/tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 status when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns empty array when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("never queries repository when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(selectExecuteAbilityMock).not.toHaveBeenCalled();
  });

  it("returns 200 status for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectExecuteAbilityMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns workflows for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const WFS = [{ id: "wf-1", name: "Tool A" }];
    selectExecuteAbilityMock.mockResolvedValueOnce(WFS);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("wf-1");
  });

  it("returns empty array when user has no workflows", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectExecuteAbilityMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("passes correct user id to repository", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-xyz-123" } });
    selectExecuteAbilityMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET();
    expect(selectExecuteAbilityMock).toHaveBeenCalledWith("user-xyz-123");
  });

  it("returns multiple workflows for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const WFS = [
      { id: "wf-1", name: "Tool A" },
      { id: "wf-2", name: "Tool B" },
      { id: "wf-3", name: "Tool C" },
    ];
    selectExecuteAbilityMock.mockResolvedValueOnce(WFS);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(3);
    expect(body.map((w: { id: string }) => w.id)).toEqual(["wf-1", "wf-2", "wf-3"]);
  });

  it("preserves workflow fields in response", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const workflow = { id: "wf-1", name: "Data Processor", description: "Processes data" };
    selectExecuteAbilityMock.mockResolvedValueOnce([workflow]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body[0].id).toBe("wf-1");
    expect(body[0].name).toBe("Data Processor");
    expect(body[0].description).toBe("Processes data");
  });

  it("selectExecuteAbility called exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectExecuteAbilityMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET();
    expect(selectExecuteAbilityMock).toHaveBeenCalledTimes(1);
  });

  it("response body is always an array", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectExecuteAbilityMock.mockResolvedValueOnce([{ id: "wf-x" }]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("response body is an array even when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

describe("GET /api/workflow/tools — additional", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("selectExecuteAbility called with correct userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "the-user-id" } });
    selectExecuteAbilityMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    await GET();
    expect(selectExecuteAbilityMock).toHaveBeenCalledWith("the-user-id");
  });

  it("response status is 200 regardless of session state", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("GET /api/workflow/tools — response shape", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns a Response instance for unauthenticated request", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res).toBeInstanceOf(Response);
  });

  it("returns a Response instance for authenticated request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectExecuteAbilityMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res).toBeInstanceOf(Response);
  });

  it("200 body is an object (not null)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectExecuteAbilityMock.mockResolvedValueOnce([]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).not.toBeNull();
    expect(typeof body).toBe("object");
  });

  it("selectExecuteAbility not called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(selectExecuteAbilityMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/workflow/tools — call count invariants", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("getSession called exactly once per GET", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("GET returns 401 Response when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(401);
  });

  it("selectExecuteAbility not called when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    await GET();
    expect(selectExecuteAbilityMock).not.toHaveBeenCalled();
  });

  it("selectExecuteAbility called exactly once for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectExecuteAbilityMock.mockResolvedValueOnce({ canExecute: true });
    const { GET } = await import("./route");
    await GET();
    expect(selectExecuteAbilityMock).toHaveBeenCalledTimes(1);
  });
});
