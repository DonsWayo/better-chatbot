import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { getSessionMock, workflowRepositoryMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  workflowRepositoryMock: { selectExecuteAbility: vi.fn() },
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  workflowRepository: workflowRepositoryMock,
}));

import { GET } from "./route";

const WORKFLOWS = [
  { id: "wf-1", name: "Workflow A", userId: "user-1" },
  { id: "wf-2", name: "Workflow B", userId: "user-1" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/workflow/tools", () => {
  it("returns empty array when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns workflows when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.selectExecuteAbility.mockResolvedValue(WORKFLOWS);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe("wf-1");
  });

  it("calls selectExecuteAbility with user id from session", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-42" } });
    workflowRepositoryMock.selectExecuteAbility.mockResolvedValue([]);
    await GET();
    expect(workflowRepositoryMock.selectExecuteAbility).toHaveBeenCalledWith(
      "user-42",
    );
  });

  it("returns empty array when no workflows exist", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.selectExecuteAbility.mockResolvedValue([]);
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns JSON with workflows matching expected structure", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.selectExecuteAbility.mockResolvedValue(WORKFLOWS);
    const res = await GET();
    const body = await res.json() as { id: string; name: string }[];
    expect(body[0]).toHaveProperty("id");
    expect(body[0]).toHaveProperty("name");
  });

  it("response content-type is application/json", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("returns 200 status even when no session (empty array)", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns multiple workflows with correct names", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.selectExecuteAbility.mockResolvedValue(WORKFLOWS);
    const res = await GET();
    const body = await res.json() as { id: string; name: string }[];
    const names = body.map((w) => w.name);
    expect(names).toContain("Workflow A");
    expect(names).toContain("Workflow B");
  });

  it("does not call repository when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    await GET();
    expect(workflowRepositoryMock.selectExecuteAbility).not.toHaveBeenCalled();
  });

  it("calls repository exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.selectExecuteAbility.mockResolvedValue([]);
    await GET();
    expect(workflowRepositoryMock.selectExecuteAbility).toHaveBeenCalledTimes(1);
  });

  it("workflow items contain userId field", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    workflowRepositoryMock.selectExecuteAbility.mockResolvedValue(WORKFLOWS);
    const res = await GET();
    const body = await res.json() as { userId: string }[];
    expect(body[0]).toHaveProperty("userId");
  });
});
