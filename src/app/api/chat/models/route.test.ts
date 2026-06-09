import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { customModelProviderMock } = vi.hoisted(() => ({
  customModelProviderMock: {
    modelsInfo: [
      { id: "gpt-4", hasAPIKey: true, name: "GPT-4" },
      { id: "gemini", hasAPIKey: false, name: "Gemini" },
      { id: "claude", hasAPIKey: true, name: "Claude" },
    ],
  },
}));

vi.mock("lib/ai/models", () => ({
  customModelProvider: customModelProviderMock,
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/chat/models", () => {
  it("returns 200 with models list", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("sorts models with hasAPIKey=true first", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body[0].hasAPIKey).toBe(true);
    expect(body[1].hasAPIKey).toBe(true);
    expect(body[2].hasAPIKey).toBe(false);
  });

  it("returns all models", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(3);
  });

  it("requires no authentication", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns JSON content type", async () => {
    const res = await GET();
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("models with hasAPIKey=false appear after those with hasAPIKey=true", async () => {
    const res = await GET();
    const body = await res.json() as { hasAPIKey: boolean }[];
    const firstFalseIdx = body.findIndex((m) => m.hasAPIKey === false);
    const lastTrueIdx = body.reduce((acc, m, i) => (m.hasAPIKey ? i : acc), -1);
    if (firstFalseIdx !== -1 && lastTrueIdx !== -1) {
      expect(lastTrueIdx).toBeLessThan(firstFalseIdx);
    }
  });

  it("sort is stable: original order within same-key group preserved", async () => {
    const res = await GET();
    const body = await res.json() as { id: string; hasAPIKey: boolean }[];
    const trueItems = body.filter((m) => m.hasAPIKey);
    expect(trueItems.map((m) => m.id)).toEqual(["gpt-4", "claude"]);
  });

  it("returns empty array when modelsInfo is empty", async () => {
    customModelProviderMock.modelsInfo = [];
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual([]);
    customModelProviderMock.modelsInfo = [
      { id: "gpt-4", hasAPIKey: true, name: "GPT-4" },
      { id: "gemini", hasAPIKey: false, name: "Gemini" },
      { id: "claude", hasAPIKey: true, name: "Claude" },
    ];
  });

  it("returns single model when only one present", async () => {
    customModelProviderMock.modelsInfo = [{ id: "gpt-4", hasAPIKey: true, name: "GPT-4" }];
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveLength(1);
    customModelProviderMock.modelsInfo = [
      { id: "gpt-4", hasAPIKey: true, name: "GPT-4" },
      { id: "gemini", hasAPIKey: false, name: "Gemini" },
      { id: "claude", hasAPIKey: true, name: "Claude" },
    ];
  });

  it("each model has id and name fields", async () => {
    const res = await GET();
    const body = await res.json() as { id: string; name: string }[];
    for (const m of body) {
      expect(m).toHaveProperty("id");
      expect(m).toHaveProperty("name");
    }
  });

  it("all models from modelsInfo are in the response", async () => {
    const res = await GET();
    const body = await res.json() as { id: string }[];
    const ids = body.map((m) => m.id);
    expect(ids).toContain("gpt-4");
    expect(ids).toContain("gemini");
    expect(ids).toContain("claude");
  });

  it("hasAPIKey=false models have that value in response", async () => {
    const res = await GET();
    const body = await res.json() as { id: string; hasAPIKey: boolean }[];
    const gemini = body.find((m) => m.id === "gemini");
    expect(gemini?.hasAPIKey).toBe(false);
  });
});
