import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getSessionMock,
  chatRepositoryMock,
  agentRepositoryMock,
  chatExportRepositoryMock,
  mcpServerCustomizationRepositoryMock,
  mcpMcpToolCustomizationRepositoryMock,
  customModelProviderMock,
  serverCacheMock,
  generateTextMock,
  generateObjectMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  chatRepositoryMock: {
    selectThread: vi.fn(),
    selectMessagesByThreadId: vi.fn(),
    deleteChatMessage: vi.fn(),
    deleteThread: vi.fn(),
    deleteMessagesByChatIdAfterTimestamp: vi.fn(),
    updateThread: vi.fn(),
    deleteAllThreads: vi.fn(),
    deleteUnarchivedThreads: vi.fn(),
    checkAccess: vi.fn(),
  },
  agentRepositoryMock: {
    selectAgentById: vi.fn(),
  },
  chatExportRepositoryMock: {
    exportChat: vi.fn(),
  },
  mcpServerCustomizationRepositoryMock: {
    selectByUserId: vi.fn(),
  },
  mcpMcpToolCustomizationRepositoryMock: {
    selectByUserId: vi.fn(),
  },
  customModelProviderMock: {
    getModel: vi.fn(),
  },
  serverCacheMock: {
    get: vi.fn(),
    set: vi.fn(),
  },
  generateTextMock: vi.fn(),
  generateObjectMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  chatRepository: chatRepositoryMock,
  agentRepository: agentRepositoryMock,
  chatExportRepository: chatExportRepositoryMock,
  mcpServerCustomizationRepository: mcpServerCustomizationRepositoryMock,
  mcpMcpToolCustomizationRepository: mcpMcpToolCustomizationRepositoryMock,
}));
vi.mock("lib/ai/models", () => ({ customModelProvider: customModelProviderMock }));
vi.mock("lib/cache", () => ({ serverCache: serverCacheMock }));
vi.mock("lib/cache/cache-keys", () => ({
  CacheKeys: {
    mcpServerCustomizations: (id: string) => `mcp:${id}`,
    agentInstructions: (id: string) => `agent:${id}`,
  },
}));
vi.mock("ai", async () => ({
  ...(await vi.importActual<typeof import("ai")>("ai")),
  generateText: generateTextMock,
  generateObject: generateObjectMock,
  jsonSchema: vi.fn((s) => s),
}));
vi.mock("logger", () => ({ default: { error: vi.fn(), info: vi.fn() } }));
vi.mock("lib/utils", () => ({ toAny: (v: unknown) => v }));

import {
  getUserId,
  generateTitleFromUserMessageAction,
  selectThreadWithMessagesAction,
  deleteMessageAction,
  deleteThreadAction,
  deleteMessagesByChatIdAfterTimestampAction,
  updateThreadAction,
  deleteThreadsAction,
  deleteUnarchivedThreadsAction,
  rememberMcpServerCustomizationsAction,
  rememberAgentAction,
  exportChatAction,
} from "./actions";

type MockSession = { user: { id: string } };
const makeSession = (userId = "user-1"): MockSession => ({ user: { id: userId } });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getUserId", () => {
  it("returns userId from session", async () => {
    getSessionMock.mockResolvedValue(makeSession("user-42"));
    const id = await getUserId();
    expect(id).toBe("user-42");
  });

  it("throws when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(getUserId()).rejects.toThrow("User not found");
  });

  it("throws when session has no user id", async () => {
    getSessionMock.mockResolvedValue({ user: {} });
    await expect(getUserId()).rejects.toThrow("User not found");
  });
});

describe("generateTitleFromUserMessageAction", () => {
  it("throws when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const model = {} as Parameters<typeof generateTitleFromUserMessageAction>[0]["model"];
    await expect(
      generateTitleFromUserMessageAction({ message: { parts: [] } as Parameters<typeof generateTitleFromUserMessageAction>[0]["message"], model }),
    ).rejects.toThrow("Unauthorized");
  });

  it("returns trimmed title", async () => {
    getSessionMock.mockResolvedValue(makeSession());
    generateTextMock.mockResolvedValue({ text: "  My Chat Title  " });
    const result = await generateTitleFromUserMessageAction({
      message: { parts: [{ type: "text", text: "hello" }] } as Parameters<typeof generateTitleFromUserMessageAction>[0]["message"],
      model: {} as Parameters<typeof generateTitleFromUserMessageAction>[0]["model"],
    });
    expect(result).toBe("My Chat Title");
  });
});

describe("selectThreadWithMessagesAction", () => {
  it("throws when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(selectThreadWithMessagesAction("t1")).rejects.toThrow("Unauthorized");
  });

  it("returns null when thread not found", async () => {
    getSessionMock.mockResolvedValue(makeSession("u1"));
    chatRepositoryMock.selectThread.mockResolvedValue(null);
    const result = await selectThreadWithMessagesAction("t1");
    expect(result).toBeNull();
  });

  it("returns null when thread belongs to different user", async () => {
    getSessionMock.mockResolvedValue(makeSession("u1"));
    chatRepositoryMock.selectThread.mockResolvedValue({ id: "t1", userId: "u2" });
    const result = await selectThreadWithMessagesAction("t1");
    expect(result).toBeNull();
  });

  it("returns thread with messages for owner", async () => {
    getSessionMock.mockResolvedValue(makeSession("u1"));
    chatRepositoryMock.selectThread.mockResolvedValue({ id: "t1", userId: "u1", title: "Thread" });
    chatRepositoryMock.selectMessagesByThreadId.mockResolvedValue([
      { id: "m1", role: "user" },
    ]);

    const result = await selectThreadWithMessagesAction("t1");
    expect(result?.messages).toHaveLength(1);
    expect(result?.title).toBe("Thread");
  });

  it("returns empty messages array when selectMessages returns null", async () => {
    getSessionMock.mockResolvedValue(makeSession("u1"));
    chatRepositoryMock.selectThread.mockResolvedValue({ id: "t1", userId: "u1" });
    chatRepositoryMock.selectMessagesByThreadId.mockResolvedValue(null);

    const result = await selectThreadWithMessagesAction("t1");
    expect(result?.messages).toEqual([]);
  });
});

describe("deleteMessageAction", () => {
  it("delegates to chatRepository.deleteChatMessage", async () => {
    chatRepositoryMock.deleteChatMessage.mockResolvedValue(undefined);
    await deleteMessageAction("msg-1");
    expect(chatRepositoryMock.deleteChatMessage).toHaveBeenCalledWith("msg-1");
  });
});

describe("deleteThreadAction", () => {
  it("delegates to chatRepository.deleteThread", async () => {
    chatRepositoryMock.deleteThread.mockResolvedValue(undefined);
    await deleteThreadAction("t1");
    expect(chatRepositoryMock.deleteThread).toHaveBeenCalledWith("t1");
  });
});

describe("deleteMessagesByChatIdAfterTimestampAction", () => {
  it("delegates to chatRepository", async () => {
    chatRepositoryMock.deleteMessagesByChatIdAfterTimestamp.mockResolvedValue(undefined);
    await deleteMessagesByChatIdAfterTimestampAction("msg-1");
    expect(chatRepositoryMock.deleteMessagesByChatIdAfterTimestamp).toHaveBeenCalledWith("msg-1");
  });
});

describe("updateThreadAction", () => {
  it("updates thread with userId from session", async () => {
    getSessionMock.mockResolvedValue(makeSession("user-5"));
    chatRepositoryMock.updateThread.mockResolvedValue(undefined);

    await updateThreadAction("t1", { title: "New Title" });
    expect(chatRepositoryMock.updateThread).toHaveBeenCalledWith("t1", {
      title: "New Title",
      userId: "user-5",
    });
  });
});

describe("deleteThreadsAction", () => {
  it("deletes all threads for current user", async () => {
    getSessionMock.mockResolvedValue(makeSession("user-9"));
    chatRepositoryMock.deleteAllThreads.mockResolvedValue(undefined);

    await deleteThreadsAction();
    expect(chatRepositoryMock.deleteAllThreads).toHaveBeenCalledWith("user-9");
  });
});

describe("deleteUnarchivedThreadsAction", () => {
  it("deletes unarchived threads for current user", async () => {
    getSessionMock.mockResolvedValue(makeSession("user-9"));
    chatRepositoryMock.deleteUnarchivedThreads.mockResolvedValue(undefined);

    await deleteUnarchivedThreadsAction();
    expect(chatRepositoryMock.deleteUnarchivedThreads).toHaveBeenCalledWith("user-9");
  });
});

describe("rememberMcpServerCustomizationsAction", () => {
  it("returns cached result when available", async () => {
    const cached = { "server-1": { name: "Exa", id: "server-1", prompt: "", tools: {} } };
    serverCacheMock.get.mockResolvedValue(cached);

    const result = await rememberMcpServerCustomizationsAction("user-1");
    expect(result).toEqual(cached);
    expect(mcpServerCustomizationRepositoryMock.selectByUserId).not.toHaveBeenCalled();
  });

  it("builds prompts from db when cache miss", async () => {
    serverCacheMock.get.mockResolvedValue(null);
    mcpServerCustomizationRepositoryMock.selectByUserId.mockResolvedValue([
      { mcpServerId: "s1", serverName: "Exa", prompt: "Search server" },
    ]);
    mcpMcpToolCustomizationRepositoryMock.selectByUserId.mockResolvedValue([
      { mcpServerId: "s1", serverName: "Exa", toolName: "search", prompt: "Search tool" },
    ]);

    const result = await rememberMcpServerCustomizationsAction("user-1");
    expect(result["s1"].name).toBe("Exa");
    expect(result["s1"].prompt).toBe("Search server");
    expect(result["s1"].tools["search"]).toBe("Search tool");
    expect(serverCacheMock.set).toHaveBeenCalled();
  });

  it("handles empty customizations", async () => {
    serverCacheMock.get.mockResolvedValue(null);
    mcpServerCustomizationRepositoryMock.selectByUserId.mockResolvedValue([]);
    mcpMcpToolCustomizationRepositoryMock.selectByUserId.mockResolvedValue([]);

    const result = await rememberMcpServerCustomizationsAction("user-1");
    expect(result).toEqual({});
  });
});

describe("rememberAgentAction", () => {
  it("returns undefined for undefined agent", async () => {
    const result = await rememberAgentAction(undefined, "user-1");
    expect(result).toBeUndefined();
  });

  it("returns cached agent when available", async () => {
    const cachedAgent = { id: "agent-1", name: "My Agent" };
    serverCacheMock.get.mockResolvedValue(cachedAgent);

    const result = await rememberAgentAction("agent-1", "user-1");
    expect(result).toEqual(cachedAgent);
    expect(agentRepositoryMock.selectAgentById).not.toHaveBeenCalled();
  });

  it("fetches and caches agent on cache miss", async () => {
    serverCacheMock.get.mockResolvedValue(null);
    const agent = { id: "agent-1", name: "Fetched Agent" };
    agentRepositoryMock.selectAgentById.mockResolvedValue(agent);

    const result = await rememberAgentAction("agent-1", "user-1");
    expect(result).toEqual(agent);
    expect(serverCacheMock.set).toHaveBeenCalledWith("agent:agent-1", agent);
  });
});

describe("exportChatAction", () => {
  it("throws when user not logged in", async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(exportChatAction({ threadId: "t1" })).rejects.toThrow("User not found");
  });

  it("returns 401 response when user has no access", async () => {
    getSessionMock.mockResolvedValue(makeSession("u1"));
    chatRepositoryMock.checkAccess.mockResolvedValue(false);

    const result = await exportChatAction({ threadId: "t1" });
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it("exports chat and returns export id", async () => {
    getSessionMock.mockResolvedValue(makeSession("u1"));
    chatRepositoryMock.checkAccess.mockResolvedValue(true);
    chatExportRepositoryMock.exportChat.mockResolvedValue("export-123");

    const result = await exportChatAction({ threadId: "t1" });
    expect(result).toBe("export-123");
    expect(chatExportRepositoryMock.exportChat).toHaveBeenCalledWith({
      threadId: "t1",
      exporterId: "u1",
      expiresAt: undefined,
    });
  });

  it("passes expiresAt when provided", async () => {
    getSessionMock.mockResolvedValue(makeSession("u1"));
    chatRepositoryMock.checkAccess.mockResolvedValue(true);
    chatExportRepositoryMock.exportChat.mockResolvedValue("export-456");

    const expiresAt = new Date("2027-01-01");
    await exportChatAction({ threadId: "t1", expiresAt });

    expect(chatExportRepositoryMock.exportChat).toHaveBeenCalledWith({
      threadId: "t1",
      exporterId: "u1",
      expiresAt,
    });
  });
});
