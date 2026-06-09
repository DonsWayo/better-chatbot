import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "better-auth";

// Mock date-fns to produce deterministic output
vi.mock("date-fns", () => ({
  format: vi.fn(() => "Monday, January 1, 2024 at 12:00:00 PM"),
}));

vi.mock("./mcp/mcp-tool-id", () => ({
  createMCPToolId: vi.fn((server: string, tool: string) => `${server}::${tool}`),
}));

import {
  CREATE_THREAD_TITLE_PROMPT,
  buildAgentGenerationPrompt,
  buildUserSystemPrompt,
  buildMcpServerCustomizationsSystemPrompt,
  generateExampleToolSchemaPrompt,
  MANUAL_REJECT_RESPONSE_PROMPT,
  buildToolCallUnsupportedModelSystemPrompt,
} from "./prompts";

const makeUser = (partial: Partial<User> = {}): User =>
  ({
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  }) as User;

describe("CREATE_THREAD_TITLE_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof CREATE_THREAD_TITLE_PROMPT).toBe("string");
    expect(CREATE_THREAD_TITLE_PROMPT.length).toBeGreaterThan(0);
  });

  it("mentions 80-character limit", () => {
    expect(CREATE_THREAD_TITLE_PROMPT).toContain("80");
  });
});

describe("buildAgentGenerationPrompt", () => {
  it("includes all tool names in the output", () => {
    const tools = ["search-web", "run-code", "read-file"];
    const result = buildAgentGenerationPrompt(tools);
    expect(result).toContain("- search-web");
    expect(result).toContain("- run-code");
    expect(result).toContain("- read-file");
  });

  it("returns a non-empty string for empty tool list", () => {
    const result = buildAgentGenerationPrompt([]);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("contains key output fields description", () => {
    const result = buildAgentGenerationPrompt(["tool-a"]);
    expect(result).toContain("name:");
    expect(result).toContain("instructions:");
    expect(result).toContain("tools:");
  });
});

describe("buildUserSystemPrompt", () => {
  it("includes assistant name in prompt", () => {
    const user = makeUser({ name: "Alice" });
    const result = buildUserSystemPrompt(user);
    expect(result).toContain("better-chatbot");
  });

  it("uses botName from userPreferences when set", () => {
    const user = makeUser();
    const result = buildUserSystemPrompt(user, { botName: "MyBot" } as Parameters<typeof buildUserSystemPrompt>[1]);
    expect(result).toContain("MyBot");
  });

  it("uses agent name when agent is provided", () => {
    const user = makeUser();
    const agent = {
      id: "agent-1",
      name: "ResearchBot",
      instructions: { role: "researcher", systemPrompt: "Do research." },
    } as Parameters<typeof buildUserSystemPrompt>[2];
    const result = buildUserSystemPrompt(user, undefined, agent);
    expect(result).toContain("ResearchBot");
    expect(result).toContain("researcher");
  });

  it("includes agent system prompt in core instructions", () => {
    const user = makeUser();
    const agent = {
      id: "agent-2",
      name: "CodeBot",
      instructions: { role: "developer", systemPrompt: "Write clean code." },
    } as Parameters<typeof buildUserSystemPrompt>[2];
    const result = buildUserSystemPrompt(user, undefined, agent);
    expect(result).toContain("Write clean code.");
  });

  it("includes user name in user information section", () => {
    const user = makeUser({ name: "Bob", email: "bob@test.com" });
    const result = buildUserSystemPrompt(user);
    expect(result).toContain("Bob");
  });

  it("includes user email in user information section", () => {
    const user = makeUser({ email: "alice@example.com" });
    const result = buildUserSystemPrompt(user);
    expect(result).toContain("alice@example.com");
  });

  it("includes user profession when set", () => {
    const user = makeUser();
    const prefs = { profession: "Software Engineer" } as Parameters<typeof buildUserSystemPrompt>[1];
    const result = buildUserSystemPrompt(user, prefs);
    expect(result).toContain("Software Engineer");
  });

  it("includes display name in communication preferences", () => {
    const user = makeUser({ name: "Charlie" });
    const result = buildUserSystemPrompt(user);
    expect(result).toContain("Charlie");
  });

  it("includes response style example when set", () => {
    const user = makeUser();
    const prefs = { responseStyleExample: "Be brief and direct." } as Parameters<typeof buildUserSystemPrompt>[1];
    const result = buildUserSystemPrompt(user, prefs);
    expect(result).toContain("Be brief and direct.");
  });

  it("works with no user, no preferences, no agent", () => {
    const result = buildUserSystemPrompt(undefined as unknown as User);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns a trimmed string (no leading/trailing whitespace)", () => {
    const user = makeUser();
    const result = buildUserSystemPrompt(user);
    expect(result).toBe(result.trim());
  });
});

describe("buildMcpServerCustomizationsSystemPrompt", () => {
  it("returns empty string when no instructions", () => {
    const result = buildMcpServerCustomizationsSystemPrompt({});
    expect(result).toBe("");
  });

  it("returns empty string when all entries have no prompt and no tools", () => {
    const result = buildMcpServerCustomizationsSystemPrompt({
      s1: { name: "Server1", prompt: "", tools: {} },
    });
    expect(result).toBe("");
  });

  it("includes server prompt in output", () => {
    const result = buildMcpServerCustomizationsSystemPrompt({
      s1: { name: "MyServer", prompt: "Always use JSON." },
    });
    expect(result).toContain("Always use JSON.");
    expect(result).toContain("MyServer");
  });

  it("includes tool customization using createMCPToolId format", () => {
    const result = buildMcpServerCustomizationsSystemPrompt({
      s1: {
        name: "MyServer",
        tools: { myTool: "Always validate inputs." },
      },
    });
    expect(result).toContain("Always validate inputs.");
    expect(result).toContain("MyServer::myTool");
  });

  it("contains 'Tool Usage Guidelines' header when non-empty", () => {
    const result = buildMcpServerCustomizationsSystemPrompt({
      s1: { name: "Srv", prompt: "Do something." },
    });
    expect(result).toContain("Tool Usage Guidelines");
  });

  it("handles multiple servers", () => {
    const result = buildMcpServerCustomizationsSystemPrompt({
      s1: { name: "Server1", prompt: "Prompt A." },
      s2: { name: "Server2", prompt: "Prompt B." },
    });
    expect(result).toContain("Prompt A.");
    expect(result).toContain("Prompt B.");
  });
});

describe("generateExampleToolSchemaPrompt", () => {
  it("includes tool name in output", () => {
    const result = generateExampleToolSchemaPrompt({
      toolInfo: { name: "my-tool", description: "Does something cool." },
    });
    expect(result).toContain("my-tool");
  });

  it("includes tool description in output", () => {
    const result = generateExampleToolSchemaPrompt({
      toolInfo: { name: "x", description: "Fetches weather data." },
    });
    expect(result).toContain("Fetches weather data.");
  });

  it("uses custom prompt when provided", () => {
    const result = generateExampleToolSchemaPrompt({
      toolInfo: { name: "x", description: "y" },
      prompt: "Custom instructions here.",
    });
    expect(result).toContain("Custom instructions here.");
  });

  it("includes default steps when no custom prompt", () => {
    const result = generateExampleToolSchemaPrompt({
      toolInfo: { name: "x", description: "y" },
    });
    expect(result).toContain("Step 1");
    expect(result).toContain("Step 2");
  });
});

describe("MANUAL_REJECT_RESPONSE_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof MANUAL_REJECT_RESPONSE_PROMPT).toBe("string");
    expect(MANUAL_REJECT_RESPONSE_PROMPT.length).toBeGreaterThan(0);
  });

  it("is trimmed", () => {
    expect(MANUAL_REJECT_RESPONSE_PROMPT).toBe(MANUAL_REJECT_RESPONSE_PROMPT.trim());
  });

  it("mentions three alternatives", () => {
    expect(MANUAL_REJECT_RESPONSE_PROMPT).toContain("three");
  });
});

describe("buildToolCallUnsupportedModelSystemPrompt", () => {
  it("is a non-empty string", () => {
    expect(typeof buildToolCallUnsupportedModelSystemPrompt).toBe("string");
    expect(buildToolCallUnsupportedModelSystemPrompt.length).toBeGreaterThan(0);
  });

  it("mentions tool calls / tool call limitation", () => {
    expect(buildToolCallUnsupportedModelSystemPrompt.toLowerCase()).toContain("tool");
  });

  it("is trimmed", () => {
    expect(buildToolCallUnsupportedModelSystemPrompt).toBe(
      buildToolCallUnsupportedModelSystemPrompt.trim(),
    );
  });
});
