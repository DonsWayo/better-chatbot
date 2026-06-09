import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { USER_ROLES } from "app-types/roles";

// Mock server-only module
vi.mock("server-only", () => ({}));

// Mock the auth modules
vi.mock("auth/server", () => ({
  getSession: vi.fn(),
}));

vi.mock("lib/auth/permissions", () => ({
  requireAdminPermission: vi.fn(),
  requireUserManagePermissionFor: vi.fn(),
}));

// Import after mocks
import { validatedAction, validatedActionWithUser, validatedActionWithAdminPermission } from "./action-utils";

const { getSession } = await import("auth/server");
const { requireAdminPermission } = await import("lib/auth/permissions");

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
      expect((result as any).error).toContain("Invalid email");
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

      vi.mocked(getSession).mockResolvedValue({
        user: mockUser,
        session: {} as any,
      } as any);

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

  describe("validatedActionWithAdminPermission", () => {
    it("calls action when authenticated and admin permission passes", async () => {
      const mockUser = { id: "admin-1", role: "admin" };
      vi.mocked(getSession).mockResolvedValue({ user: mockUser, session: {} as any } as any);
      vi.mocked(requireAdminPermission).mockResolvedValue(undefined);

      const schema = z.object({ name: z.string() });
      const mockAction = vi.fn().mockResolvedValue({ success: true });
      const wrapped = validatedActionWithAdminPermission(schema, mockAction);

      const formData = new FormData();
      formData.set("name", "test");

      const result = await wrapped({}, formData);
      expect(mockAction).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it("returns error when unauthenticated (session null)", async () => {
      vi.mocked(getSession).mockResolvedValue(null as any);

      const schema = z.object({ name: z.string() });
      const mockAction = vi.fn();
      const wrapped = validatedActionWithAdminPermission(schema, mockAction);

      const formData = new FormData();
      formData.set("name", "test");

      const result = await wrapped({}, formData);
      expect(mockAction).not.toHaveBeenCalled();
      expect((result as any).success).toBe(false);
      expect((result as any).message).toContain("authenticated");
    });

    it("returns error when requireAdminPermission throws (non-admin user)", async () => {
      const mockUser = { id: "user-1", role: "user" };
      vi.mocked(getSession).mockResolvedValue({ user: mockUser, session: {} as any } as any);
      vi.mocked(requireAdminPermission).mockRejectedValue(new Error("Unauthorized: Admin access required"));

      const schema = z.object({ name: z.string() });
      const mockAction = vi.fn();
      const wrapped = validatedActionWithAdminPermission(schema, mockAction);

      const formData = new FormData();
      formData.set("name", "test");

      const result = await wrapped({}, formData);
      expect(mockAction).not.toHaveBeenCalled();
      expect((result as any).success).toBe(false);
      expect((result as any).message).toContain("Unauthorized");
    });

    it("validates schema before calling action", async () => {
      const mockUser = { id: "admin-1", role: "admin" };
      vi.mocked(getSession).mockResolvedValue({ user: mockUser, session: {} as any } as any);
      vi.mocked(requireAdminPermission).mockResolvedValue(undefined);

      const schema = z.object({ email: z.string().email("Invalid email") });
      const mockAction = vi.fn();
      const wrapped = validatedActionWithAdminPermission(schema, mockAction);

      const formData = new FormData();
      formData.set("email", "not-an-email");

      const result = await wrapped({}, formData);
      expect(mockAction).not.toHaveBeenCalled();
      expect((result as any).success).toBe(false);
      expect((result as any).message).toContain("Invalid email");
    });

    it("passes session to action", async () => {
      const mockUser = { id: "admin-1", role: "admin", name: "Admin" };
      const session = { user: mockUser, session: {} as any };
      vi.mocked(getSession).mockResolvedValue(session as any);
      vi.mocked(requireAdminPermission).mockResolvedValue(undefined);

      const schema = z.object({ data: z.string() });
      const mockAction = vi.fn().mockResolvedValue({ success: true });
      const wrapped = validatedActionWithAdminPermission(schema, mockAction);

      const formData = new FormData();
      formData.set("data", "value");

      await wrapped({}, formData);
      expect(mockAction).toHaveBeenCalledWith(
        { data: "value" },
        expect.any(FormData),
        session,
      );
    });
  });
});
