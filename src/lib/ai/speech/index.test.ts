import { describe, it, expect } from "vitest";
import { DEFAULT_VOICE_TOOLS } from "./index";

describe("DEFAULT_VOICE_TOOLS", () => {
  it("is an array with at least one tool", () => {
    expect(Array.isArray(DEFAULT_VOICE_TOOLS)).toBe(true);
    expect(DEFAULT_VOICE_TOOLS.length).toBeGreaterThan(0);
  });

  it("all tools have type 'function'", () => {
    for (const tool of DEFAULT_VOICE_TOOLS) {
      expect(tool.type).toBe("function");
    }
  });

  it("all tools have a name and description", () => {
    for (const tool of DEFAULT_VOICE_TOOLS) {
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it("all tools have parameters with type 'object'", () => {
    for (const tool of DEFAULT_VOICE_TOOLS) {
      expect(tool.parameters.type).toBe("object");
    }
  });

  it("includes 'changeBrowserTheme' tool", () => {
    const tool = DEFAULT_VOICE_TOOLS.find((t) => t.name === "changeBrowserTheme");
    expect(tool).toBeDefined();
  });

  it("changeBrowserTheme has theme parameter with enum", () => {
    const tool = DEFAULT_VOICE_TOOLS.find((t) => t.name === "changeBrowserTheme");
    const themeProp = (tool?.parameters.properties as Record<string, { type: string; enum?: string[] }>)["theme"];
    expect(themeProp.enum).toContain("light");
    expect(themeProp.enum).toContain("dark");
    expect(tool?.parameters.required).toContain("theme");
  });

  it("includes 'endConversation' tool", () => {
    const tool = DEFAULT_VOICE_TOOLS.find((t) => t.name === "endConversation");
    expect(tool).toBeDefined();
  });

  it("endConversation has no required parameters", () => {
    const tool = DEFAULT_VOICE_TOOLS.find((t) => t.name === "endConversation");
    expect(tool?.parameters.required).toEqual([]);
  });

  it("all tool names are unique", () => {
    const names = DEFAULT_VOICE_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("contains exactly 2 tools", () => {
    expect(DEFAULT_VOICE_TOOLS).toHaveLength(2);
  });

  it("changeBrowserTheme has only 'theme' in properties", () => {
    const tool = DEFAULT_VOICE_TOOLS.find((t) => t.name === "changeBrowserTheme");
    const keys = Object.keys(tool?.parameters.properties ?? {});
    expect(keys).toEqual(["theme"]);
  });

  it("endConversation has empty properties object", () => {
    const tool = DEFAULT_VOICE_TOOLS.find((t) => t.name === "endConversation");
    expect(tool?.parameters.properties).toEqual({});
  });

  it("theme enum contains exactly light and dark", () => {
    const tool = DEFAULT_VOICE_TOOLS.find((t) => t.name === "changeBrowserTheme");
    const themeProp = (tool?.parameters.properties as Record<string, { enum?: string[] }>)["theme"];
    expect(themeProp.enum).toHaveLength(2);
    expect(themeProp.enum).toContain("light");
    expect(themeProp.enum).toContain("dark");
  });

  it("endConversation description is non-empty string", () => {
    const tool = DEFAULT_VOICE_TOOLS.find((t) => t.name === "endConversation");
    expect(typeof tool?.description).toBe("string");
    expect((tool?.description ?? "").length).toBeGreaterThan(0);
  });
});
