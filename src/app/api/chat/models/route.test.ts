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
    // No session mock needed — this route has no auth gate
    const res = await GET();
    expect(res.status).toBe(200);
  });
});
