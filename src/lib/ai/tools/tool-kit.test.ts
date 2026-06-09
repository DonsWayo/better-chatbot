import { describe, it, expect } from "vitest";
import { APP_DEFAULT_TOOL_KIT } from "./tool-kit";
import { AppDefaultToolkit, DefaultToolName } from "./index";

describe("APP_DEFAULT_TOOL_KIT", () => {
  it("has all four toolkit categories", () => {
    expect(APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.Visualization]).toBeDefined();
    expect(APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.WebSearch]).toBeDefined();
    expect(APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.Http]).toBeDefined();
    expect(APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.Code]).toBeDefined();
  });

  it("Visualization toolkit has all 4 chart tools", () => {
    const viz = APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.Visualization];
    expect(viz[DefaultToolName.CreatePieChart]).toBeDefined();
    expect(viz[DefaultToolName.CreateBarChart]).toBeDefined();
    expect(viz[DefaultToolName.CreateLineChart]).toBeDefined();
    expect(viz[DefaultToolName.CreateTable]).toBeDefined();
  });

  it("WebSearch toolkit has search and contents tools", () => {
    const ws = APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.WebSearch];
    expect(ws[DefaultToolName.WebSearch]).toBeDefined();
    expect(ws[DefaultToolName.WebContent]).toBeDefined();
  });

  it("Http toolkit has http tool", () => {
    const http = APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.Http];
    expect(http[DefaultToolName.Http]).toBeDefined();
  });

  it("Code toolkit has JS and Python execution tools", () => {
    const code = APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.Code];
    expect(code[DefaultToolName.JavascriptExecution]).toBeDefined();
    expect(code[DefaultToolName.PythonExecution]).toBeDefined();
  });

  it("each tool has an inputSchema", () => {
    for (const [kitName, kit] of Object.entries(APP_DEFAULT_TOOL_KIT)) {
      for (const [toolName, tool] of Object.entries(kit)) {
        expect(tool.inputSchema, `${kitName}/${toolName} missing inputSchema`).toBeDefined();
      }
    }
  });

  it("server-side tools (viz, http, web search) have execute functions", () => {
    const serverToolkits = [
      AppDefaultToolkit.Visualization,
      AppDefaultToolkit.Http,
      AppDefaultToolkit.WebSearch,
    ];
    for (const kitKey of serverToolkits) {
      const kit = APP_DEFAULT_TOOL_KIT[kitKey];
      for (const [toolName, tool] of Object.entries(kit)) {
        expect(typeof tool.execute, `${kitKey}/${toolName} missing execute`).toBe("function");
      }
    }
  });

  it("code tools are client-side (no server execute)", () => {
    const code = APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.Code];
    for (const [, tool] of Object.entries(code)) {
      expect(tool.execute).toBeUndefined();
    }
  });

  it("Visualization toolkit has exactly 4 tools", () => {
    const viz = APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.Visualization];
    expect(Object.keys(viz)).toHaveLength(4);
  });

  it("WebSearch toolkit has exactly 2 tools", () => {
    const ws = APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.WebSearch];
    expect(Object.keys(ws)).toHaveLength(2);
  });

  it("Http toolkit has exactly 1 tool", () => {
    const http = APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.Http];
    expect(Object.keys(http)).toHaveLength(1);
  });

  it("Code toolkit has exactly 2 tools", () => {
    const code = APP_DEFAULT_TOOL_KIT[AppDefaultToolkit.Code];
    expect(Object.keys(code)).toHaveLength(2);
  });

  it("each tool has a non-empty description", () => {
    for (const [kitName, kit] of Object.entries(APP_DEFAULT_TOOL_KIT)) {
      for (const [toolName, tool] of Object.entries(kit)) {
        expect(
          typeof (tool as any).description,
          `${kitName}/${toolName} should have string description`,
        ).toBe("string");
        expect((tool as any).description.length, `${kitName}/${toolName} description empty`).toBeGreaterThan(0);
      }
    }
  });

  it("total tool count across all kits is 9", () => {
    const total = Object.values(APP_DEFAULT_TOOL_KIT).reduce(
      (sum, kit) => sum + Object.keys(kit).length,
      0,
    );
    expect(total).toBe(9);
  });
});
