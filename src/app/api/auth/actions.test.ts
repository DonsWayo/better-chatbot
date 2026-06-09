import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  existsByEmailMock,
  signUpEmailMock,
} = vi.hoisted(() => ({
  existsByEmailMock: vi.fn(),
  signUpEmailMock: vi.fn(),
}));

vi.mock("lib/db/repository", () => ({
  userRepository: { existsByEmail: existsByEmailMock },
}));
vi.mock("@/lib/auth/server", () => ({
  auth: { api: { signUpEmail: signUpEmailMock } },
}));
vi.mock("app-types/user", () => ({
  UserZodSchema: {
    safeParse: (d: any) => ({
      success: d.email && d.name && d.password,
      data: d,
    }),
  },
}));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue({}) }));

describe("existsByEmailAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns true when email exists", async () => {
    existsByEmailMock.mockResolvedValueOnce(true);
    const { existsByEmailAction } = await import("./actions");
    const result = await existsByEmailAction("test@example.com");
    expect(result).toBe(true);
    expect(existsByEmailMock).toHaveBeenCalledWith("test@example.com");
  });

  it("returns false when email does not exist", async () => {
    existsByEmailMock.mockResolvedValueOnce(false);
    const { existsByEmailAction } = await import("./actions");
    const result = await existsByEmailAction("new@example.com");
    expect(result).toBe(false);
  });
});

describe("signUpAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns success:false when data is invalid", async () => {
    const { signUpAction } = await import("./actions");
    // Missing password — safeParse will return success:false
    const result = await signUpAction({ email: "a@b.com", name: "Alice", password: "" });
    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
  });

  it("returns user on successful sign up", async () => {
    signUpEmailMock.mockResolvedValueOnce({ user: { id: "u1", email: "a@b.com", name: "Alice" } });
    const { signUpAction } = await import("./actions");
    const result = await signUpAction({ email: "a@b.com", name: "Alice", password: "Secret123" });
    expect(result.success).toBe(true);
    expect(result.user?.id).toBe("u1");
  });

  it("returns success:false when auth throws", async () => {
    signUpEmailMock.mockRejectedValueOnce(new Error("Email already in use"));
    const { signUpAction } = await import("./actions");
    const result = await signUpAction({ email: "taken@b.com", name: "Bob", password: "Secret123" });
    expect(result.success).toBe(false);
    expect(result.message).toContain("Email already in use");
  });
});
