import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionMock,
  selectThreadMock,
  selectMessagesMock,
  checkAccessMock,
  exportChatMock,
  updateThreadMock,
  deleteAllThreadsMock,
  deleteUnarchivedThreadsMock,
  deleteThreadMock,
  deleteChatMessageMock,
  deleteMessagesByTimestampMock,
  selectMessageByIdMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  selectThreadMock: vi.fn(),
  selectMessagesMock: vi.fn(),
  checkAccessMock: vi.fn(),
  exportChatMock: vi.fn(),
  updateThreadMock: vi.fn(),
  deleteAllThreadsMock: vi.fn(),
  deleteUnarchivedThreadsMock: vi.fn(),
  deleteThreadMock: vi.fn(),
  deleteChatMessageMock: vi.fn(),
  deleteMessagesByTimestampMock: vi.fn(),
  selectMessageByIdMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  chatRepository: {
    selectThread: selectThreadMock,
    selectMessagesByThreadId: selectMessagesMock,
    checkAccess: checkAccessMock,
    updateThread: updateThreadMock,
    deleteAllThreads: deleteAllThreadsMock,
    deleteUnarchivedThreads: deleteUnarchivedThreadsMock,
    deleteThread: deleteThreadMock,
    deleteChatMessage: deleteChatMessageMock,
    deleteMessagesByChatIdAfterTimestamp: deleteMessagesByTimestampMock,
    selectMessageById: selectMessageByIdMock,
  },
  chatExportRepository: { exportChat: exportChatMock },
  agentRepository: { selectAgentById: vi.fn() },
  mcpMcpToolCustomizationRepository: {
    selectByUserId: vi.fn().mockResolvedValue([]),
  },
  mcpServerCustomizationRepository: {
    selectByUserId: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModel: vi.fn() },
}));
vi.mock("lib/cache", () => ({
  serverCache: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
}));
vi.mock("lib/cache/cache-keys", () => ({
  CacheKeys: {
    mcpServerCustomizations: (id: string) => `mcp:${id}`,
    agentInstructions: (id: string) => `agent:${id}`,
  },
}));
vi.mock("logger", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("lib/ai/prompts", () => ({
  CREATE_THREAD_TITLE_PROMPT: "title prompt",
  generateExampleToolSchemaPrompt: vi.fn().mockReturnValue(""),
}));
vi.mock("lib/utils", () => ({ toAny: (v: any) => v }));
vi.mock("lib/json-schema-to-zod", () => ({ jsonSchemaToZod: vi.fn() }));

describe("getUserId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const { getUserId } = await import("./actions");
    await expect(getUserId()).rejects.toThrow(/User not found/i);
  });

  it("returns userId when session exists", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const { getUserId } = await import("./actions");
    const id = await getUserId();
    expect(id).toBe("u1");
  });
});

describe("selectThreadWithMessagesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const { selectThreadWithMessagesAction } = await import("./actions");
    await expect(selectThreadWithMessagesAction("t1")).rejects.toThrow(
      /Unauthorized/i,
    );
  });

  it("returns null when thread not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectThreadMock.mockResolvedValue(null);
    const { selectThreadWithMessagesAction } = await import("./actions");
    const result = await selectThreadWithMessagesAction("t1");
    expect(result).toBeNull();
  });

  it("returns null when thread belongs to different user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectThreadMock.mockResolvedValue({ id: "t1", userId: "u2" });
    const { selectThreadWithMessagesAction } = await import("./actions");
    const result = await selectThreadWithMessagesAction("t1");
    expect(result).toBeNull();
  });

  it("returns thread with messages for owner", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectThreadMock.mockResolvedValue({
      id: "t1",
      userId: "u1",
      title: "My chat",
    });
    selectMessagesMock.mockResolvedValue([{ id: "m1" }, { id: "m2" }]);
    const { selectThreadWithMessagesAction } = await import("./actions");
    const result = await selectThreadWithMessagesAction("t1");
    expect(result).not.toBeNull();
    expect(result!.messages).toHaveLength(2);
    expect(result!.title).toBe("My chat");
  });
});

describe("deleteMessageAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { deleteMessageAction } = await import("./actions");
    await expect(deleteMessageAction("m1")).rejects.toThrow(/Unauthorized/i);
    expect(deleteChatMessageMock).not.toHaveBeenCalled();
  });

  it("deletes when caller owns the message's thread", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectMessageByIdMock.mockResolvedValue({ id: "m1", threadId: "t1" });
    checkAccessMock.mockResolvedValue(true);
    deleteChatMessageMock.mockResolvedValue(undefined);
    const { deleteMessageAction } = await import("./actions");
    await deleteMessageAction("m1");
    expect(checkAccessMock).toHaveBeenCalledWith("t1", "u1");
    expect(deleteChatMessageMock).toHaveBeenCalledWith("m1");
  });

  it("throws Forbidden and does not delete another user's message", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "attacker" } });
    selectMessageByIdMock.mockResolvedValue({ id: "m1", threadId: "t1" });
    checkAccessMock.mockResolvedValue(false);
    const { deleteMessageAction } = await import("./actions");
    await expect(deleteMessageAction("m1")).rejects.toThrow(/Forbidden/i);
    expect(deleteChatMessageMock).not.toHaveBeenCalled();
  });
});

describe("deleteThreadAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls deleteThread with threadId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    deleteThreadMock.mockResolvedValue(undefined);
    const { deleteThreadAction } = await import("./actions");
    await deleteThreadAction("t1");
    expect(deleteThreadMock).toHaveBeenCalledWith("t1");
  });
});

describe("deleteMessagesByChatIdAfterTimestampAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { deleteMessagesByChatIdAfterTimestampAction } = await import(
      "./actions"
    );
    await expect(
      deleteMessagesByChatIdAfterTimestampAction("m1"),
    ).rejects.toThrow(/Unauthorized/i);
    expect(deleteMessagesByTimestampMock).not.toHaveBeenCalled();
  });

  it("truncates when caller owns the pivot message's thread", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectMessageByIdMock.mockResolvedValue({ id: "m1", threadId: "t1" });
    checkAccessMock.mockResolvedValue(true);
    deleteMessagesByTimestampMock.mockResolvedValue(undefined);
    const { deleteMessagesByChatIdAfterTimestampAction } = await import(
      "./actions"
    );
    await deleteMessagesByChatIdAfterTimestampAction("m1");
    expect(checkAccessMock).toHaveBeenCalledWith("t1", "u1");
    expect(deleteMessagesByTimestampMock).toHaveBeenCalledWith("m1");
  });

  it("throws Forbidden and does not truncate another user's thread", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "attacker" } });
    selectMessageByIdMock.mockResolvedValue({ id: "m1", threadId: "t1" });
    checkAccessMock.mockResolvedValue(false);
    const { deleteMessagesByChatIdAfterTimestampAction } = await import(
      "./actions"
    );
    await expect(
      deleteMessagesByChatIdAfterTimestampAction("m1"),
    ).rejects.toThrow(/Forbidden/i);
    expect(deleteMessagesByTimestampMock).not.toHaveBeenCalled();
  });
});

describe("updateThreadAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { updateThreadAction } = await import("./actions");
    await expect(updateThreadAction("t1", { title: "New" })).rejects.toThrow();
  });

  it("calls updateThread with userId merged when caller owns the thread", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValue(true);
    updateThreadMock.mockResolvedValue(undefined);
    const { updateThreadAction } = await import("./actions");
    await updateThreadAction("t1", { title: "New" });
    expect(checkAccessMock).toHaveBeenCalledWith("t1", "u1");
    expect(updateThreadMock).toHaveBeenCalledWith("t1", {
      title: "New",
      userId: "u1",
    });
  });

  it("throws Forbidden and does not rename another user's thread", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "attacker" } });
    checkAccessMock.mockResolvedValue(false);
    const { updateThreadAction } = await import("./actions");
    await expect(updateThreadAction("t1", { title: "New" })).rejects.toThrow(
      /Forbidden/i,
    );
    expect(updateThreadMock).not.toHaveBeenCalled();
  });
});

describe("deleteThreadsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls deleteAllThreads with userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    deleteAllThreadsMock.mockResolvedValue(undefined);
    const { deleteThreadsAction } = await import("./actions");
    await deleteThreadsAction();
    expect(deleteAllThreadsMock).toHaveBeenCalledWith("u1");
  });
});

describe("deleteUnarchivedThreadsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls deleteUnarchivedThreads with userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    deleteUnarchivedThreadsMock.mockResolvedValue(undefined);
    const { deleteUnarchivedThreadsAction } = await import("./actions");
    await deleteUnarchivedThreadsAction();
    expect(deleteUnarchivedThreadsMock).toHaveBeenCalledWith("u1");
  });
});

describe("exportChatAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { exportChatAction } = await import("./actions");
    await expect(exportChatAction({ threadId: "t1" })).rejects.toThrow();
  });

  it("returns 401 Response when user has no access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValue(false);
    const { exportChatAction } = await import("./actions");
    const result = await exportChatAction({ threadId: "t1" });
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it("exports chat when user has access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValue(true);
    const mockExport = { id: "e1", threadId: "t1" };
    exportChatMock.mockResolvedValue(mockExport);
    const { exportChatAction } = await import("./actions");
    const result = await exportChatAction({ threadId: "t1" });
    expect(result).toEqual(mockExport);
    expect(exportChatMock).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "t1", exporterId: "u1" }),
    );
  });
});

describe("selectThreadWithMessagesAction — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getSession called exactly once per call", async () => {
    getSessionMock.mockResolvedValue(null);
    const { selectThreadWithMessagesAction } = await import("./actions");
    await expect(selectThreadWithMessagesAction("t1")).rejects.toThrow();
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("selectThread called exactly once for owner", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectThreadMock.mockResolvedValue({
      id: "t1",
      userId: "u1",
      title: "Test",
    });
    selectMessagesMock.mockResolvedValue([]);
    const { selectThreadWithMessagesAction } = await import("./actions");
    await selectThreadWithMessagesAction("t1");
    expect(selectThreadMock).toHaveBeenCalledTimes(1);
  });

  it("selectMessages called exactly once when thread found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectThreadMock.mockResolvedValue({
      id: "t1",
      userId: "u1",
      title: "Test",
    });
    selectMessagesMock.mockResolvedValue([{ id: "m-1" }]);
    const { selectThreadWithMessagesAction } = await import("./actions");
    await selectThreadWithMessagesAction("t1");
    expect(selectMessagesMock).toHaveBeenCalledTimes(1);
  });

  it("never calls selectMessages when thread not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectThreadMock.mockResolvedValue(null);
    const { selectThreadWithMessagesAction } = await import("./actions");
    await selectThreadWithMessagesAction("t1");
    expect(selectMessagesMock).not.toHaveBeenCalled();
  });
});

describe("deleteThreadAction — edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("throws when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const { deleteThreadAction } = await import("./actions");
    await expect(deleteThreadAction("t1")).rejects.toThrow();
  });

  it("deleteThread called exactly once on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    deleteThreadMock.mockResolvedValueOnce(undefined);
    const { deleteThreadAction } = await import("./actions");
    await deleteThreadAction("t1");
    expect(deleteThreadMock).toHaveBeenCalledTimes(1);
  });

  it("deleteThread not called when access check fails", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(false);
    const { deleteThreadAction } = await import("./actions");
    try {
      await deleteThreadAction("t1");
    } catch {}
    expect(deleteThreadMock).not.toHaveBeenCalled();
  });

  it("checkAccess called with correct threadId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    checkAccessMock.mockResolvedValueOnce(true);
    deleteThreadMock.mockResolvedValueOnce(undefined);
    const { deleteThreadAction } = await import("./actions");
    await deleteThreadAction("thread-xyz");
    expect(checkAccessMock).toHaveBeenCalledWith("thread-xyz", "u1");
  });
});
