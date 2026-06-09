import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getSessionMock,
  createArchiveMock,
  updateArchiveMock,
  deleteArchiveMock,
  getArchiveByIdMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  createArchiveMock: vi.fn(),
  updateArchiveMock: vi.fn(),
  deleteArchiveMock: vi.fn(),
  getArchiveByIdMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  archiveRepository: {
    createArchive: createArchiveMock,
    updateArchive: updateArchiveMock,
    deleteArchive: deleteArchiveMock,
    getArchiveById: getArchiveByIdMock,
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
});
