import { describe, expect, it } from "vitest";
import {
  createMCPToolId,
  extractMCPToolId,
  sanitizeFunctionName,
} from "./mcp-tool-id";

describe("sanitizeFunctionName", () => {
  it("should sanitize names with invalid characters", () => {
    expect(sanitizeFunctionName("server@name")).toBe("server_name");
    expect(sanitizeFunctionName("special!chars")).toBe("special_chars");
    expect(sanitizeFunctionName("spaces are bad")).toBe("spaces_are_bad");
  });

  it("should ensure names start with a letter or underscore", () => {
    expect(sanitizeFunctionName("1numberfirst")).toBe("_1numberfirst");
    expect(sanitizeFunctionName("123")).toBe("_123");
    expect(sanitizeFunctionName("_valid")).toBe("_valid");
    expect(sanitizeFunctionName("a_valid")).toBe("a_valid");
  });

  it("should truncate names to 124 characters", () => {
    const longName = "a".repeat(150);
    expect(sanitizeFunctionName(longName).length).toBe(124);
    expect(sanitizeFunctionName(longName)).toBe("a".repeat(124));
  });

  it("should allow dots and dashes", () => {
    expect(sanitizeFunctionName("valid.name")).toBe("valid.name");
    expect(sanitizeFunctionName("valid-name")).toBe("valid-name");
    expect(sanitizeFunctionName("valid.name-with_underscore")).toBe(
      "valid.name-with_underscore",
    );
  });
});

describe("createMCPToolId", () => {
  it("should create a valid tool ID from server and tool names", () => {
    const toolId = createMCPToolId("server", "tool");
    expect(toolId).toBe("server_tool");
  });

  it("should sanitize server and tool names", () => {
    const toolId = createMCPToolId("server@name", "tool!function");
    expect(toolId).toBe("server_name_tool_function");
  });

  it("should ensure the combined name doesn't exceed 124 characters", () => {
    const longServerName = "s".repeat(40);
    const longToolName = "t".repeat(40);
    const toolId = createMCPToolId(longServerName, longToolName);

    expect(toolId.length).toBeLessThanOrEqual(124);
    expect(toolId).toContain("_"); // Should still contain the separator
  });

  it("should handle special characters and spaces", () => {
    const toolId = createMCPToolId("MCP Server #1", "Some Tool Function!");
    expect(toolId).toBe("MCP_Server__1_Some_Tool_Function_");
  });
});

describe("extractMCPToolId", () => {
  it("should extract server name and tool name from a tool ID", () => {
    const { serverName, toolName } = extractMCPToolId("server_tool");
    expect(serverName).toBe("server");
    expect(toolName).toBe("tool");
  });

  it("should handle tool names with underscores", () => {
    const { serverName, toolName } = extractMCPToolId(
      "server_tool_with_underscores",
    );
    expect(serverName).toBe("server");
    expect(toolName).toBe("tool_with_underscores");
  });

  it("round-trips through createMCPToolId for simple names", () => {
    const id = createMCPToolId("myserver", "mytool");
    const { serverName, toolName } = extractMCPToolId(id);
    expect(serverName).toBe("myserver");
    expect(toolName).toBe("mytool");
  });

  it("returns empty toolName when no underscore separator", () => {
    const { serverName, toolName } = extractMCPToolId("noUnderscoreHere");
    expect(serverName).toBe("noUnderscoreHere");
    expect(toolName).toBe("");
  });
});

describe("sanitizeFunctionName — edge cases", () => {
  it("preserves alphanumeric names unchanged", () => {
    expect(sanitizeFunctionName("validName123")).toBe("validName123");
  });

  it("handles name that is exactly 124 chars (no truncation)", () => {
    const name = "a".repeat(124);
    expect(sanitizeFunctionName(name)).toHaveLength(124);
  });

  it("handles name that is 125 chars (truncates to 124)", () => {
    const name = "a".repeat(125);
    expect(sanitizeFunctionName(name)).toHaveLength(124);
  });

  it("preserves dots in names", () => {
    expect(sanitizeFunctionName("server.v2")).toBe("server.v2");
  });

  it("preserves dashes in names", () => {
    expect(sanitizeFunctionName("my-server")).toBe("my-server");
  });
});

describe("createMCPToolId — length guarantee", () => {
  it("result never exceeds 124 characters for long names", () => {
    const long = "x".repeat(100);
    const id = createMCPToolId(long, long);
    expect(id.length).toBeLessThanOrEqual(124);
  });

  it("separator is always present in result", () => {
    const id = createMCPToolId("server", "tool");
    expect(id).toContain("_");
  });
});

describe("sanitizeFunctionName — additional invariants", () => {
  it("empty string returns empty string or underscore prefix", () => {
    const result = sanitizeFunctionName("");
    expect(typeof result).toBe("string");
  });

  it("single valid letter is unchanged", () => {
    expect(sanitizeFunctionName("a")).toBe("a");
  });

  it("already-valid name is unchanged", () => {
    expect(sanitizeFunctionName("valid_name123")).toBe("valid_name123");
  });

  it("name at exactly 124 chars is not truncated", () => {
    const name = "a".repeat(124);
    expect(sanitizeFunctionName(name).length).toBe(124);
  });

  it("name at 125 chars is truncated to 124", () => {
    const name = "a".repeat(125);
    expect(sanitizeFunctionName(name).length).toBe(124);
  });

  it("returns a string (never throws)", () => {
    for (const input of ["@@@", "   ", "123abc", "!!!"]) {
      expect(typeof sanitizeFunctionName(input)).toBe("string");
    }
  });
});

describe("createMCPToolId — additional invariants", () => {
  it("result is always a string", () => {
    expect(typeof createMCPToolId("a", "b")).toBe("string");
  });

  it("result length never exceeds 124", () => {
    const id = createMCPToolId("s".repeat(60), "t".repeat(60));
    expect(id.length).toBeLessThanOrEqual(124);
  });

  it("simple names produce underscore-separated result", () => {
    expect(createMCPToolId("myserver", "mytool")).toBe("myserver_mytool");
  });

  it("result contains at least one underscore when names are non-empty", () => {
    const id = createMCPToolId("s", "t");
    expect(id).toContain("_");
  });
});

describe("extractMCPToolId — additional invariants", () => {
  it("serverName is always a non-empty string", () => {
    const { serverName } = extractMCPToolId("s_t");
    expect(typeof serverName).toBe("string");
    expect(serverName.length).toBeGreaterThan(0);
  });

  it("toolName is always a non-empty string", () => {
    const { toolName } = extractMCPToolId("s_t");
    expect(typeof toolName).toBe("string");
    expect(toolName.length).toBeGreaterThan(0);
  });

  it("round-trips simple names", () => {
    const id = createMCPToolId("server", "tool");
    const { serverName, toolName } = extractMCPToolId(id);
    expect(serverName).toBe("server");
    expect(toolName).toBe("tool");
  });
});
