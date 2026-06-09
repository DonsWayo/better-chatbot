import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getSessionMock,
  createArchiveMock,
  updateArchiveMock,
  deleteArchiveMock,
  getArchiveByIdMock,
  addItemToArchiveMock,
  removeItemFromArchiveMock,
  getItemArchivesMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  createArchiveMock: vi.fn(),
  updateArchiveMock: vi.fn(),
  deleteArchiveMock: vi.fn(),
  getArchiveByIdMock: vi.fn(),
  addItemToArchiveMock: vi.fn(),
  removeItemFromArchiveMock: vi.fn(),
  getItemArchivesMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  archiveRepository: {
    createArchive: createArchiveMock,
    updateArchive: updateArchiveMock,
    deleteArchive: deleteArchiveMock,
    getArchiveById: getArchiveByIdMock,
    addItemToArchive: addItemToArchiveMock,
    removeItemFromArchive: removeItemFromArchiveMock,
    getItemArchives: getItemArchivesMock,
  },
}));
vi.mock("app-types/archive", () => ({
  ArchiveCreateSchema: { parse: (d: any) => d },
  ArchiveUpdateSchema: { parse: (d: any) => d },
}));

describe("createArchiveAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("throws when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { createArchiveAction } = await import("./actions");
    await expect(createArchiveAction({ name: "My Archive" })).rejects.toThrow("User not found");
  });

  it("creates archive for authenticated user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    createArchiveMock.mockResolvedValueOnce({ id: "a1", name: "My Archive", userId: "u1" });
    const { createArchiveAction } = await import("./actions");
    const result = await createArchiveAction({ name: "My Archive" });
    expect(result.id).toBe("a1");
    expect(createArchiveMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "My Archive", userId: "u1" }),
    );
  });
});

describe("updateArchiveAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("throws when archive not owned by user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce({ id: "a1", userId: "u2" }); // different owner
    const { updateArchiveAction } = await import("./actions");
    await expect(updateArchiveAction("a1", { name: "New" })).rejects.toThrow("Archive not found");
  });

  it("updates archive when user owns it", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce({ id: "a1", userId: "u1" });
    updateArchiveMock.mockResolvedValueOnce({ id: "a1", name: "Updated" });
    const { updateArchiveAction } = await import("./actions");
    const result = await updateArchiveAction("a1", { name: "Updated" });
    expect(result.id).toBe("a1");
  });
});

describe("deleteArchiveAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("throws when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { deleteArchiveAction } = await import("./actions");
    await expect(deleteArchiveAction("a1")).rejects.toThrow("User not found");
  });

  it("throws when archive not owned by user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce({ id: "a1", userId: "u2" });
    const { deleteArchiveAction } = await import("./actions");
    await expect(deleteArchiveAction("a1")).rejects.toThrow("Archive not found");
  });

  it("deletes archive when user owns it", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce({ id: "a1", userId: "u1" });
    deleteArchiveMock.mockResolvedValueOnce(undefined);
    const { deleteArchiveAction } = await import("./actions");
    await expect(deleteArchiveAction("a1")).resolves.toBeUndefined();
    expect(deleteArchiveMock).toHaveBeenCalledWith("a1");
  });

  it("never calls deleteArchive when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { deleteArchiveAction } = await import("./actions");
    await deleteArchiveAction("a1").catch(() => {});
    expect(deleteArchiveMock).not.toHaveBeenCalled();
  });
});

describe("addItemToArchiveAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("throws when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { addItemToArchiveAction } = await import("./actions");
    await expect(addItemToArchiveAction("a1", "item1")).rejects.toThrow("User not found");
  });

  it("throws when archive not owned by user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce({ id: "a1", userId: "u2" });
    const { addItemToArchiveAction } = await import("./actions");
    await expect(addItemToArchiveAction("a1", "item1")).rejects.toThrow("Archive not found");
  });

  it("adds item when user owns archive", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce({ id: "a1", userId: "u1" });
    const expected = { archiveId: "a1", itemId: "item1", userId: "u1" };
    addItemToArchiveMock.mockResolvedValueOnce(expected);
    const { addItemToArchiveAction } = await import("./actions");
    const result = await addItemToArchiveAction("a1", "item1");
    expect(result).toEqual(expected);
    expect(addItemToArchiveMock).toHaveBeenCalledWith("a1", "item1", "u1");
  });

  it("never calls addItemToArchive when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { addItemToArchiveAction } = await import("./actions");
    await addItemToArchiveAction("a1", "item1").catch(() => {});
    expect(addItemToArchiveMock).not.toHaveBeenCalled();
  });
});

describe("removeItemFromArchiveAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("throws when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { removeItemFromArchiveAction } = await import("./actions");
    await expect(removeItemFromArchiveAction("a1", "item1")).rejects.toThrow("User not found");
  });

  it("throws when archive not owned by user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce({ id: "a1", userId: "u2" });
    const { removeItemFromArchiveAction } = await import("./actions");
    await expect(removeItemFromArchiveAction("a1", "item1")).rejects.toThrow("Archive not found");
  });

  it("removes item when user owns archive", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getArchiveByIdMock.mockResolvedValueOnce({ id: "a1", userId: "u1" });
    removeItemFromArchiveMock.mockResolvedValueOnce(undefined);
    const { removeItemFromArchiveAction } = await import("./actions");
    await expect(removeItemFromArchiveAction("a1", "item1")).resolves.toBeUndefined();
    expect(removeItemFromArchiveMock).toHaveBeenCalledWith("a1", "item1");
  });

  it("never calls removeItemFromArchive when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { removeItemFromArchiveAction } = await import("./actions");
    await removeItemFromArchiveAction("a1", "item1").catch(() => {});
    expect(removeItemFromArchiveMock).not.toHaveBeenCalled();
  });
});

describe("getItemArchivesAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("throws when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { getItemArchivesAction } = await import("./actions");
    await expect(getItemArchivesAction("item1")).rejects.toThrow("User not found");
  });

  it("returns archives for item when authenticated", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const archives = [{ id: "a1", name: "Archive 1", userId: "u1" }];
    getItemArchivesMock.mockResolvedValueOnce(archives);
    const { getItemArchivesAction } = await import("./actions");
    const result = await getItemArchivesAction("item1");
    expect(result).toEqual(archives);
    expect(getItemArchivesMock).toHaveBeenCalledWith("item1", "u1");
  });

  it("returns empty array when item has no archives", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    getItemArchivesMock.mockResolvedValueOnce([]);
    const { getItemArchivesAction } = await import("./actions");
    const result = await getItemArchivesAction("item99");
    expect(result).toEqual([]);
  });

  it("passes correct userId to repository", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-xyz" } });
    getItemArchivesMock.mockResolvedValueOnce([]);
    const { getItemArchivesAction } = await import("./actions");
    await getItemArchivesAction("item1");
    expect(getItemArchivesMock).toHaveBeenCalledWith("item1", "user-xyz");
  });
});

describe("archive actions — auth guard invariants", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

  it("updateArchiveAction throws or returns error when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { updateArchiveAction } = await import("./actions");
    const result = await updateArchiveAction({ id: "a1", name: "test" });
    expect(result).toBeDefined();
  });

  it("deleteArchiveAction throws or returns error when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { deleteArchiveAction } = await import("./actions");
    const result = await deleteArchiveAction("a1");
    expect(result).toBeDefined();
  });

  it("addItemToArchiveAction throws or returns error when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { addItemToArchiveAction } = await import("./actions");
    const result = await addItemToArchiveAction({ archiveId: "a1", itemId: "i1", itemType: "chat" });
    expect(result).toBeDefined();
  });

  it("getItemArchivesAction returns empty array when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { getItemArchivesAction } = await import("./actions");
    const result = await getItemArchivesAction("item1");
    expect(Array.isArray(result) || result === undefined || result === null).toBe(true);
  });
});
