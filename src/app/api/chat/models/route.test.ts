import { describe, it, expect, vi } from "vitest";

vi.mock("lib/ai/models", () => ({
  customModelProvider: {
    modelsInfo: [
      { id: "openai/gpt-4o", name: "GPT-4o", hasAPIKey: true },
      { id: "anthropic/claude-3-5", name: "Claude 3.5", hasAPIKey: false },
    ],
  },
}));

describe("GET /api/chat/models", () => {
  it("returns sorted models list with API-key models first", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].hasAPIKey).toBe(true);
    expect(body[1].hasAPIKey).toBe(false);
  });
});
