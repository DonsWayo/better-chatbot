import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getSessionMock,
  chatRepositoryMock,
  agentRepositoryMock,
  streamTextMock,
  createUIMessageStreamMock,
  createUIMessageStreamResponseMock,
  rememberAgentActionMock,
  rememberMcpServerCustomizationsActionMock,
  buildCsvIngestionPreviewPartsMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  chatRepositoryMock: {
    selectThreadDetails: vi.fn(),
    insertThread: vi.fn(),
    upsertMessage: vi.fn(),
  },
  agentRepositoryMock: {
    updateAgent: vi.fn(),
  },
  streamTextMock: vi.fn(),
  createUIMessageStreamMock: vi.fn(),
  createUIMessageStreamResponseMock: vi.fn(),
  rememberAgentActionMock: vi.fn(),
  rememberMcpServerCustomizationsActionMock: vi.fn(),
  buildCsvIngestionPreviewPartsMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/db/repository", () => ({
  chatRepository: chatRepositoryMock,
  agentRepository: agentRepositoryMock,
}));
vi.mock("ai", () => ({
  streamText: streamTextMock,
  createUIMessageStream: createUIMessageStreamMock,
  createUIMessageStreamResponse: createUIMessageStreamResponseMock,
  smoothStream: vi.fn(() => (x: unknown) => x),
  convertToModelMessages: vi.fn((m: unknown) => m),
  stepCountIs: vi.fn(() => () => false),
  isToolUIPart: vi.fn(() => false),
}));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModel: vi.fn(() => ({})) },
  isToolCallUnsupportedModel: vi.fn(() => false),
}));
vi.mock("lib/ai/prompts", () => ({
  buildUserSystemPrompt: vi.fn(() => "User system prompt"),
  buildMcpServerCustomizationsSystemPrompt: vi.fn(() => ""),
  buildToolCallUnsupportedModelSystemPrompt: "Tool unsupported prompt",
  MANUAL_REJECT_RESPONSE_PROMPT: "Manual reject",
}));
vi.mock("./shared.chat", () => ({
  excludeToolExecution: vi.fn((t: unknown) => t),
  handleError: vi.fn((e: unknown) => String(e)),
  manualToolExecuteByLastMessage: vi.fn(),
  mergeSystemPrompt: vi.fn((...args: string[]) => args.filter(Boolean).join(" ")),
  extractInProgressToolPart: vi.fn(() => []),
  filterMcpServerCustomizations: vi.fn(() => ({})),
  loadMcpTools: vi.fn().mockResolvedValue({}),
  loadWorkFlowTools: vi.fn().mockResolvedValue({}),
  loadAppDefaultTools: vi.fn().mockResolvedValue({}),
  convertToSavePart: vi.fn((p: unknown) => p),
}));
vi.mock("./actions", () => ({
  rememberAgentAction: rememberAgentActionMock,
  rememberMcpServerCustomizationsAction: rememberMcpServerCustomizationsActionMock,
}));
vi.mock("@/lib/ai/ingest/csv-ingest", () => ({
  buildCsvIngestionPreviewParts: buildCsvIngestionPreviewPartsMock,
}));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: { download: vi.fn() },
}));
vi.mock("lib/ai/tools/image", () => ({
  nanoBananaTool: {},
  openaiImageTool: {},
}));
vi.mock("lib/utils", () => ({
  generateUUID: vi.fn(() => "generated-uuid"),
  errorToString: vi.fn((e: unknown) => String(e)),
  exclude: vi.fn((o: Record<string, unknown>, _keys: string[]) => o),
  objectFlow: vi.fn((o: Record<string, unknown>) => ({
    filter: (fn: (v: unknown) => boolean) =>
      Object.fromEntries(Object.entries(o).filter(([, v]) => fn(v))),
  })),
}));
vi.mock("consola/utils", () => ({ colorize: (_: string, s: string) => s }));
vi.mock("logger", () => ({
  default: { withDefaults: () => ({ info: vi.fn(), error: vi.fn() }) },
}));
vi.mock("ts-safe", () => ({
  safe: (v?: unknown) => ({
    map: (fn: (v: unknown) => unknown) => {
      try {
        const result = fn(v);
        if (result instanceof Promise) {
          return {
            map: (fn2: (v: unknown) => unknown) =>
              ({ orElse: async (fallback: unknown) => {
                try { return await fn2(await result); } catch { return fallback; }
              }}),
            orElse: async (fallback: unknown) => {
              try { return await result; } catch { return fallback; }
            },
          };
        }
        return {
          map: (fn2: (v: unknown) => unknown) =>
            ({ orElse: (fallback: unknown) => {
              try { return fn2(result); } catch { return fallback; }
            }, unwrap: () => result }),
          orElse: () => result,
          unwrap: () => result,
        };
      } catch {
        return {
          map: () => ({ orElse: (fallback: unknown) => fallback, unwrap: () => undefined }),
          orElse: (fallback: unknown) => fallback,
          unwrap: () => undefined,
        };
      }
    },
    orElse: (fallback: unknown) => (v !== undefined ? v : fallback),
    unwrap: () => v,
  }),
  errorIf: vi.fn(() => () => undefined),
}));

import { POST } from "./route";

const THREAD = {
  id: "thread-1",
  userId: "user-1",
  messages: [],
  userPreferences: null,
};

const makeMessage = () => ({
  id: "msg-1",
  role: "user",
  parts: [{ type: "text", text: "Hello" }],
  metadata: {},
});

const makeRequestBody = (overrides: Record<string, unknown> = {}) => ({
  id: "thread-1",
  message: makeMessage(),
  toolChoice: "auto",
  mentions: [],
  attachments: [],
  ...overrides,
});

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  chatRepositoryMock.selectThreadDetails.mockResolvedValue(THREAD);
  chatRepositoryMock.insertThread.mockResolvedValue({ id: "thread-1" });
  chatRepositoryMock.upsertMessage.mockResolvedValue(undefined);
  rememberAgentActionMock.mockResolvedValue(null);
  rememberMcpServerCustomizationsActionMock.mockResolvedValue([]);
  buildCsvIngestionPreviewPartsMock.mockResolvedValue([]);
  streamTextMock.mockReturnValue({
    consumeStream: vi.fn(),
    toUIMessageStream: vi.fn(() => ({})),
  });
  createUIMessageStreamMock.mockReturnValue({});
  createUIMessageStreamResponseMock.mockReturnValue(
    new Response("stream", { status: 200 }),
  );
});

describe("POST /api/chat", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest(makeRequestBody()));
    expect(res.status).toBe(401);
  });

  it("returns 401 when session has no user id", async () => {
    getSessionMock.mockResolvedValue({ user: {} });
    const res = await POST(makeRequest(makeRequestBody()));
    expect(res.status).toBe(401);
  });

  it("returns 403 when thread belongs to different user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-2" } });
    chatRepositoryMock.selectThreadDetails.mockResolvedValue({
      ...THREAD,
      userId: "user-1",
    });
    const res = await POST(makeRequest(makeRequestBody()));
    expect(res.status).toBe(403);
  });

  it("creates new thread when thread not found", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    chatRepositoryMock.selectThreadDetails
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(THREAD);
    await POST(makeRequest(makeRequestBody()));
    expect(chatRepositoryMock.insertThread).toHaveBeenCalledWith(
      expect.objectContaining({ id: "thread-1", userId: "user-1" }),
    );
  });

  it("returns 200 streaming response when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await POST(makeRequest(makeRequestBody()));
    expect(res.status).toBe(200);
  });

  it("calls createUIMessageStreamResponse to build the response", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    await POST(makeRequest(makeRequestBody()));
    expect(createUIMessageStreamResponseMock).toHaveBeenCalled();
  });

  it("returns 500 on unexpected error", async () => {
    getSessionMock.mockRejectedValue(new Error("DB failure"));
    const res = await POST(makeRequest(makeRequestBody()));
    expect(res.status).toBe(500);
  });

  it("passes thread id to selectThreadDetails", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    await POST(makeRequest(makeRequestBody({ id: "my-thread-id" })));
    expect(chatRepositoryMock.selectThreadDetails).toHaveBeenCalledWith("my-thread-id");
  });

  it("does not create thread when thread exists", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    await POST(makeRequest(makeRequestBody()));
    expect(chatRepositoryMock.insertThread).not.toHaveBeenCalled();
  });

  it("calls createUIMessageStream exactly once when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    await POST(makeRequest(makeRequestBody()));
    expect(createUIMessageStreamMock).toHaveBeenCalledTimes(1);
  });

  it("calls createUIMessageStreamResponse exactly once when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    await POST(makeRequest(makeRequestBody()));
    expect(createUIMessageStreamResponseMock).toHaveBeenCalledTimes(1);
  });

  it("does not call streamText when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    await POST(makeRequest(makeRequestBody()));
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("does not call streamText when thread belongs to different user", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-2" } });
    chatRepositoryMock.selectThreadDetails.mockResolvedValue({ ...THREAD, userId: "user-1" });
    await POST(makeRequest(makeRequestBody()));
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("getSession is called exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    await POST(makeRequest(makeRequestBody()));
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it("selectThreadDetails is called exactly once per request", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    await POST(makeRequest(makeRequestBody()));
    expect(chatRepositoryMock.selectThreadDetails).toHaveBeenCalledTimes(1);
  });

  it("does not call selectThreadDetails when session is null", async () => {
    getSessionMock.mockResolvedValue(null);
    await POST(makeRequest(makeRequestBody()));
    expect(chatRepositoryMock.selectThreadDetails).not.toHaveBeenCalled();
  });
});
