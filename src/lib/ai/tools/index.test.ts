import { describe, it, expect } from "vitest";
import { AppDefaultToolkit, DefaultToolName, SequentialThinkingToolName, ImageToolName } from "./index";

describe("AppDefaultToolkit enum", () => {
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

  it("has exactly 4 values", () => {
    const values = Object.values(AppDefaultToolkit);
    expect(values).toHaveLength(4);
  });
});

describe("DefaultToolName enum", () => {
  it("has CreatePieChart value", () => {
    expect(DefaultToolName.CreatePieChart).toBe("createPieChart");
  });

  it("has CreateBarChart value", () => {
    expect(DefaultToolName.CreateBarChart).toBe("createBarChart");
  });

  it("has CreateLineChart value", () => {
    expect(DefaultToolName.CreateLineChart).toBe("createLineChart");
  });

  it("has CreateTable value", () => {
    expect(DefaultToolName.CreateTable).toBe("createTable");
  });

  it("has WebSearch value", () => {
    expect(DefaultToolName.WebSearch).toBe("webSearch");
  });

  it("has WebContent value", () => {
    expect(DefaultToolName.WebContent).toBe("webContent");
  });

  it("has Http value", () => {
    expect(DefaultToolName.Http).toBe("http");
  });

  it("has JavascriptExecution value with correct name", () => {
    expect(DefaultToolName.JavascriptExecution).toBe("mini-javascript-execution");
  });

  it("has PythonExecution value", () => {
    expect(DefaultToolName.PythonExecution).toBe("python-execution");
  });
});

describe("SequentialThinkingToolName", () => {
  it("equals 'sequential-thinking'", () => {
    expect(SequentialThinkingToolName).toBe("sequential-thinking");
  });
});

describe("ImageToolName", () => {
  it("equals 'image-manager'", () => {
    expect(ImageToolName).toBe("image-manager");
  });
});
