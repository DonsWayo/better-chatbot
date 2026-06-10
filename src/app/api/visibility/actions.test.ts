import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionMock,
  canAccessMock,
  grantAccessMock,
  revokeAccessMock,
  listGrantsMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  canAccessMock: vi.fn(),
  grantAccessMock: vi.fn(),
  revokeAccessMock: vi.fn(),
  listGrantsMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/visibility", () => ({
  canAccess: canAccessMock,
  grantAccess: grantAccessMock,
  revokeAccess: revokeAccessMock,
  listGrants: listGrantsMock,
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

    it("grantAccessAction throws Unauthorized", async () => {
      const { grantAccessAction } = await import("./actions");
      await expect(grantAccessAction(grantInput)).rejects.toThrow(
        "Unauthorized",
      );
      expect(grantAccessMock).not.toHaveBeenCalled();
      expect(canAccessMock).not.toHaveBeenCalled();
    });

    it("revokeAccessAction throws Unauthorized", async () => {
      const { revokeAccessAction } = await import("./actions");
      await expect(revokeAccessAction(grantInput)).rejects.toThrow(
        "Unauthorized",
      );
      expect(revokeAccessMock).not.toHaveBeenCalled();
    });

    it("listGrantsAction throws Unauthorized", async () => {
      const { listGrantsAction } = await import("./actions");
      await expect(
        listGrantsAction({ entityType: "agent", entityId: ENTITY }),
      ).rejects.toThrow("Unauthorized");
      expect(listGrantsMock).not.toHaveBeenCalled();
    });
  });

  describe("caller without manage capability", () => {
    beforeEach(() => {
      getSessionMock.mockResolvedValue({ user: { id: CALLER } });
      canAccessMock.mockResolvedValue(false);
    });

    it("grantAccessAction is rejected", async () => {
      const { grantAccessAction } = await import("./actions");
      await expect(grantAccessAction(grantInput)).rejects.toThrow("permission");
      expect(canAccessMock).toHaveBeenCalledWith(
        "workflow",
        ENTITY,
        CALLER,
        "manage",
      );
      expect(grantAccessMock).not.toHaveBeenCalled();
    });

    it("revokeAccessAction is rejected", async () => {
      const { revokeAccessAction } = await import("./actions");
      await expect(revokeAccessAction(grantInput)).rejects.toThrow(
        "permission",
      );
      expect(revokeAccessMock).not.toHaveBeenCalled();
    });

    it("listGrantsAction is rejected", async () => {
      const { listGrantsAction } = await import("./actions");
      await expect(
        listGrantsAction({ entityType: "workflow", entityId: ENTITY }),
      ).rejects.toThrow("permission");
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
      await grantAccessAction(grantInput);
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
      await grantAccessAction({ ...grantInput, capability: "edit" });
      expect(grantAccessMock).toHaveBeenCalledWith(
        expect.objectContaining({ capability: "edit", grantedBy: CALLER }),
      );
    });

    it("revokeAccessAction forwards the revocation", async () => {
      const { revokeAccessAction } = await import("./actions");
      await revokeAccessAction({ ...grantInput, capability: "use" });
      expect(revokeAccessMock).toHaveBeenCalledWith({
        ...grantInput,
        capability: "use",
      });
    });

    it("listGrantsAction returns the entity's grants", async () => {
      const rows = [{ id: "g1", capability: "use" }];
      listGrantsMock.mockResolvedValue(rows);
      const { listGrantsAction } = await import("./actions");
      await expect(
        listGrantsAction({ entityType: "agent", entityId: ENTITY }),
      ).resolves.toEqual(rows);
      expect(listGrantsMock).toHaveBeenCalledWith("agent", ENTITY);
    });
  });
});
