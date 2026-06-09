import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/server", () => ({
  auth: {
    api: {
      signUpEmail: vi.fn(),
    },
  },
}));

vi.mock("lib/db/repository", () => ({
  userRepository: {
    existsByEmail: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

import { auth } from "@/lib/auth/server";
import { userRepository } from "lib/db/repository";
import { existsByEmailAction, signUpAction } from "./actions";

const mockAuth = vi.mocked(auth);
const mockUserRepo = vi.mocked(userRepository);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("existsByEmailAction", () => {
  it("returns true when email exists", async () => {
    mockUserRepo.existsByEmail.mockResolvedValue(true);
    const result = await existsByEmailAction("user@example.com");
    expect(result).toBe(true);
    expect(mockUserRepo.existsByEmail).toHaveBeenCalledWith("user@example.com");
  });

  it("returns false when email does not exist", async () => {
    mockUserRepo.existsByEmail.mockResolvedValue(false);
    const result = await existsByEmailAction("new@example.com");
    expect(result).toBe(false);
  });
});

describe("signUpAction", () => {
  const validData = {
    email: "test@example.com",
    name: "Test User",
    password: "Password1!",
  };

  it("returns success and user on valid signup", async () => {
    const mockUser = { id: "user-1", email: validData.email, name: validData.name };
    mockAuth.api.signUpEmail.mockResolvedValue({ user: mockUser, session: null, token: "" });

    const result = await signUpAction(validData);

    expect(result.success).toBe(true);
    expect(result.user).toEqual(mockUser);
    expect(result.message).toBe("Successfully signed up");
  });

  it("calls auth.api.signUpEmail with correct fields", async () => {
    mockAuth.api.signUpEmail.mockResolvedValue({ user: { id: "u" }, session: null, token: "" });
    await signUpAction(validData);
    expect(mockAuth.api.signUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          email: validData.email,
          name: validData.name,
          password: validData.password,
        }),
      }),
    );
  });

  it("returns failure with invalid data (bad email)", async () => {
    const result = await signUpAction({ email: "not-an-email", name: "x", password: "Password1!" });
    expect(result.success).toBe(false);
    expect(result.message).toBe("Invalid data");
    expect(mockAuth.api.signUpEmail).not.toHaveBeenCalled();
  });

  it("returns failure message when auth throws an Error", async () => {
    mockAuth.api.signUpEmail.mockRejectedValue(new Error("Email already in use"));
    const result = await signUpAction(validData);
    expect(result.success).toBe(false);
    expect(result.message).toBe("Email already in use");
  });

  it("returns generic failure message when auth throws non-Error", async () => {
    mockAuth.api.signUpEmail.mockRejectedValue("unexpected");
    const result = await signUpAction(validData);
    expect(result.success).toBe(false);
    expect(result.message).toBe("Failed to sign up");
  });

  it("result has success:true and user object on success", async () => {
    const mockUser = { id: "u-1", email: validData.email, name: validData.name };
    mockAuth.api.signUpEmail.mockResolvedValue({ user: mockUser, session: null, token: "" });
    const result = await signUpAction(validData);
    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("user");
  });

  it("returns failure with short password (fails UserZodSchema)", async () => {
    const result = await signUpAction({ email: "a@b.com", name: "Alice", password: "short" });
    expect(result.success).toBe(false);
    expect(result.message).toBe("Invalid data");
    expect(mockAuth.api.signUpEmail).not.toHaveBeenCalled();
  });

  it("returns failure with missing name", async () => {
    const result = await signUpAction({ email: "a@b.com", name: "", password: "Password1!" });
    expect(result.success).toBe(false);
    expect(result.message).toBe("Invalid data");
  });

  it("calls signUpEmail with headers", async () => {
    mockAuth.api.signUpEmail.mockResolvedValue({ user: { id: "u" }, session: null, token: "" });
    await signUpAction(validData);
    expect(mockAuth.api.signUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.anything() }),
    );
  });
});

describe("existsByEmailAction — additional invariants", () => {
  it("passes email verbatim to repository", async () => {
    mockUserRepo.existsByEmail.mockResolvedValue(false);
    await existsByEmailAction("test+tag@sub.domain.com");
    expect(mockUserRepo.existsByEmail).toHaveBeenCalledWith("test+tag@sub.domain.com");
  });

  it("returns boolean type", async () => {
    mockUserRepo.existsByEmail.mockResolvedValue(true);
    const result = await existsByEmailAction("user@example.com");
    expect(typeof result).toBe("boolean");
  });

  it("calls existsByEmail exactly once per action call", async () => {
    mockUserRepo.existsByEmail.mockResolvedValue(false);
    await existsByEmailAction("a@b.com");
    expect(mockUserRepo.existsByEmail).toHaveBeenCalledTimes(1);
  });
});
