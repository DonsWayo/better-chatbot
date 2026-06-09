import { describe, it, expect } from "vitest";
import {
  AgentInstructionsSchema,
  AgentCreateSchema,
  AgentUpdateSchema,
  AgentQuerySchema,
  AgentGenerateSchema,
} from "./agent";

describe("AgentInstructionsSchema", () => {
  it("accepts empty object (all optional)", () => {
    const r = AgentInstructionsSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts role only", () => {
    const r = AgentInstructionsSchema.safeParse({ role: "Customer support agent" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.role).toBe("Customer support agent");
  });

  it("accepts systemPrompt only", () => {
    const r = AgentInstructionsSchema.safeParse({
      systemPrompt: "You are a helpful assistant.",
    });
    expect(r.success).toBe(true);
  });

  it("accepts mentions array", () => {
    const r = AgentInstructionsSchema.safeParse({
      mentions: [{ type: "defaultTool", name: "web_search", label: "Web Search" }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid mention type", () => {
    const r = AgentInstructionsSchema.safeParse({
      mentions: [{ type: "invalid" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("AgentCreateSchema", () => {
  const minimalValid = {
    name: "My Agent",
    userId: "user-1",
    instructions: {},
  };

  it("accepts minimal valid input", () => {
    const r = AgentCreateSchema.safeParse(minimalValid);
    expect(r.success).toBe(true);
  });

  it("defaults visibility to private", () => {
    const r = AgentCreateSchema.safeParse(minimalValid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.visibility).toBe("private");
  });

  it("accepts public visibility", () => {
    const r = AgentCreateSchema.safeParse({ ...minimalValid, visibility: "public" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.visibility).toBe("public");
  });

  it("accepts readonly visibility", () => {
    const r = AgentCreateSchema.safeParse({ ...minimalValid, visibility: "readonly" });
    expect(r.success).toBe(true);
  });

  it("accepts optional description", () => {
    const r = AgentCreateSchema.safeParse({
      ...minimalValid,
      description: "A helpful agent",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.description).toBe("A helpful agent");
  });

  it("rejects description over 8000 characters", () => {
    const r = AgentCreateSchema.safeParse({
      ...minimalValid,
      description: "x".repeat(8001),
    });
    expect(r.success).toBe(false);
  });

  it("accepts emoji icon", () => {
    const r = AgentCreateSchema.safeParse({
      ...minimalValid,
      icon: { type: "emoji", value: "🤖" },
    });
    expect(r.success).toBe(true);
  });

  it("accepts emoji icon with style", () => {
    const r = AgentCreateSchema.safeParse({
      ...minimalValid,
      icon: { type: "emoji", value: "🤖", style: { color: "blue" } },
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid icon type", () => {
    const r = AgentCreateSchema.safeParse({
      ...minimalValid,
      icon: { type: "image", value: "url" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty name", () => {
    const r = AgentCreateSchema.safeParse({ ...minimalValid, name: "" });
    expect(r.success).toBe(false);
  });

  it("rejects name over 100 characters", () => {
    const r = AgentCreateSchema.safeParse({ ...minimalValid, name: "a".repeat(101) });
    expect(r.success).toBe(false);
  });

  it("rejects missing userId", () => {
    const r = AgentCreateSchema.safeParse({ name: "Agent", instructions: {} });
    expect(r.success).toBe(false);
  });

  it("strips unknown fields", () => {
    const r = AgentCreateSchema.safeParse({ ...minimalValid, unknownField: "value" });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as Record<string, unknown>).unknownField).toBeUndefined();
  });
});

describe("AgentUpdateSchema", () => {
  it("accepts empty object (all optional)", () => {
    const r = AgentUpdateSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts name update", () => {
    const r = AgentUpdateSchema.safeParse({ name: "Updated Agent" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe("Updated Agent");
  });

  it("accepts instructions update", () => {
    const r = AgentUpdateSchema.safeParse({
      instructions: { role: "New role", systemPrompt: "New prompt" },
    });
    expect(r.success).toBe(true);
  });

  it("accepts visibility update", () => {
    const r = AgentUpdateSchema.safeParse({ visibility: "public" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.visibility).toBe("public");
  });

  it("rejects empty name when provided", () => {
    const r = AgentUpdateSchema.safeParse({ name: "" });
    expect(r.success).toBe(false);
  });

  it("strips unknown fields", () => {
    const r = AgentUpdateSchema.safeParse({ name: "Agent", extra: true });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as Record<string, unknown>).extra).toBeUndefined();
  });
});

describe("AgentQuerySchema", () => {
  it("defaults type to all", () => {
    const r = AgentQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.type).toBe("all");
  });

  it("defaults limit to 50", () => {
    const r = AgentQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(50);
  });

  it('accepts type "mine"', () => {
    const r = AgentQuerySchema.safeParse({ type: "mine" });
    expect(r.success).toBe(true);
  });

  it('accepts type "shared"', () => {
    const r = AgentQuerySchema.safeParse({ type: "shared" });
    expect(r.success).toBe(true);
  });

  it('accepts type "bookmarked"', () => {
    const r = AgentQuerySchema.safeParse({ type: "bookmarked" });
    expect(r.success).toBe(true);
  });

  it("rejects invalid type", () => {
    const r = AgentQuerySchema.safeParse({ type: "recent" });
    expect(r.success).toBe(false);
  });

  it("accepts custom limit via string coercion", () => {
    const r = AgentQuerySchema.safeParse({ limit: "25" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(25);
  });

  it("rejects limit of 0 (min 1)", () => {
    const r = AgentQuerySchema.safeParse({ limit: 0 });
    expect(r.success).toBe(false);
  });

  it("rejects limit over 100", () => {
    const r = AgentQuerySchema.safeParse({ limit: 101 });
    expect(r.success).toBe(false);
  });

  it("accepts optional filters string", () => {
    const r = AgentQuerySchema.safeParse({ filters: "tag:ai" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.filters).toBe("tag:ai");
  });
});

describe("AgentGenerateSchema", () => {
  const validInput = {
    name: "My Agent",
    description: "Does things",
    instructions: "Be helpful",
    role: "Assistant",
  };

  it("accepts valid input", () => {
    const r = AgentGenerateSchema.safeParse(validInput);
    expect(r.success).toBe(true);
  });

  it("defaults tools to empty array", () => {
    const r = AgentGenerateSchema.safeParse(validInput);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tools).toEqual([]);
  });

  it("accepts tools list", () => {
    const r = AgentGenerateSchema.safeParse({ ...validInput, tools: ["web_search", "calculator"] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tools).toEqual(["web_search", "calculator"]);
  });

  it("rejects missing name", () => {
    const { name: _, ...rest } = validInput;
    const r = AgentGenerateSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("rejects missing description", () => {
    const { description: _, ...rest } = validInput;
    const r = AgentGenerateSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("rejects missing instructions", () => {
    const { instructions: _, ...rest } = validInput;
    const r = AgentGenerateSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("rejects missing role", () => {
    const { role: _, ...rest } = validInput;
    const r = AgentGenerateSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });
});
