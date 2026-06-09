import { describe, it, expect, vi, beforeEach } from "vitest";

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
  },
  chatExportRepository: { exportChat: exportChatMock },
  agentRepository: { selectAgentById: vi.fn() },
  mcpMcpToolCustomizationRepository: { selectByUserId: vi.fn().mockResolvedValue([]) },
  mcpServerCustomizationRepository: { selectByUserId: vi.fn().mockResolvedValue([]) },
}));
vi.mock("lib/ai/models", () => ({ customModelProvider: { getModel: vi.fn() } }));
vi.mock("lib/cache", () => ({
  serverCache: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
}));
vi.mock("lib/cache/cache-keys", () => ({
  CacheKeys: {
    mcpServerCustomizations: (id: string) => `mcp:${id}`,
    agentInstructions: (id: string) => `agent:${id}`,
  },
}));
vi.mock("logger", () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("lib/ai/prompts", () => ({
  CREATE_THREAD_TITLE_PROMPT: "title prompt",
  generateExampleToolSchemaPrompt: vi.fn().mockReturnValue(""),
}));
vi.mock("lib/utils", () => ({ toAny: (v: any) => v }));
vi.mock("lib/json-schema-to-zod", () => ({ jsonSchemaToZod: vi.fn() }));

describe("getUserId", () => {
  beforeEach(() => { vi.clearAllMocks(); });

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
  beforeEach(() => { vi.clearAllMocks(); });

  it("throws when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    const { selectThreadWithMessagesAction } = await import("./actions");
    await expect(selectThreadWithMessagesAction("t1")).rejects.toThrow(/Unauthorized/i);
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
    selectThreadMock.mockResolvedValue({ id: "t1", userId: "u1", title: "My chat" });
    selectMessagesMock.mockResolvedValue([{ id: "m1" }, { id: "m2" }]);
    const { selectThreadWithMessagesAction } = await import("./actions");
    const result = await selectThreadWithMessagesAction("t1");
    expect(result).not.toBeNull();
    expect(result!.messages).toHaveLength(2);
    expect(result!.title).toBe("My chat");
  });
});

describe("deleteMessageAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("calls deleteChatMessage with messageId", async () => {
    deleteChatMessageMock.mockResolvedValue(undefined);
    const { deleteMessageAction } = await import("./actions");
    await deleteMessageAction("m1");
    expect(deleteChatMessageMock).toHaveBeenCalledWith("m1");
  });
});

describe("deleteThreadAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("calls deleteThread with threadId", async () => {
    deleteThreadMock.mockResolvedValue(undefined);
    const { deleteThreadAction } = await import("./actions");
    await deleteThreadAction("t1");
    expect(deleteThreadMock).toHaveBeenCalledWith("t1");
  });
});

describe("deleteMessagesByChatIdAfterTimestampAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("calls deleteMessagesByChatIdAfterTimestamp with messageId", async () => {
    deleteMessagesByTimestampMock.mockResolvedValue(undefined);
    const { deleteMessagesByChatIdAfterTimestampAction } = await import("./actions");
    await deleteMessagesByChatIdAfterTimestampAction("m1");
    expect(deleteMessagesByTimestampMock).toHaveBeenCalledWith("m1");
  });
});

describe("updateThreadAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("throws when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { updateThreadAction } = await import("./actions");
    await expect(updateThreadAction("t1", { title: "New" })).rejects.toThrow();
  });

  it("calls updateThread with userId merged", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    updateThreadMock.mockResolvedValue(undefined);
    const { updateThreadAction } = await import("./actions");
    await updateThreadAction("t1", { title: "New" });
    expect(updateThreadMock).toHaveBeenCalledWith("t1", { title: "New", userId: "u1" });
  });
});

describe("deleteThreadsAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("calls deleteAllThreads with userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    deleteAllThreadsMock.mockResolvedValue(undefined);
    const { deleteThreadsAction } = await import("./actions");
    await deleteThreadsAction();
    expect(deleteAllThreadsMock).toHaveBeenCalledWith("u1");
  });
});

describe("deleteUnarchivedThreadsAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("calls deleteUnarchivedThreads with userId", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    deleteUnarchivedThreadsMock.mockResolvedValue(undefined);
    const { deleteUnarchivedThreadsAction } = await import("./actions");
    await deleteUnarchivedThreadsAction();
    expect(deleteUnarchivedThreadsMock).toHaveBeenCalledWith("u1");
  });
});

describe("exportChatAction", () => {
  beforeEach(() => { vi.clearAllMocks(); });

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
  beforeEach(() => { vi.clearAllMocks(); });

  it("getSession called exactly once per call", async () => {
    getSessionMock.mockResolvedValue(null);
    const { selectThreadWithMessagesAction } = await import("./actions");
    await expect(selectThreadWithMessagesAction("t1")).rejects.toThrow();
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("selectThread called exactly once for owner", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectThreadMock.mockResolvedValue({ id: "t1", userId: "u1", title: "Test" });
    selectMessagesMock.mockResolvedValue([]);
    const { selectThreadWithMessagesAction } = await import("./actions");
    await selectThreadWithMessagesAction("t1");
    expect(selectThreadMock).toHaveBeenCalledTimes(1);
  });

  it("selectMessages called exactly once when thread found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    selectThreadMock.mockResolvedValue({ id: "t1", userId: "u1", title: "Test" });
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
