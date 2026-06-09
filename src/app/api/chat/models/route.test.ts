import { describe, it, expect, vi, beforeEach } from "vitest";

const { modelsInfoMock } = vi.hoisted(() => ({
  modelsInfoMock: vi.fn(() => [] as { id: string; name: string; hasAPIKey: boolean }[]),
}));

vi.mock("lib/ai/models", () => ({
  customModelProvider: {
    get modelsInfo() {
      return modelsInfoMock();
    },
  },
}));

describe("GET /api/chat/models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 200 status", async () => {
    modelsInfoMock.mockReturnValue([{ id: "openai/gpt-4o", name: "GPT-4o", hasAPIKey: true }]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns all models from provider", async () => {
    modelsInfoMock.mockReturnValue([
      { id: "openai/gpt-4o", name: "GPT-4o", hasAPIKey: true },
      { id: "anthropic/claude-3-5", name: "Claude 3.5", hasAPIKey: false },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it("places API-key models before non-API-key models", async () => {
    modelsInfoMock.mockReturnValue([
      { id: "anthropic/claude-3-5", name: "Claude 3.5", hasAPIKey: false },
      { id: "openai/gpt-4o", name: "GPT-4o", hasAPIKey: true },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body[0].hasAPIKey).toBe(true);
    expect(body[1].hasAPIKey).toBe(false);
  });

  it("places all API-key models before all non-API-key models when mixed", async () => {
    modelsInfoMock.mockReturnValue([
      { id: "m1", name: "M1", hasAPIKey: false },
      { id: "m2", name: "M2", hasAPIKey: true },
      { id: "m3", name: "M3", hasAPIKey: false },
      { id: "m4", name: "M4", hasAPIKey: true },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    const firstFalse = body.findIndex((m: { hasAPIKey: boolean }) => !m.hasAPIKey);
    for (let i = firstFalse; i < body.length; i++) {
      expect(body[i].hasAPIKey).toBe(false);
    }
  });

  it("returns empty array when no models exist", async () => {
    modelsInfoMock.mockReturnValue([]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns single model correctly", async () => {
    modelsInfoMock.mockReturnValue([
      { id: "openai/gpt-4o", name: "GPT-4o", hasAPIKey: true },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("openai/gpt-4o");
  });

  it("model objects contain id, name, hasAPIKey fields", async () => {
    modelsInfoMock.mockReturnValue([
      { id: "openai/gpt-4o", name: "GPT-4o", hasAPIKey: true },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body[0]).toHaveProperty("id");
    expect(body[0]).toHaveProperty("name");
    expect(body[0]).toHaveProperty("hasAPIKey");
  });

  it("stable: models with same hasAPIKey keep their relative order", async () => {
    modelsInfoMock.mockReturnValue([
      { id: "m-a", name: "A", hasAPIKey: true },
      { id: "m-b", name: "B", hasAPIKey: true },
      { id: "m-c", name: "C", hasAPIKey: true },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body.map((m: { id: string }) => m.id)).toEqual(["m-a", "m-b", "m-c"]);
  });

  it("all non-API-key models stay in relative order at end", async () => {
    modelsInfoMock.mockReturnValue([
      { id: "free-1", name: "Free 1", hasAPIKey: false },
      { id: "paid-1", name: "Paid 1", hasAPIKey: true },
      { id: "free-2", name: "Free 2", hasAPIKey: false },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body[0].id).toBe("paid-1");
    const freeModels = body.filter((m: { hasAPIKey: boolean }) => !m.hasAPIKey);
    expect(freeModels.map((m: { id: string }) => m.id)).toEqual(["free-1", "free-2"]);
  });
});

describe("GET /api/chat/models — additional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("response body is a direct array (not wrapped in object)", async () => {
    modelsInfoMock.mockReturnValue([{ id: "m1", name: "M1", hasAPIKey: true }]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("all-false hasAPIKey list preserves original order", async () => {
    modelsInfoMock.mockReturnValue([
      { id: "m-x", name: "X", hasAPIKey: false },
      { id: "m-y", name: "Y", hasAPIKey: false },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body.map((m: { id: string }) => m.id)).toEqual(["m-x", "m-y"]);
  });

  it("all-true hasAPIKey list preserves original order", async () => {
    modelsInfoMock.mockReturnValue([
      { id: "m-p", name: "P", hasAPIKey: true },
      { id: "m-q", name: "Q", hasAPIKey: true },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body.map((m: { id: string }) => m.id)).toEqual(["m-p", "m-q"]);
  });

  it("three models: one api-key, two non-api-key, api-key sorts first", async () => {
    modelsInfoMock.mockReturnValue([
      { id: "free-a", name: "Free A", hasAPIKey: false },
      { id: "free-b", name: "Free B", hasAPIKey: false },
      { id: "paid-a", name: "Paid A", hasAPIKey: true },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body[0].id).toBe("paid-a");
  });

  it("model count matches provider list length", async () => {
    const models = Array.from({ length: 5 }, (_, i) => ({
      id: `model-${i}`,
      name: `Model ${i}`,
      hasAPIKey: i % 2 === 0,
    }));
    modelsInfoMock.mockReturnValue(models);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(5);
  });
});

describe("GET /api/chat/models — response shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("GET always returns 200 (unauthenticated endpoint)", async () => {
    modelsInfoMock.mockReturnValue([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("response is a Response instance", async () => {
    modelsInfoMock.mockReturnValue([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res).toBeInstanceOf(Response);
  });

  it("id field is a string in each model", async () => {
    modelsInfoMock.mockReturnValue([{ id: "openai/gpt-4o", name: "GPT-4o", hasAPIKey: true }]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(typeof body[0].id).toBe("string");
  });

  it("hasAPIKey field is a boolean in each model", async () => {
    modelsInfoMock.mockReturnValue([{ id: "m1", name: "M1", hasAPIKey: false }]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(typeof body[0].hasAPIKey).toBe("boolean");
  });

  it("name field is a string in each model", async () => {
    modelsInfoMock.mockReturnValue([{ id: "m1", name: "Model One", hasAPIKey: true }]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(typeof body[0].name).toBe("string");
  });
});

describe("GET /api/chat/models — edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("api-key model sorts before non-api-key when provided in reverse order", async () => {
    modelsInfoMock.mockReturnValue([
      { id: "free-only", name: "Free", hasAPIKey: false },
      { id: "paid-only", name: "Paid", hasAPIKey: true },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body[0].id).toBe("paid-only");
    expect(body[1].id).toBe("free-only");
  });

  it("model count equals the input list length", async () => {
    modelsInfoMock.mockReturnValue([
      { id: "m1", name: "M1", hasAPIKey: true },
      { id: "m2", name: "M2", hasAPIKey: false },
      { id: "m3", name: "M3", hasAPIKey: true },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(3);
  });

  it("response is always a Response instance for empty model list", async () => {
    modelsInfoMock.mockReturnValue([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res).toBeInstanceOf(Response);
  });

  it("endpoint is public — returns 200 with no auth required", async () => {
    modelsInfoMock.mockReturnValue([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
  });
});
