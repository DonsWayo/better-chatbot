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

  it("never calls signUpEmail when validation fails", async () => {
    const { signUpAction } = await import("./actions");
    await signUpAction({ email: "a@b.com", name: "Alice", password: "" });
    expect(signUpEmailMock).not.toHaveBeenCalled();
  });

  it("returns success:true with message on success", async () => {
    signUpEmailMock.mockResolvedValueOnce({ user: { id: "u2", email: "b@c.com", name: "Bob" } });
    const { signUpAction } = await import("./actions");
    const result = await signUpAction({ email: "b@c.com", name: "Bob", password: "Pass123!" });
    expect(result.success).toBe(true);
    expect(result.message).toBeDefined();
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("returns generic failure message when auth throws non-Error", async () => {
    signUpEmailMock.mockRejectedValueOnce("some string error");
    const { signUpAction } = await import("./actions");
    const result = await signUpAction({ email: "x@y.com", name: "X", password: "Pass123!" });
    expect(result.success).toBe(false);
    expect(typeof result.message).toBe("string");
  });
});

describe("existsByEmailAction — edge cases", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("passes exact email string to existsByEmail", async () => {
    existsByEmailMock.mockResolvedValueOnce(false);
    const { existsByEmailAction } = await import("./actions");
    await existsByEmailAction("UPPER@EXAMPLE.COM");
    expect(existsByEmailMock).toHaveBeenCalledWith("UPPER@EXAMPLE.COM");
  });

  it("calls existsByEmail exactly once", async () => {
    existsByEmailMock.mockResolvedValueOnce(true);
    const { existsByEmailAction } = await import("./actions");
    await existsByEmailAction("a@b.com");
    expect(existsByEmailMock).toHaveBeenCalledTimes(1);
  });

  it("result is a primitive boolean, not an object", async () => {
    existsByEmailMock.mockResolvedValueOnce(true);
    const { existsByEmailAction } = await import("./actions");
    const result = await existsByEmailAction("a@b.com");
    expect(typeof result).toBe("boolean");
  });
});

describe("signUpAction — call args", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("signUpEmail called with email, name, and password from input", async () => {
    signUpEmailMock.mockResolvedValueOnce({ user: { id: "u1", email: "a@b.com", name: "Alice" } });
    const { signUpAction } = await import("./actions");
    await signUpAction({ email: "a@b.com", name: "Alice", password: "Secret123" });
    expect(signUpEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ email: "a@b.com", name: "Alice", password: "Secret123" }),
      }),
    );
  });

  it("signUpEmail called exactly once on valid input", async () => {
    signUpEmailMock.mockResolvedValueOnce({ user: { id: "u1", email: "a@b.com", name: "Alice" } });
    const { signUpAction } = await import("./actions");
    await signUpAction({ email: "a@b.com", name: "Alice", password: "Secret123" });
    expect(signUpEmailMock).toHaveBeenCalledTimes(1);
  });

  it("success result has user.email matching input email", async () => {
    signUpEmailMock.mockResolvedValueOnce({ user: { id: "u1", email: "match@example.com", name: "Test" } });
    const { signUpAction } = await import("./actions");
    const result = await signUpAction({ email: "match@example.com", name: "Test", password: "Pass123!" });
    expect(result.success).toBe(true);
    expect(result.user?.email).toBe("match@example.com");
  });
});

describe("signUpAction — additional edge cases", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("success result user has id field", async () => {
    signUpEmailMock.mockResolvedValueOnce({ user: { id: "new-id-abc", email: "a@b.com", name: "Alice" } });
    const { signUpAction } = await import("./actions");
    const result = await signUpAction({ email: "a@b.com", name: "Alice", password: "Pass123!" });
    expect(result.success).toBe(true);
    expect(result.user?.id).toBe("new-id-abc");
  });

  it("failure result has success:false always", async () => {
    signUpEmailMock.mockRejectedValueOnce(new Error("conflict"));
    const { signUpAction } = await import("./actions");
    const result = await signUpAction({ email: "dup@b.com", name: "X", password: "Pass123!" });
    expect(result.success).toBe(false);
  });

  it("signUpEmail not called when password is empty", async () => {
    const { signUpAction } = await import("./actions");
    await signUpAction({ email: "a@b.com", name: "Alice", password: "" });
    expect(signUpEmailMock).not.toHaveBeenCalled();
  });
});
