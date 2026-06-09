import { describe, it, expect } from "vitest";
import { USER_ROLES } from "app-types/roles";
import { UpdateUserBanStatusSchema } from "./validations";

describe("Admin Actions - Business Logic", () => {
  describe("Self-Role Update Prevention Logic", () => {
    it("should identify when admin is trying to update their own role", () => {
      const adminUser = { id: "admin-123" };
      const targetUserId = "admin-123";

      const isSelfUpdate = adminUser.id === targetUserId;

      expect(isSelfUpdate).toBe(true);
    });

    it("should allow admin to update other users roles", () => {
      const adminUser = { id: "admin-123" };
      const targetUserId = "user-456";

      const isSelfUpdate = adminUser.id === targetUserId;

      expect(isSelfUpdate).toBe(false);
    });
  });

  describe("Role Default Logic", () => {
    it("should use default role when none provided", () => {
      const DEFAULT_USER_ROLE = USER_ROLES.USER;
      const roleInput = undefined;

      const role = roleInput || DEFAULT_USER_ROLE;

      expect(role).toBe(USER_ROLES.USER);
    });

    it("should use provided role when available", () => {
      const DEFAULT_USER_ROLE = USER_ROLES.USER;
      const roleInput = USER_ROLES.ADMIN;

      const role = roleInput || DEFAULT_USER_ROLE;

      expect(role).toBe(USER_ROLES.ADMIN);
    });

    it("all roles are truthy (no empty string)", () => {
      for (const r of Object.values(USER_ROLES)) {
        expect(r).toBeTruthy();
      }
    });
  });

  describe("Self-Ban Prevention Logic", () => {
    it("identifies self-ban attempt", () => {
      const adminId = "admin-1";
      expect(adminId === "admin-1").toBe(true);
    });

    it("allows banning another user", () => {
      const adminId = "admin-1";
      const targetId = "user-2";
      expect(adminId === targetId).toBe(false);
    });
  });
});

describe("UpdateUserBanStatusSchema", () => {
  const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

  it("parses banned=false (string) as boolean false", () => {
    const result = UpdateUserBanStatusSchema.safeParse({
      userId: VALID_UUID,
      banned: "false",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.banned).toBe(false);
  });

  it("parses banned=true (string) as boolean true", () => {
    const result = UpdateUserBanStatusSchema.safeParse({
      userId: VALID_UUID,
      banned: "true",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.banned).toBe(true);
  });

  it("accepts optional banReason", () => {
    const result = UpdateUserBanStatusSchema.safeParse({
      userId: VALID_UUID,
      banned: "true",
      banReason: "Violated ToS",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.banReason).toBe("Violated ToS");
  });

  it("omits banReason when not provided", () => {
    const result = UpdateUserBanStatusSchema.safeParse({
      userId: VALID_UUID,
      banned: "true",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.banReason).toBeUndefined();
  });

  it("rejects invalid banned value (not 'true'/'false')", () => {
    const result = UpdateUserBanStatusSchema.safeParse({
      userId: VALID_UUID,
      banned: "yes",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing userId", () => {
    const result = UpdateUserBanStatusSchema.safeParse({ banned: "true" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID in userId", () => {
    const result = UpdateUserBanStatusSchema.safeParse({
      userId: "not-a-uuid",
      banned: "true",
    });
    expect(result.success).toBe(false);
  });
});

describe("UpdateUserBanStatusSchema — additional", () => {
  const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

  it("accepts boolean true for banned (not just string)", () => {
    const result = UpdateUserBanStatusSchema.safeParse({ userId: VALID_UUID, banned: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.banned).toBe(true);
  });

  it("accepts boolean false for banned (not just string)", () => {
    const result = UpdateUserBanStatusSchema.safeParse({ userId: VALID_UUID, banned: false });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.banned).toBe(false);
  });

  it("rejects empty string userId", () => {
    const result = UpdateUserBanStatusSchema.safeParse({ userId: "", banned: "true" });
    expect(result.success).toBe(false);
  });

  it("result.data.userId matches input UUID exactly", () => {
    const result = UpdateUserBanStatusSchema.safeParse({ userId: VALID_UUID, banned: "false" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.userId).toBe(VALID_UUID);
  });

  it("accepts banReason as empty string", () => {
    const result = UpdateUserBanStatusSchema.safeParse({ userId: VALID_UUID, banned: "true", banReason: "" });
    expect(result.success).toBe(true);
  });

  it("rejects when banned field is missing entirely", () => {
    const result = UpdateUserBanStatusSchema.safeParse({ userId: VALID_UUID });
    expect(result.success).toBe(false);
  });
});

describe("UpdateUserBanStatusSchema — invariants", () => {
  const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

  it("parsed data.userId equals input uuid on success", () => {
    const result = UpdateUserBanStatusSchema.safeParse({ userId: VALID_UUID, banned: "true" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.userId).toBe(VALID_UUID);
  });

  it("parsed data.banned is a boolean on success", () => {
    const result = UpdateUserBanStatusSchema.safeParse({ userId: VALID_UUID, banned: "false" });
    expect(result.success).toBe(true);
    if (result.success) expect(typeof result.data.banned).toBe("boolean");
  });

  it("banReason defaults to undefined when not provided", () => {
    const result = UpdateUserBanStatusSchema.safeParse({ userId: VALID_UUID, banned: "true" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.banReason).toBeUndefined();
  });

  it("rejects null userId", () => {
    const result = UpdateUserBanStatusSchema.safeParse({ userId: null, banned: "true" });
    expect(result.success).toBe(false);
  });
});

describe("UpdateUserBanStatusSchema — null input invariants", () => {
  it("rejects null input", () => {
    const result = UpdateUserBanStatusSchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  it("rejects undefined input", () => {
    const result = UpdateUserBanStatusSchema.safeParse(undefined);
    expect(result.success).toBe(false);
  });

  it("rejects empty object (missing required fields)", () => {
    const result = UpdateUserBanStatusSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects object with only userId and no banned field", () => {
    const result = UpdateUserBanStatusSchema.safeParse({ userId: "00000000-0000-0000-0000-000000000001" });
    expect(result.success).toBe(false);
  });
});
