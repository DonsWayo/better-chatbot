import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, getSessionWithStepsMock, cancelSessionMock } =
  vi.hoisted(() => ({
    getSessionMock: vi.fn(),
    getSessionWithStepsMock: vi.fn(),
    cancelSessionMock: vi.fn(),
  }));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/agent-platform/sessions", () => ({
  getSessionWithSteps: getSessionWithStepsMock,
  cancelSession: cancelSessionMock,
}));

const RUN = {
  session: { id: "run-1", userId: "owner-1", status: "running" },
  steps: [],
};

describe("cancelRunAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // cancelRunAction now returns a structured ActionResult instead of throwing
  // (prod Next.js masks thrown Server-Action errors into a 500), so the gate
  // reason survives to the Runs rail toast / optimistic rollback.
  it("returns a structured Unauthorized failure when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { cancelRunAction } = await import("./actions");
    await expect(cancelRunAction("run-1")).resolves.toEqual({
      success: false,
      error: "Unauthorized",
    });
    expect(cancelSessionMock).not.toHaveBeenCalled();
  });

  it("returns a structured Not Found failure when the run does not exist", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    getSessionWithStepsMock.mockResolvedValueOnce(null);
    const { cancelRunAction } = await import("./actions");
    await expect(cancelRunAction("missing")).resolves.toEqual({
      success: false,
      error: "Not Found",
    });
    expect(cancelSessionMock).not.toHaveBeenCalled();
  });

  it("returns a structured Forbidden failure for a non-owner non-admin and never cancels", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "intruder", role: "user" },
    });
    getSessionWithStepsMock.mockResolvedValueOnce(RUN);
    const { cancelRunAction } = await import("./actions");
    await expect(cancelRunAction("run-1")).resolves.toEqual({
      success: false,
      error: "Forbidden",
    });
    expect(cancelSessionMock).not.toHaveBeenCalled();
  });

  it("cancels for the owner", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "owner-1", role: "user" },
    });
    getSessionWithStepsMock.mockResolvedValueOnce(RUN);
    cancelSessionMock.mockResolvedValueOnce({
      ...RUN.session,
      status: "cancelled",
    });
    const { cancelRunAction } = await import("./actions");
    await expect(cancelRunAction("run-1")).resolves.toEqual({
      success: true,
      data: undefined,
    });
    expect(cancelSessionMock).toHaveBeenCalledWith("run-1");
  });

  it("cancels for an admin who is not the owner", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "admin-1", role: "admin" },
    });
    getSessionWithStepsMock.mockResolvedValueOnce(RUN);
    cancelSessionMock.mockResolvedValueOnce({
      ...RUN.session,
      status: "cancelled",
    });
    const { cancelRunAction } = await import("./actions");
    await expect(cancelRunAction("run-1")).resolves.toEqual({
      success: true,
      data: undefined,
    });
    expect(cancelSessionMock).toHaveBeenCalledWith("run-1");
  });

  it("calls cancelSession exactly once on success", async () => {
    getSessionMock.mockResolvedValue({
      user: { id: "owner-1", role: "user" },
    });
    getSessionWithStepsMock.mockResolvedValueOnce(RUN);
    cancelSessionMock.mockResolvedValueOnce({
      ...RUN.session,
      status: "cancelled",
    });
    const { cancelRunAction } = await import("./actions");
    await cancelRunAction("run-1");
    expect(cancelSessionMock).toHaveBeenCalledTimes(1);
  });
});
