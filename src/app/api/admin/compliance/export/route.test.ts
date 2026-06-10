import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Small cap/page-size injection so truncation and paging are testable
// without mocking 50k rows.
const TEST_MAX_ROWS = 5;
const TEST_PAGE_SIZE = 2;

const { mockGetSession, mockGetAuditLog } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetAuditLog: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: mockGetSession }));
vi.mock("lib/admin/audit", () => ({
  getAuditLog: mockGetAuditLog,
  COMPLIANCE_EXPORT_MAX_ROWS: 5,
  COMPLIANCE_EXPORT_PAGE_SIZE: 2,
}));

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/compliance/export");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { nextUrl: url } as unknown as NextRequest;
}

function makeRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: "u1",
    userEmail: "user@example.com",
    teamId: "t1",
    actorType: "human",
    agentSessionId: null,
    eventType: "admin_action",
    details: {},
    createdAt: new Date("2026-06-01T12:00:00Z"),
    ...overrides,
  };
}

describe("GET /api/admin/compliance/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuditLog.mockResolvedValue({ rows: [], total: 0 });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockGetAuditLog).not.toHaveBeenCalled();
  });

  it("returns 403 when role is not admin", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "editor" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    expect(mockGetAuditLog).not.toHaveBeenCalled();
  });

  it("responds with text/csv and an attachment Content-Disposition", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(
      makeRequest({ from: "2026-01-01", to: "2026-06-01" }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const disposition = res.headers.get("Content-Disposition") ?? "";
    expect(disposition).toContain("attachment");
    expect(disposition).toContain("asafe-compliance-2026-01-01-2026-06-01.csv");
  });

  it("writes a header row and one line per audit row", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    mockGetAuditLog.mockResolvedValueOnce({
      rows: [makeRow("a1")],
      total: 1,
    });
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    const text = await res.text();
    const lines = text.trim().split("\n");
    expect(lines[0]).toBe(
      "id,created_at,actor_type,agent_session_id,user_id,user_email,team_id,event_type,details",
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("a1");
    expect(lines[1]).toContain("2026-06-01T12:00:00.000Z");
    expect(lines[1]).toContain("human");
  });

  it("escapes values containing quotes, commas and newlines", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    mockGetAuditLog.mockResolvedValueOnce({
      rows: [
        makeRow("a1", {
          userEmail: 'evil",@example.com',
          details: 'line1\nline2,with"quote',
        }),
      ],
      total: 1,
    });
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    const text = await res.text();
    // Quotes doubled and field wrapped in quotes
    expect(text).toContain('"evil"",@example.com"');
    expect(text).toContain('"line1\nline2,with""quote"');
  });

  it("pages through rows using the configured page size", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    mockGetAuditLog
      .mockResolvedValueOnce({ rows: [makeRow("a1"), makeRow("a2")], total: 3 })
      .mockResolvedValueOnce({ rows: [makeRow("a3")], total: 3 });
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    const text = await res.text();
    expect(mockGetAuditLog).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ limit: TEST_PAGE_SIZE, offset: 0 }),
    );
    expect(mockGetAuditLog).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ limit: TEST_PAGE_SIZE, offset: 2 }),
    );
    expect(text).toContain("a3");
    expect(text).not.toContain("# truncated");
  });

  it("caps the export and appends a '# truncated' comment row when over cap", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    mockGetAuditLog
      .mockResolvedValueOnce({ rows: [makeRow("a1"), makeRow("a2")], total: 9 })
      .mockResolvedValueOnce({ rows: [makeRow("a3"), makeRow("a4")], total: 9 })
      .mockResolvedValueOnce({ rows: [makeRow("a5")], total: 9 });
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    const text = await res.text();
    const dataLines = text
      .trim()
      .split("\n")
      .filter((l) => !l.startsWith("#") && !l.startsWith("id,"));
    expect(dataLines).toHaveLength(TEST_MAX_ROWS);
    // Final page request asks only for the remaining row under the cap.
    expect(mockGetAuditLog).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ limit: 1, offset: 4 }),
    );
    expect(text.trimEnd().endsWith("# truncated")).toBe(true);
  });

  it("does not append the truncation row when total is exactly the cap", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    mockGetAuditLog
      .mockResolvedValueOnce({ rows: [makeRow("a1"), makeRow("a2")], total: 5 })
      .mockResolvedValueOnce({ rows: [makeRow("a3"), makeRow("a4")], total: 5 })
      .mockResolvedValueOnce({ rows: [makeRow("a5")], total: 5 });
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    const text = await res.text();
    expect(text).not.toContain("# truncated");
  });

  it("passes audit filters through to getAuditLog", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    await (
      await GET(
        makeRequest({
          actorType: "agent",
          agentSessionId: "as-5",
          eventType: "tool_call",
          userId: "u-9",
          teamId: "t-9",
        }),
      )
    ).text();
    expect(mockGetAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "agent",
        agentSessionId: "as-5",
        eventType: "tool_call",
        userId: "u-9",
        teamId: "t-9",
      }),
    );
  });

  it("returns 400 for invalid actorType", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest({ actorType: "alien" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid from date", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const { GET } = await import("./route");
    const res = await GET(makeRequest({ from: "nope" }));
    expect(res.status).toBe(400);
  });
});
