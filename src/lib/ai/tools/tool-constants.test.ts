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
