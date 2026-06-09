import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, recordAupAcceptanceMock, redirectMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  recordAupAcceptanceMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("lib/auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/compliance/aup", () => ({ recordAupAcceptance: recordAupAcceptanceMock }));
// Next.js redirect() throws internally — mock must do the same
vi.mock("next/navigation", () => ({
  redirect: redirectMock.mockImplementation((url: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT: ${url}`), { digest: `NEXT_REDIRECT;${url}` });
  }),
}));

describe("acceptAupAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirectMock.mockImplementation((url: string) => {
      throw Object.assign(new Error(`NEXT_REDIRECT: ${url}`), { digest: `NEXT_REDIRECT;${url}` });
    });
  });

  it("redirects to signin when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { acceptAupAction } = await import("./actions");
    await expect(acceptAupAction()).rejects.toThrow(/NEXT_REDIRECT.*signin/);
    expect(redirectMock).toHaveBeenCalledWith("/auth/signin");
    expect(recordAupAcceptanceMock).not.toHaveBeenCalled();
  });

  it("records AUP acceptance and redirects home for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    recordAupAcceptanceMock.mockResolvedValue(undefined);
    const { acceptAupAction } = await import("./actions");
    await expect(acceptAupAction()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(recordAupAcceptanceMock).toHaveBeenCalledWith("u1");
    expect(redirectMock).toHaveBeenCalledWith("/");
  });

  it("passes exact userId to recordAupAcceptance", async () => {
    const userId = "user-xyz-456";
    getSessionMock.mockResolvedValue({ user: { id: userId } });
    recordAupAcceptanceMock.mockResolvedValue(undefined);
    const { acceptAupAction } = await import("./actions");
    await expect(acceptAupAction()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(recordAupAcceptanceMock).toHaveBeenCalledWith(userId);
    expect(recordAupAcceptanceMock).toHaveBeenCalledTimes(1);
  });

  it("redirect to signin is called exactly once when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { acceptAupAction } = await import("./actions");
    await expect(acceptAupAction()).rejects.toThrow();
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });

  it("calls recordAupAcceptance before redirect to home", async () => {
    const callOrder: string[] = [];
    recordAupAcceptanceMock.mockImplementation(async () => { callOrder.push("record"); });
    redirectMock.mockImplementation((url: string) => {
      callOrder.push(`redirect:${url}`);
      throw Object.assign(new Error(`NEXT_REDIRECT: ${url}`), { digest: `NEXT_REDIRECT;${url}` });
    });
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { acceptAupAction } = await import("./actions");
    await expect(acceptAupAction()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(callOrder).toEqual(["record", "redirect:/"]);
  });

  it("propagates error when recordAupAcceptance throws", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    recordAupAcceptanceMock.mockRejectedValue(new Error("DB failure"));
    const { acceptAupAction } = await import("./actions");
    await expect(acceptAupAction()).rejects.toThrow("DB failure");
    expect(redirectMock).not.toHaveBeenCalledWith("/");
  });

  it("redirect destination on success is exactly '/'", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    recordAupAcceptanceMock.mockResolvedValue(undefined);
    const { acceptAupAction } = await import("./actions");
    await expect(acceptAupAction()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirectMock).toHaveBeenCalledWith("/");
    expect(redirectMock).not.toHaveBeenCalledWith("/home");
    expect(redirectMock).not.toHaveBeenCalledWith("/dashboard");
  });

  it("redirect destination on unauthenticated is exactly '/auth/signin'", async () => {
    getSessionMock.mockResolvedValue(null);
    const { acceptAupAction } = await import("./actions");
    await expect(acceptAupAction()).rejects.toThrow();
    expect(redirectMock).toHaveBeenCalledWith("/auth/signin");
  });

  it("getSession is called exactly once per invocation", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    recordAupAcceptanceMock.mockResolvedValue(undefined);
    const { acceptAupAction } = await import("./actions");
    await expect(acceptAupAction()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});
