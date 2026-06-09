import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { USER_ROLES } from "app-types/roles";

vi.mock("server-only", () => ({}));

vi.mock("auth/server", () => ({
  getSession: vi.fn(),
}));

import { validatedAction, validatedActionWithUser } from "./action-utils";

const { getSession } = await import("auth/server");

type MockSession = Awaited<ReturnType<typeof getSession>>;

const mockSession = (user: Record<string, unknown>): MockSession =>
  ({ user, session: {} }) as unknown as MockSession;

describe("action-utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validatedAction", () => {
    it("should validate form data and call action with valid data", async () => {
      const schema = z.object({
        name: z.string(),
        age: z.string().transform(Number),
      });

      const mockAction = vi.fn().mockResolvedValue({ success: true });
      const wrappedAction = validatedAction(schema, mockAction);

      const formData = new FormData();
      formData.set("name", "John");
      formData.set("age", "25");

      const result = await wrappedAction({}, formData);

      expect(mockAction).toHaveBeenCalledWith(
        { name: "John", age: 25 },
        formData,
      );
      expect(result).toEqual({ success: true });
    });

    it("should return error when validation fails", async () => {
      const schema = z.object({
        email: z.string().email(),
      });

      const mockAction = vi.fn();
      const wrappedAction = validatedAction(schema, mockAction);

      const formData = new FormData();
      formData.set("email", "invalid-email");

      const result = await wrappedAction({}, formData);

      expect(mockAction).not.toHaveBeenCalled();
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("Invalid email");
    });
  });

  describe("validatedActionWithUser", () => {
    it("should call action with user when authenticated", async () => {
      const mockUser = {
        id: "user-1",
        name: "John Doe",
        email: "john@example.com",
        role: USER_ROLES.USER,
      };

      vi.mocked(getSession).mockResolvedValue(mockSession(mockUser));

      const schema = z.object({ data: z.string() });
      const mockAction = vi.fn().mockResolvedValue({ success: true });
      const wrappedAction = validatedActionWithUser(schema, mockAction);

      const formData = new FormData();
      formData.set("data", "test");

      const result = await wrappedAction({}, formData);

      expect(mockAction).toHaveBeenCalledWith(
        { data: "test" },
        formData,
        mockUser,
      );
      expect(result).toEqual({ success: true });
    });

    it("should return error when user is not authenticated", async () => {
      vi.mocked(getSession).mockRejectedValue(new Error("Unauthorized"));

      const schema = z.object({ data: z.string() });
      const mockAction = vi.fn();
      const wrappedAction = validatedActionWithUser(schema, mockAction);

      const formData = new FormData();
      formData.set("data", "test");

      const result = await wrappedAction({}, formData);

      expect(mockAction).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        message: "User is not authenticated",
      });
    });
  });
});

describe("action-utils — additional invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validatedAction passes prevState to the action", async () => {
    const schema = z.object({ val: z.string() });
    const mockAction = vi.fn().mockResolvedValue({});
    const wrapped = validatedAction(schema, mockAction);
    const fd = new FormData();
    fd.set("val", "x");
    await wrapped({}, fd);
    expect(mockAction).toHaveBeenCalledWith({ val: "x" }, fd);
  });

  it("validatedAction returns action result on success", async () => {
    const schema = z.object({ n: z.string().transform(Number) });
    const wrapped = validatedAction(schema, async (data) => ({
      doubled: data.n * 2,
    }));
    const fd = new FormData();
    fd.set("n", "7");
    const result = await wrapped({}, fd);
    expect(result).toEqual({ doubled: 14 });
  });

  it("validatedAction error result has error property", async () => {
    const schema = z.object({ url: z.string().url() });
    const wrapped = validatedAction(schema, vi.fn());
    const fd = new FormData();
    fd.set("url", "not-a-url");
    const result = await wrapped({}, fd);
    expect(result).toHaveProperty("error");
  });

  it("validatedActionWithUser passes correct user shape to action", async () => {
    const user = { id: "u1", name: "Alice", email: "a@b.com", role: "user" };
    vi.mocked(getSession).mockResolvedValue(mockSession(user));
    const schema = z.object({ msg: z.string() });
    const mockAction = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = validatedActionWithUser(schema, mockAction);
    const fd = new FormData();
    fd.set("msg", "hello");
    await wrapped({}, fd);
    const callArgs = mockAction.mock.calls[0] as unknown[];
    expect(callArgs[2]).toMatchObject({ id: "u1", name: "Alice" });
  });

  it("validatedActionWithUser calls action exactly once on success", async () => {
    const user = { id: "u2", name: "Bob", email: "b@c.com", role: "admin" };
    vi.mocked(getSession).mockResolvedValue(mockSession(user));
    const schema = z.object({ x: z.string() });
    const mockAction = vi.fn().mockResolvedValue({});
    const wrapped = validatedActionWithUser(schema, mockAction);
    const fd = new FormData();
    fd.set("x", "y");
    await wrapped({}, fd);
    expect(mockAction).toHaveBeenCalledTimes(1);
  });
});

describe("action-utils — guard invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validatedAction does not call action when required field is missing", async () => {
    const schema = z.object({ required: z.string() });
    const mockAction = vi.fn();
    const wrapped = validatedAction(schema, mockAction);
    const fd = new FormData();
    await wrapped({}, fd);
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("validatedActionWithUser does not call action when session is null", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const schema = z.object({ d: z.string() });
    const mockAction = vi.fn();
    const wrapped = validatedActionWithUser(schema, mockAction);
    const fd = new FormData();
    fd.set("d", "val");
    const result = await wrapped({}, fd);
    expect(mockAction).not.toHaveBeenCalled();
    expect(result).toHaveProperty("success", false);
  });
});
