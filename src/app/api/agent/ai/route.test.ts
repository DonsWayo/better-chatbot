import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/ai/models", () => ({
  customModelProvider: { getModel: vi.fn(() => ({})) },
}));
vi.mock("lib/ai/prompts", () => ({ buildAgentGenerationPrompt: vi.fn(() => "") }));
vi.mock("logger", () => ({
  default: { withDefaults: () => ({ info: vi.fn(), error: vi.fn() }) },
}));
vi.mock("consola/utils", () => ({ colorize: (_c: string, s: string) => s }));
vi.mock("app-types/agent", () => ({
  AgentGenerateSchema: { parse: (b: unknown) => b },
}));
vi.mock("../../chat/shared.chat", () => ({
  loadAppDefaultTools: vi.fn().mockResolvedValue({}),
}));
vi.mock("lib/db/repository", () => ({
  workflowRepository: { selectExecuteAbility: vi.fn().mockResolvedValue([]) },
}));
vi.mock("ts-safe", () => ({
  safe: vi.fn(() => ({ ifOk: () => ({ unwrap: () => Promise.resolve() }) })),
}));
vi.mock("lib/utils", () => ({ objectFlow: vi.fn(() => ({ forEach: vi.fn() })) }));
vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: { tools: vi.fn().mockResolvedValue({}) },
}));
vi.mock("ai", () => ({
  streamObject: vi.fn(() => ({ toTextStreamResponse: vi.fn(() => new Response("{}")) })),
}));

function makeRequest(body?: unknown): Request {
  return { json: () => Promise.resolve(body), signal: new AbortController().signal } as unknown as Request;
}

describe("POST /api/agent/ai", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ message: "create an agent" }));
    expect(res.status).toBe(401);
  });
});
