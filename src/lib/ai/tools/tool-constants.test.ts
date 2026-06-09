import { describe, it, expect } from "vitest";
import {
  AppDefaultToolkit,
  DefaultToolName,
  SequentialThinkingToolName,
  ImageToolName,
} from "./index";

describe("AppDefaultToolkit", () => {
  it("has Visualization value", () => {
    expect(AppDefaultToolkit.Visualization).toBe("visualization");
  });

  it("has WebSearch value", () => {
    expect(AppDefaultToolkit.WebSearch).toBe("webSearch");
  });

  it("has Http value", () => {
    expect(AppDefaultToolkit.Http).toBe("http");
  });

  it("has Code value", () => {
    expect(AppDefaultToolkit.Code).toBe("code");
  });

  it("has exactly 4 entries", () => {
    const values = Object.values(AppDefaultToolkit);
    expect(values).toHaveLength(4);
  });
});

describe("DefaultToolName", () => {
  it("has CreatePieChart", () => {
    expect(DefaultToolName.CreatePieChart).toBe("createPieChart");
  });

  it("has CreateBarChart", () => {
    expect(DefaultToolName.CreateBarChart).toBe("createBarChart");
  });

  it("has CreateLineChart", () => {
    expect(DefaultToolName.CreateLineChart).toBe("createLineChart");
  });

  it("has CreateTable", () => {
    expect(DefaultToolName.CreateTable).toBe("createTable");
  });

  it("has WebSearch", () => {
    expect(DefaultToolName.WebSearch).toBe("webSearch");
  });

  it("has WebContent", () => {
    expect(DefaultToolName.WebContent).toBe("webContent");
  });

  it("has Http", () => {
    expect(DefaultToolName.Http).toBe("http");
  });

  it("has JavascriptExecution as 'mini-javascript-execution'", () => {
    expect(DefaultToolName.JavascriptExecution).toBe("mini-javascript-execution");
  });

  it("has PythonExecution as 'python-execution'", () => {
    expect(DefaultToolName.PythonExecution).toBe("python-execution");
  });

  it("has exactly 9 entries", () => {
    const values = Object.values(DefaultToolName);
    expect(values).toHaveLength(9);
  });
});

describe("constants", () => {
  it("SequentialThinkingToolName is 'sequential-thinking'", () => {
    expect(SequentialThinkingToolName).toBe("sequential-thinking");
  });

  it("ImageToolName is 'image-manager'", () => {
    expect(ImageToolName).toBe("image-manager");
  });
});

describe("DefaultToolName — value uniqueness", () => {
  it("all DefaultToolName values are unique (no duplicates)", () => {
    const values = Object.values(DefaultToolName);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it("AppDefaultToolkit values are all unique", () => {
    const values = Object.values(AppDefaultToolkit);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it("SequentialThinkingToolName does not collide with DefaultToolName entries", () => {
    const toolNames = Object.values(DefaultToolName) as string[];
    expect(toolNames).not.toContain(SequentialThinkingToolName);
  });

  it("ImageToolName does not collide with DefaultToolName entries", () => {
    const toolNames = Object.values(DefaultToolName) as string[];
    expect(toolNames).not.toContain(ImageToolName);
  });
});

describe("DefaultToolName — string format", () => {
  it("all values are non-empty strings", () => {
    for (const value of Object.values(DefaultToolName)) {
      expect(typeof value).toBe("string");
      expect((value as string).length).toBeGreaterThan(0);
    }
  });

  it("visualization tool names follow camelCase or kebab-case", () => {
    expect(DefaultToolName.CreatePieChart).toMatch(/^[a-zA-Z][a-zA-Z0-9-]*$/);
    expect(DefaultToolName.CreateBarChart).toMatch(/^[a-zA-Z][a-zA-Z0-9-]*$/);
  });

  it("execution tool names use kebab-case with 'execution' suffix", () => {
    expect(DefaultToolName.JavascriptExecution).toContain("execution");
    expect(DefaultToolName.PythonExecution).toContain("execution");
  });
});
