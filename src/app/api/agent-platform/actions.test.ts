import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionMock,
  getUserPrimaryTeamIdMock,
  canDecideMock,
  decideApprovalMock,
  getApprovalWithSessionMock,
  resolveAutonomyCapMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getUserPrimaryTeamIdMock: vi.fn(),
  canDecideMock: vi.fn(),
  decideApprovalMock: vi.fn(),
  getApprovalWithSessionMock: vi.fn(),
  resolveAutonomyCapMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/admin/teams", () => ({
  getUserPrimaryTeamId: getUserPrimaryTeamIdMock,
}));
vi.mock("lib/agent-platform/approvals", () => ({
  canDecide: canDecideMock,
  decideApproval: decideApprovalMock,
  getApprovalWithSession: getApprovalWithSessionMock,
}));
vi.mock("lib/agent-platform/autonomy", () => ({
  resolveAutonomyCap: resolveAutonomyCapMock,
}));

const USER = { user: { id: "u-1", role: "user" } };
const FOUND = {
  request: { id: "ap-1", requestedRole: "editor" },
  session: { userId: "owner-1", teamId: "team-1" },
};
const DECISION = { id: "ap-1", status: "approved" };

// approve/reject now return a structured ActionResult instead of throwing
// (prod Next.js masks thrown Server-Action errors into a 500), so the gate
// reasons survive to the decision buttons' toast.

describe("approveRequestAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApprovalWithSessionMock.mockResolvedValue(FOUND);
    canDecideMock.mockResolvedValue(true);
    decideApprovalMock.mockResolvedValue(DECISION);
  });

  it("returns a structured Unauthorized failure when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { approveRequestAction } = await import("./actions");
    await expect(approveRequestAction("ap-1")).resolves.toEqual({
      success: false,
      error: "Unauthorized",
    });
    expect(decideApprovalMock).not.toHaveBeenCalled();
  });

  it("returns a structured not-found failure when the request is missing", async () => {
    getSessionMock.mockResolvedValue(USER);
    getApprovalWithSessionMock.mockResolvedValueOnce(null);
    const { approveRequestAction } = await import("./actions");
    await expect(approveRequestAction("missing")).resolves.toEqual({
      success: false,
      error: "Approval request not found",
    });
    expect(decideApprovalMock).not.toHaveBeenCalled();
  });

  it("returns a structured Forbidden failure when the caller cannot decide", async () => {
    getSessionMock.mockResolvedValue(USER);
    canDecideMock.mockResolvedValueOnce(false);
    const { approveRequestAction } = await import("./actions");
    await expect(approveRequestAction("ap-1")).resolves.toEqual({
      success: false,
      error: "Forbidden",
    });
    expect(decideApprovalMock).not.toHaveBeenCalled();
  });

  it("approves for a decider and returns the decision", async () => {
    getSessionMock.mockResolvedValue(USER);
    const { approveRequestAction } = await import("./actions");
    const result = await approveRequestAction("ap-1", "looks good");
    expect(result).toEqual({ success: true, data: DECISION });
    expect(decideApprovalMock).toHaveBeenCalledWith("ap-1", {
      decidedBy: "u-1",
      approve: true,
      reason: "looks good",
    });
  });

  it("surfaces an Already decided lib error as a structured failure", async () => {
    getSessionMock.mockResolvedValue(USER);
    decideApprovalMock.mockRejectedValueOnce(new Error("Already decided"));
    const { approveRequestAction } = await import("./actions");
    await expect(approveRequestAction("ap-1")).resolves.toEqual({
      success: false,
      error: "Already decided",
    });
  });
});

describe("rejectRequestAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApprovalWithSessionMock.mockResolvedValue(FOUND);
    canDecideMock.mockResolvedValue(true);
    decideApprovalMock.mockResolvedValue({ ...DECISION, status: "rejected" });
  });

  it("returns a structured Unauthorized failure when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { rejectRequestAction } = await import("./actions");
    await expect(rejectRequestAction("ap-1", "nope")).resolves.toEqual({
      success: false,
      error: "Unauthorized",
    });
    expect(decideApprovalMock).not.toHaveBeenCalled();
  });

  it("returns a structured Forbidden failure when the caller cannot decide", async () => {
    getSessionMock.mockResolvedValue(USER);
    canDecideMock.mockResolvedValueOnce(false);
    const { rejectRequestAction } = await import("./actions");
    await expect(rejectRequestAction("ap-1", "nope")).resolves.toEqual({
      success: false,
      error: "Forbidden",
    });
    expect(decideApprovalMock).not.toHaveBeenCalled();
  });

  it("rejects with the supplied reason and returns the decision", async () => {
    getSessionMock.mockResolvedValue(USER);
    const { rejectRequestAction } = await import("./actions");
    const result = await rejectRequestAction("ap-1", "missing context");
    expect(result.success).toBe(true);
    expect(decideApprovalMock).toHaveBeenCalledWith("ap-1", {
      decidedBy: "u-1",
      approve: false,
      reason: "missing context",
    });
  });
});
