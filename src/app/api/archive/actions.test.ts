import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("auth/server", () => ({
  getSession: vi.fn(),
}));

vi.mock("lib/db/repository", () => ({
  archiveRepository: {
    createArchive: vi.fn(),
    updateArchive: vi.fn(),
    deleteArchive: vi.fn(),
    getArchiveById: vi.fn(),
    addItemToArchive: vi.fn(),
    removeItemFromArchive: vi.fn(),
    getItemArchives: vi.fn(),
  },
}));

import { getSession } from "auth/server";
import { archiveRepository } from "lib/db/repository";
import {
  createArchiveAction,
  updateArchiveAction,
  deleteArchiveAction,
  addItemToArchiveAction,
  removeItemFromArchiveAction,
  getItemArchivesAction,
} from "./actions";

const mockGetSession = vi.mocked(getSession);
const mockRepo = vi.mocked(archiveRepository);

type MockSession = Awaited<ReturnType<typeof getSession>>;
const mockSessionFor = (userId: string): MockSession =>
  ({ user: { id: userId }, session: {} }) as unknown as MockSession;

const mockArchive = {
  id: "arch-1",
  name: "My Archive",
  description: null,
  userId: "user-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(mockSessionFor("user-1"));
});

describe("createArchiveAction", () => {
  it("creates an archive for the current user", async () => {
    mockRepo.createArchive.mockResolvedValue(mockArchive);
    const result = await createArchiveAction({ name: "My Archive" });
    expect(mockRepo.createArchive).toHaveBeenCalledWith({
      name: "My Archive",
      description: null,
      userId: "user-1",
    });
    expect(result).toEqual(mockArchive);
  });

  it("passes description when provided", async () => {
    mockRepo.createArchive.mockResolvedValue(mockArchive);
    await createArchiveAction({ name: "My Archive", description: "desc" });
    expect(mockRepo.createArchive).toHaveBeenCalledWith(
      expect.objectContaining({ description: "desc" }),
    );
  });

  it("throws when session has no user", async () => {
    mockGetSession.mockResolvedValue(null);
    await expect(createArchiveAction({ name: "x" })).rejects.toThrow("User not found");
  });

  it("throws when session user has no id", async () => {
    mockGetSession.mockResolvedValue({ user: {}, session: {} } as unknown as MockSession);
    await expect(createArchiveAction({ name: "x" })).rejects.toThrow("User not found");
  });
});

describe("updateArchiveAction", () => {
  it("updates archive when user owns it", async () => {
    mockRepo.getArchiveById.mockResolvedValue(mockArchive);
    mockRepo.updateArchive.mockResolvedValue({ ...mockArchive, name: "New Name" });
    const result = await updateArchiveAction("arch-1", { name: "New Name" });
    expect(mockRepo.updateArchive).toHaveBeenCalledWith(
      "arch-1",
      expect.objectContaining({ name: "New Name" }),
    );
    expect(result).toBeDefined();
  });

  it("throws when archive not found", async () => {
    mockRepo.getArchiveById.mockResolvedValue(null);
    await expect(updateArchiveAction("arch-missing", { name: "x" })).rejects.toThrow(
      "Archive not found or access denied",
    );
  });

  it("throws when user does not own the archive", async () => {
    mockRepo.getArchiveById.mockResolvedValue({ ...mockArchive, userId: "other-user" });
    await expect(updateArchiveAction("arch-1", { name: "x" })).rejects.toThrow(
      "Archive not found or access denied",
    );
  });

  it("throws when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    await expect(updateArchiveAction("arch-1", { name: "x" })).rejects.toThrow();
  });
});

describe("deleteArchiveAction", () => {
  it("deletes archive when user owns it", async () => {
    mockRepo.getArchiveById.mockResolvedValue(mockArchive);
    mockRepo.deleteArchive.mockResolvedValue(undefined);
    await deleteArchiveAction("arch-1");
    expect(mockRepo.deleteArchive).toHaveBeenCalledWith("arch-1");
  });

  it("throws when archive not found", async () => {
    mockRepo.getArchiveById.mockResolvedValue(null);
    await expect(deleteArchiveAction("arch-missing")).rejects.toThrow(
      "Archive not found or access denied",
    );
  });

  it("throws when user does not own the archive", async () => {
    mockRepo.getArchiveById.mockResolvedValue({ ...mockArchive, userId: "other-user" });
    await expect(deleteArchiveAction("arch-1")).rejects.toThrow(
      "Archive not found or access denied",
    );
  });
});

describe("addItemToArchiveAction", () => {
  it("adds item when user owns the archive", async () => {
    mockRepo.getArchiveById.mockResolvedValue(mockArchive);
    mockRepo.addItemToArchive.mockResolvedValue({ archiveId: "arch-1", itemId: "item-1" });
    const result = await addItemToArchiveAction("arch-1", "item-1");
    expect(mockRepo.addItemToArchive).toHaveBeenCalledWith("arch-1", "item-1", "user-1");
    expect(result).toBeDefined();
  });

  it("throws when archive not found", async () => {
    mockRepo.getArchiveById.mockResolvedValue(null);
    await expect(addItemToArchiveAction("arch-missing", "item-1")).rejects.toThrow(
      "Archive not found or access denied",
    );
  });

  it("throws when user does not own archive", async () => {
    mockRepo.getArchiveById.mockResolvedValue({ ...mockArchive, userId: "other-user" });
    await expect(addItemToArchiveAction("arch-1", "item-1")).rejects.toThrow(
      "Archive not found or access denied",
    );
  });
});

describe("removeItemFromArchiveAction", () => {
  it("removes item when user owns the archive", async () => {
    mockRepo.getArchiveById.mockResolvedValue(mockArchive);
    mockRepo.removeItemFromArchive.mockResolvedValue(undefined);
    await removeItemFromArchiveAction("arch-1", "item-1");
    expect(mockRepo.removeItemFromArchive).toHaveBeenCalledWith("arch-1", "item-1");
  });

  it("throws when archive not found", async () => {
    mockRepo.getArchiveById.mockResolvedValue(null);
    await expect(removeItemFromArchiveAction("arch-missing", "item-1")).rejects.toThrow(
      "Archive not found or access denied",
    );
  });
});

describe("getItemArchivesAction", () => {
  it("returns archives for the item and current user", async () => {
    mockRepo.getItemArchives.mockResolvedValue([mockArchive]);
    const result = await getItemArchivesAction("item-1");
    expect(mockRepo.getItemArchives).toHaveBeenCalledWith("item-1", "user-1");
    expect(result).toEqual([mockArchive]);
  });

  it("returns empty array when no archives contain the item", async () => {
    mockRepo.getItemArchives.mockResolvedValue([]);
    const result = await getItemArchivesAction("item-none");
    expect(result).toEqual([]);
  });

  it("throws when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    await expect(getItemArchivesAction("item-1")).rejects.toThrow();
  });
});
