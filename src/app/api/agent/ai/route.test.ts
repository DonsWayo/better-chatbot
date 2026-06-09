import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getSessionMock,
  streamObjectMock,
  workflowRepositoryMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  streamObjectMock: vi.fn(),
  workflowRepositoryMock: { selectExecuteAbility: vi.fn() },
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("ai", () => ({ streamObject: streamObjectMock }));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModel: vi.fn(() => ({})) },
}));
vi.mock("lib/ai/prompts", () => ({
  buildAgentGenerationPrompt: vi.fn(() => "Generate an agent"),
}));
vi.mock("lib/db/repository", () => ({
  workflowRepository: workflowRepositoryMock,
}));
vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: { tools: vi.fn(() => Promise.resolve({})) },
}));
vi.mock("../../chat/shared.chat", () => ({
  loadAppDefaultTools: vi.fn(() => Promise.resolve({})),
}));
vi.mock("ts-safe", () => ({
  safe: (v: unknown) => ({
    ifOk: (fn: (val: unknown) => void) => {
      if (v instanceof Promise) {
        v.then(fn).catch(() => {});
      } else {
        fn(v);
      }
      return { unwrap: () => Promise.resolve(undefined) };
    },
    unwrap: () => Promise.resolve(undefined),
  }),
}));
vi.mock("lib/utils", () => ({
  objectFlow: (obj: Record<string, unknown>) => ({
    forEach: (fn: (value: unknown, key: string) => void) => {
      Object.entries(obj).forEach(([k, v]) => fn(v, k));
    },
  }),
}));
vi.mock("consola/utils", () => ({ colorize: (_: string, s: string) => s }));
vi.mock("logger", () => ({
  default: { withDefaults: () => ({ info: vi.fn(), error: vi.fn() }) },
}));

import { POST } from "./route";

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/agent/ai", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  workflowRepositoryMock.selectExecuteAbility.mockResolvedValue([]);
  streamObjectMock.mockReturnValue({
    toTextStreamResponse: () => new Response("stream", { status: 200 }),
  });
});

describe("POST /api/agent/ai", () => {
  it("returns 401 when no session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ message: "Make me an agent" }));
    expect(res.status).toBe(401);
  });

  it("calls streamObject and returns streaming response when authorized", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await POST(makeRequest({ message: "Build an agent" }));
    expect(streamObjectMock).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("passes message to streamObject", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    await POST(makeRequest({ message: "Design a sales agent" }));
    expect(streamObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "Design a sales agent" }),
    );
  });

  it("uses hello as default message when not provided", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    await POST(makeRequest({}));
    expect(streamObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "hello" }),
    );
  });
});
