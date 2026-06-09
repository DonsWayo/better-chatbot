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
  beforeEach(() => { vi.clearAllMocks(); });

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
});
