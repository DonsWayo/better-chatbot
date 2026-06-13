import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionMock,
  canAccessMock,
  grantAccessMock,
  revokeAccessMock,
  listGrantsMock,
  resolveGranteeByEmailMock,
  resolveGranteeNamesMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  canAccessMock: vi.fn(),
  grantAccessMock: vi.fn(),
  revokeAccessMock: vi.fn(),
  listGrantsMock: vi.fn(),
  resolveGranteeByEmailMock: vi.fn(),
  resolveGranteeNamesMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/visibility", () => ({
  canAccess: canAccessMock,
  grantAccess: grantAccessMock,
  revokeAccess: revokeAccessMock,
  listGrants: listGrantsMock,
  resolveGranteeByEmail: resolveGranteeByEmailMock,
  resolveGranteeNames: resolveGranteeNamesMock,
}));

const CALLER = "00000000-0000-0000-0000-00000000aaaa";
const GRANTEE = "00000000-0000-0000-0000-00000000bbbb";
const ENTITY = "00000000-0000-0000-0000-00000000eeee";

const grantInput = {
  entityType: "workflow" as const,
  entityId: ENTITY,
  granteeUserId: GRANTEE,
};

describe("visibility server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("unauthenticated", () => {
    beforeEach(() => {
      getSessionMock.mockResolvedValue(null);
    });

    it("grantAccessAction returns a structured Unauthorized failure", async () => {
      const { grantAccessAction } = await import("./actions");
      await expect(grantAccessAction(grantInput)).resolves.toEqual({
        success: false,
        error: "Unauthorized",
      });
      expect(grantAccessMock).not.toHaveBeenCalled();
      expect(canAccessMock).not.toHaveBeenCalled();
    });

    it("revokeAccessAction returns a structured Unauthorized failure", async () => {
      const { revokeAccessAction } = await import("./actions");
      await expect(revokeAccessAction(grantInput)).resolves.toEqual({
        success: false,
        error: "Unauthorized",
      });
      expect(revokeAccessMock).not.toHaveBeenCalled();
    });

    it("listGrantsAction returns a structured Unauthorized failure", async () => {
      const { listGrantsAction } = await import("./actions");
      await expect(
        listGrantsAction({ entityType: "agent", entityId: ENTITY }),
      ).resolves.toEqual({ success: false, error: "Unauthorized" });
      expect(listGrantsMock).not.toHaveBeenCalled();
    });
  });

  describe("caller without manage capability", () => {
    beforeEach(() => {
      getSessionMock.mockResolvedValue({ user: { id: CALLER } });
      canAccessMock.mockResolvedValue(false);
    });

    it("grantAccessAction returns a structured permission failure", async () => {
      const { grantAccessAction } = await import("./actions");
      const result = await grantAccessAction(grantInput);
      expect(result).toEqual({
        success: false,
        error: "You do not have permission to manage sharing for this item",
      });
      expect(canAccessMock).toHaveBeenCalledWith(
        "workflow",
        ENTITY,
        CALLER,
        "manage",
      );
      expect(grantAccessMock).not.toHaveBeenCalled();
    });

    it("revokeAccessAction returns a structured permission failure", async () => {
      const { revokeAccessAction } = await import("./actions");
      const result = await revokeAccessAction(grantInput);
      expect(result.success).toBe(false);
      expect((result as { error: string }).error).toContain("permission");
      expect(revokeAccessMock).not.toHaveBeenCalled();
    });

    it("listGrantsAction returns a structured permission failure", async () => {
      const { listGrantsAction } = await import("./actions");
      const result = await listGrantsAction({
        entityType: "workflow",
        entityId: ENTITY,
      });
      expect(result.success).toBe(false);
      expect((result as { error: string }).error).toContain("permission");
      expect(listGrantsMock).not.toHaveBeenCalled();
    });
  });

  describe("caller with manage capability (owner or admin)", () => {
    beforeEach(() => {
      getSessionMock.mockResolvedValue({ user: { id: CALLER } });
      canAccessMock.mockResolvedValue(true);
    });

    it("grantAccessAction records the caller as grantedBy and defaults capability to 'use'", async () => {
      const { grantAccessAction } = await import("./actions");
      await expect(grantAccessAction(grantInput)).resolves.toEqual({
        success: true,
        data: undefined,
      });
      expect(grantAccessMock).toHaveBeenCalledWith({
        entityType: "workflow",
        entityId: ENTITY,
        granteeUserId: GRANTEE,
        capability: "use",
        grantedBy: CALLER,
      });
    });

    it("grantAccessAction forwards an explicit capability", async () => {
      const { grantAccessAction } = await import("./actions");
      const result = await grantAccessAction({
        ...grantInput,
        capability: "edit",
      });
      expect(result.success).toBe(true);
      expect(grantAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ capability: "edit", grantedBy: CALLER }),
      );
    });

    it("revokeAccessAction forwards the revocation", async () => {
      const { revokeAccessAction } = await import("./actions");
      const result = await revokeAccessAction({
        ...grantInput,
        capability: "use",
      });
      expect(result.success).toBe(true);
      expect(revokeAccessMock).toHaveBeenCalledWith({
        ...grantInput,
        capability: "use",
      });
    });

    it("listGrantsAction returns the entity's grants enriched with grantee name + email", async () => {
      const rows = [{ id: "g1", granteeUserId: GRANTEE, capability: "use" }];
      listGrantsMock.mockResolvedValue(rows);
      resolveGranteeNamesMock.mockResolvedValue({
        [GRANTEE]: { name: "Ada", email: "ada@example.com" },
      });
      const { listGrantsAction } = await import("./actions");
      await expect(
        listGrantsAction({ entityType: "agent", entityId: ENTITY }),
      ).resolves.toEqual({
        success: true,
        data: [
          {
            id: "g1",
            granteeUserId: GRANTEE,
            capability: "use",
            granteeName: "Ada",
            granteeEmail: "ada@example.com",
          },
        ],
      });
      expect(listGrantsMock).toHaveBeenCalledWith("agent", ENTITY);
      expect(resolveGranteeNamesMock).toHaveBeenCalledWith([GRANTEE]);
    });

    it("listGrantsAction tolerates a grantee with no resolved identity", async () => {
      listGrantsMock.mockResolvedValue([
        { id: "g1", granteeUserId: GRANTEE, capability: "edit" },
      ]);
      resolveGranteeNamesMock.mockResolvedValue({});
      const { listGrantsAction } = await import("./actions");
      const result = await listGrantsAction({
        entityType: "agent",
        entityId: ENTITY,
      });
      expect(result.success).toBe(true);
      expect((result as { data: unknown[] }).data[0]).toMatchObject({
        granteeName: null,
        granteeEmail: null,
      });
    });

    it("resolveGranteeByEmailAction returns the resolved user", async () => {
      const user = {
        id: GRANTEE,
        name: "Ada",
        email: "ada@example.com",
      };
      resolveGranteeByEmailMock.mockResolvedValue(user);
      const { resolveGranteeByEmailAction } = await import("./actions");
      await expect(
        resolveGranteeByEmailAction({
          entityType: "workflow",
          entityId: ENTITY,
          email: "ada@example.com",
        }),
      ).resolves.toEqual({ success: true, data: user });
      expect(resolveGranteeByEmailMock).toHaveBeenCalledWith("ada@example.com");
    });

    it("resolveGranteeByEmailAction returns null for an unknown email", async () => {
      resolveGranteeByEmailMock.mockResolvedValue(null);
      const { resolveGranteeByEmailAction } = await import("./actions");
      await expect(
        resolveGranteeByEmailAction({
          entityType: "workflow",
          entityId: ENTITY,
          email: "nobody@example.com",
        }),
      ).resolves.toEqual({ success: true, data: null });
    });
  });

  describe("resolveGranteeByEmailAction requires manage", () => {
    it("rejects an unauthenticated caller", async () => {
      getSessionMock.mockResolvedValue(null);
      const { resolveGranteeByEmailAction } = await import("./actions");
      await expect(
        resolveGranteeByEmailAction({
          entityType: "workflow",
          entityId: ENTITY,
          email: "ada@example.com",
        }),
      ).resolves.toEqual({ success: false, error: "Unauthorized" });
      expect(resolveGranteeByEmailMock).not.toHaveBeenCalled();
    });

    it("rejects a caller without manage (no email probing)", async () => {
      getSessionMock.mockResolvedValue({ user: { id: CALLER } });
      canAccessMock.mockResolvedValue(false);
      const { resolveGranteeByEmailAction } = await import("./actions");
      const result = await resolveGranteeByEmailAction({
        entityType: "workflow",
        entityId: ENTITY,
        email: "ada@example.com",
      });
      expect(result.success).toBe(false);
      expect((result as { error: string }).error).toContain("permission");
      expect(resolveGranteeByEmailMock).not.toHaveBeenCalled();
    });
  });
});
