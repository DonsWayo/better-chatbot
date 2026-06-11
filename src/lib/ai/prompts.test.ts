import type { MCPToolInfo } from "app-types/mcp";
import { describe, expect, it } from "vitest";
import {
  CREATE_THREAD_TITLE_PROMPT,
  MANUAL_REJECT_RESPONSE_PROMPT,
  buildAgentGenerationPrompt,
  buildMcpServerCustomizationsSystemPrompt,
  buildToolCallUnsupportedModelSystemPrompt,
  buildUserSystemPrompt,
  generateExampleToolSchemaPrompt,
  sanitizeTitle,
} from "./prompts";

describe("CREATE_THREAD_TITLE_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof CREATE_THREAD_TITLE_PROMPT).toBe("string");
    expect(CREATE_THREAD_TITLE_PROMPT.length).toBeGreaterThan(0);
  });

  it("mentions 80 character limit", () => {
    expect(CREATE_THREAD_TITLE_PROMPT).toContain("80");
  });

  it("is refusal-proofed (instructs the model to never refuse or respond)", () => {
    expect(CREATE_THREAD_TITLE_PROMPT).toMatch(/never refuse/i);
    expect(CREATE_THREAD_TITLE_PROMPT).toMatch(/not responding/i);
  });
});

describe("sanitizeTitle", () => {
  const MESSAGE = "Remember that I am the Head of Software Development.";

  it("passes a normal title through (trimmed)", () => {
    expect(sanitizeTitle("  User Role Memory Request \n", MESSAGE)).toBe(
      "User Role Memory Request",
    );
  });

  it("replaces a refusal title with a truncation of the user's message", () => {
    expect(
      sanitizeTitle("I'm sorry, but I cannot assist with t", MESSAGE),
    ).toBe(MESSAGE.slice(0, 80));
  });

  it.each([
    "I'm sorry, I can't help with that",
    "I cannot assist with this request",
    "Sorry, that is not possible",
    "I am unable to comply",
    "I can't assist with that",
    "I can’t assist with that", // curly apostrophe
  ])("detects refusal phrasing: %s", (refusal) => {
    expect(sanitizeTitle(refusal, MESSAGE)).toBe(MESSAGE);
  });

  it("replaces an empty/whitespace title with the fallback", () => {
    expect(sanitizeTitle("", MESSAGE)).toBe(MESSAGE);
    expect(sanitizeTitle("   \n", MESSAGE)).toBe(MESSAGE);
  });

  it("truncates the fallback to 80 chars and collapses whitespace", () => {
    const long = `${"word ".repeat(40)}end`;
    const result = sanitizeTitle("", `  ${long.replace(/ /g, "  ")}  `);
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result).not.toMatch(/\s{2,}/);
  });

  it("clamps an over-long model title to 80 chars", () => {
    expect(sanitizeTitle("x".repeat(120), MESSAGE)).toHaveLength(80);
  });

  it("falls back to 'New Chat' when both title and message are empty", () => {
    expect(sanitizeTitle("", "   ")).toBe("New Chat");
  });

  it("does not flag legitimate titles containing benign words", () => {
    expect(sanitizeTitle("Sorting algorithms compared", MESSAGE)).toBe(
      "Sorting algorithms compared",
    );
  });
});

describe("buildAgentGenerationPrompt", () => {
  it("includes each tool name in the prompt", () => {
    const prompt = buildAgentGenerationPrompt(["web_search", "create_table"]);
    expect(prompt).toContain("web_search");
    expect(prompt).toContain("create_table");
  });

  it("returns empty tool list section when no tools given", () => {
    const prompt = buildAgentGenerationPrompt([]);
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("mentions required output fields", () => {
    const prompt = buildAgentGenerationPrompt([]);
    expect(prompt).toContain("name");
    expect(prompt).toContain("description");
    expect(prompt).toContain("instructions");
  });
});

describe("buildUserSystemPrompt", () => {
  it("defaults to Conek AI when no agent or preferences given", () => {
    const prompt = buildUserSystemPrompt();
    expect(prompt).toContain("You are Conek AI");
  });

  it("uses agent name when provided", () => {
    const prompt = buildUserSystemPrompt(undefined, undefined, {
      name: "DataBot",
    } as any);
    expect(prompt).toContain("You are DataBot");
  });

  it("uses userPreferences botName as fallback", () => {
    const prompt = buildUserSystemPrompt(undefined, {
      botName: "MyBot",
    } as any);
    expect(prompt).toContain("You are MyBot");
  });

  it("includes agent role when provided", () => {
    const prompt = buildUserSystemPrompt(undefined, undefined, {
      name: "Agent",
      instructions: { role: "data analysis" },
    } as any);
    expect(prompt).toContain("expert in data analysis");
  });

  it("includes agent systemPrompt in core capabilities block", () => {
    const prompt = buildUserSystemPrompt(undefined, undefined, {
      name: "Agent",
      instructions: { systemPrompt: "Always be concise." },
    } as any);
    expect(prompt).toContain("<core_capabilities>");
    expect(prompt).toContain("Always be concise.");
  });

  it("includes user name and email when provided", () => {
    const prompt = buildUserSystemPrompt({
      name: "Alice",
      email: "alice@example.com",
    } as any);
    expect(prompt).toContain("Name: Alice");
    expect(prompt).toContain("Email: alice@example.com");
    expect(prompt).toContain("<user_information>");
  });

  it("includes profession from preferences", () => {
    const prompt = buildUserSystemPrompt(undefined, {
      profession: "Software Engineer",
    } as any);
    expect(prompt).toContain("Profession: Software Engineer");
  });

  it("includes communication_preferences when displayName present", () => {
    const prompt = buildUserSystemPrompt(
      { name: "Bob" } as any,
      { displayName: "Bobby" } as any,
    );
    expect(prompt).toContain("<communication_preferences>");
    expect(prompt).toContain('"Bobby"');
  });

  it("includes response style example when provided", () => {
    const prompt = buildUserSystemPrompt(undefined, {
      responseStyleExample: "Be very formal.",
    } as any);
    expect(prompt).toContain("Be very formal.");
  });

  it("includes tool_usage_policy block", () => {
    const prompt = buildUserSystemPrompt();
    expect(prompt).toContain("<tool_usage_policy>");
  });

  it("omits user_information block when no user data", () => {
    const prompt = buildUserSystemPrompt();
    expect(prompt).not.toContain("<user_information>");
  });
});

describe("buildMcpServerCustomizationsSystemPrompt", () => {
  it("returns empty string when no instructions", () => {
    const result = buildMcpServerCustomizationsSystemPrompt({});
    expect(result).toBe("");
  });

  it("returns empty string when servers have no prompts", () => {
    const result = buildMcpServerCustomizationsSystemPrompt({
      server1: { name: "Server1", id: "s1", prompt: "", tools: {} },
    });
    expect(result).toBe("");
  });

  it("includes server prompt when present", () => {
    const result = buildMcpServerCustomizationsSystemPrompt({
      s1: { name: "MyServer", id: "s1", prompt: "Always use metric units." },
    });
    expect(result).toContain("MyServer");
    expect(result).toContain("Always use metric units.");
  });

  it("includes tool-level prompts", () => {
    const result = buildMcpServerCustomizationsSystemPrompt({
      s1: {
        name: "SearchSrv",
        id: "s1",
        prompt: "",
        tools: { search_web: "Prefer news sources." },
      },
    });
    expect(result).toContain("Prefer news sources.");
    expect(result).toContain("### Tool Usage Guidelines");
  });

  it("handles multiple servers", () => {
    const result = buildMcpServerCustomizationsSystemPrompt({
      s1: { name: "A", id: "s1", prompt: "Prompt A." },
      s2: { name: "B", id: "s2", prompt: "Prompt B." },
    });
    expect(result).toContain("Prompt A.");
    expect(result).toContain("Prompt B.");
  });
});

describe("generateExampleToolSchemaPrompt", () => {
  it("includes tool name and description", () => {
    const result = generateExampleToolSchemaPrompt({
      toolInfo: {
        name: "search_web",
        description: "Search the internet",
        inputSchema: {} as any,
      },
    });
    expect(result).toContain("search_web");
    expect(result).toContain("Search the internet");
  });

  it("uses custom prompt when provided", () => {
    const result = generateExampleToolSchemaPrompt({
      toolInfo: { name: "tool", description: "desc", inputSchema: {} as any },
      prompt: "Generate a test payload.",
    });
    expect(result).toContain("Generate a test payload.");
  });
});

describe("MANUAL_REJECT_RESPONSE_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(MANUAL_REJECT_RESPONSE_PROMPT.length).toBeGreaterThan(0);
  });

  it("mentions three alternatives", () => {
    expect(MANUAL_REJECT_RESPONSE_PROMPT).toContain("three alternatives");
  });
});

describe("buildToolCallUnsupportedModelSystemPrompt", () => {
  it("is a non-empty string", () => {
    expect(buildToolCallUnsupportedModelSystemPrompt.length).toBeGreaterThan(0);
  });

  it("mentions tool call limitation", () => {
    expect(buildToolCallUnsupportedModelSystemPrompt).toContain(
      "Tool Call Limitation",
    );
  });
});

describe("buildUserSystemPrompt — additional", () => {
  it("returns a non-empty string", () => {
    const prompt = buildUserSystemPrompt();
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("includes the current date and time sentence", () => {
    const prompt = buildUserSystemPrompt();
    expect(prompt).toContain("The current date and time is");
  });

  it("agent name takes priority over userPreferences botName", () => {
    const prompt = buildUserSystemPrompt(
      undefined,
      { botName: "PrefBot" } as any,
      { name: "AgentName", instructions: {} } as any,
    );
    expect(prompt).toContain("You are AgentName");
    expect(prompt).not.toContain("You are PrefBot");
  });

  it("includes agent name in prompt when agent is defined", () => {
    const prompt = buildUserSystemPrompt(undefined, undefined, {
      name: "SearchBot",
    } as any);
    expect(prompt).toContain("SearchBot");
  });
});

describe("buildMcpServerCustomizationsSystemPrompt — additional", () => {
  it("returns non-empty string when a server has a prompt", () => {
    const result = buildMcpServerCustomizationsSystemPrompt({
      s1: { name: "Server1", id: "s1", prompt: "Custom server instructions." },
    });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns empty string for empty object input", () => {
    const result = buildMcpServerCustomizationsSystemPrompt({});
    expect(result).toBe("");
  });

  it("skips servers with no prompt and no tool prompts", () => {
    const result = buildMcpServerCustomizationsSystemPrompt({
      s1: { name: "Silent", id: "s1", prompt: "", tools: {} },
    });
    expect(result).toBe("");
  });

  it("includes tool name when tool prompt is non-empty", () => {
    const result = buildMcpServerCustomizationsSystemPrompt({
      s1: {
        name: "ToolSrv",
        id: "s1",
        prompt: "",
        tools: { my_tool: "Use sparingly." },
      },
    });
    expect(result).toContain("my_tool");
    expect(result).toContain("Use sparingly.");
  });
});

describe("prompt builders — return type invariants", () => {
  it("buildUserSystemPrompt always returns a string", () => {
    expect(
      typeof buildUserSystemPrompt({ name: "Alice", role: "user" } as any),
    ).toBe("string");
  });

  it("buildMcpServerCustomizationsSystemPrompt always returns a string", () => {
    expect(typeof buildMcpServerCustomizationsSystemPrompt({})).toBe("string");
  });

  it("generateExampleToolSchemaPrompt always returns a string", () => {
    const result = generateExampleToolSchemaPrompt({
      toolInfo: {
        name: "tool",
        description: "desc",
        inputSchema: {} as unknown as MCPToolInfo["inputSchema"],
      },
    });
    expect(typeof result).toBe("string");
  });

  it("MANUAL_REJECT_RESPONSE_PROMPT is a non-empty string", () => {
    expect(typeof MANUAL_REJECT_RESPONSE_PROMPT).toBe("string");
    expect(MANUAL_REJECT_RESPONSE_PROMPT.length).toBeGreaterThan(0);
  });
});
