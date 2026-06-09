import { describe, it, expect } from "vitest";
import { APP_DEFAULT_TOOL_KIT } from "./tool-kit";
import { AppDefaultToolkit, DefaultToolName } from "./index";

describe("APP_DEFAULT_TOOL_KIT", () => {
  it("has all four toolkit entries", () => {
    expect(APP_DEFAULT_TOOL_KIT).toHaveProperty(AppDefaultToolkit.Visualization);
    expect(APP_DEFAULT_TOOL_KIT).toHaveProperty(AppDefaultToolkit.WebSearch);
    expect(APP_DEFAULT_TOOL_KIT).toHaveProperty(AppDefaultToolkit.Http);
    expect(APP_DEFAULT_TOOL_KIT).toHaveProperty(AppDefaultToolkit.Code);
  });

  describe("Visualization toolkit", () => {
    const viz = APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.Visualization];

    it("has CreatePieChart tool", () => {
      expect(viz[DefaultToolName.CreatePieChart]).toBeDefined();
    });

    it("has CreateBarChart tool", () => {
      expect(viz[DefaultToolName.CreateBarChart]).toBeDefined();
    });

    it("has CreateLineChart tool", () => {
      expect(viz[DefaultToolName.CreateLineChart]).toBeDefined();
    });

    it("has CreateTable tool", () => {
      expect(viz[DefaultToolName.CreateTable]).toBeDefined();
    });

    it("all visualization tools have execute functions", () => {
      for (const tool of Object.values(viz)) {
        expect(typeof tool.execute).toBe("function");
      }
    });
  });

  describe("WebSearch toolkit", () => {
    const web = APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.WebSearch];

    it("has WebSearch tool", () => {
      expect(web[DefaultToolName.WebSearch]).toBeDefined();
    });

    it("has WebContent tool", () => {
      expect(web[DefaultToolName.WebContent]).toBeDefined();
    });

    it("all web tools have execute functions", () => {
      for (const tool of Object.values(web)) {
        expect(typeof tool.execute).toBe("function");
      }
    });
  });

  describe("Http toolkit", () => {
    const http = APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.Http];

    it("has Http tool", () => {
      expect(http[DefaultToolName.Http]).toBeDefined();
    });

    it("http tool has execute function", () => {
      expect(typeof http[DefaultToolName.Http].execute).toBe("function");
    });
  });

  describe("Code toolkit", () => {
    const code = APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.Code];

    it("has JavascriptExecution tool", () => {
      expect(code[DefaultToolName.JavascriptExecution]).toBeDefined();
    });

    it("has PythonExecution tool", () => {
      expect(code[DefaultToolName.PythonExecution]).toBeDefined();
    });

    it("all code tools have inputSchema", () => {
      for (const tool of Object.values(code)) {
        expect(tool.inputSchema).toBeDefined();
      }
    });

    it("code tools are client-side (no server execute)", () => {
      expect(code[DefaultToolName.JavascriptExecution].execute).toBeUndefined();
      expect(code[DefaultToolName.PythonExecution].execute).toBeUndefined();
    });
  });
});
