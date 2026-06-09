import { describe, it, expect } from "vitest";

// Test that the chart tool schemas validate data correctly via Zod
// (these tools export inputSchema as a ZodObject)

describe("createBarChartTool schema", () => {
  it("defines a bar chart tool with execute function", async () => {
    const { createBarChartTool } = await import("./create-bar-chart");
    expect(typeof createBarChartTool.execute).toBe("function");
  });

  it("execute returns Success", async () => {
    const { createBarChartTool } = await import("./create-bar-chart");
    const result = await createBarChartTool.execute!({} as any, {} as any);
    expect(result).toBe("Success");
  });

  it("inputSchema accepts valid bar chart data", async () => {
    const { createBarChartTool } = await import("./create-bar-chart");
    const schema = createBarChartTool.inputSchema as any;
    const valid = schema.parse({
      data: [{ xAxisLabel: "Q1", series: [{ seriesName: "Revenue", value: 100 }] }],
      title: "Sales Chart",
      description: "Monthly sales",
      yAxisLabel: "USD",
    });
    expect(valid.title).toBe("Sales Chart");
  });

  it("inputSchema rejects missing required fields", async () => {
    const { createBarChartTool } = await import("./create-bar-chart");
    const schema = createBarChartTool.inputSchema as any;
    expect(() => schema.parse({ title: "No data" })).toThrow();
  });
});

describe("createLineChartTool schema", () => {
  it("defines a line chart tool with execute function", async () => {
    const { createLineChartTool } = await import("./create-line-chart");
    expect(typeof createLineChartTool.execute).toBe("function");
  });

  it("execute returns Success", async () => {
    const { createLineChartTool } = await import("./create-line-chart");
    const result = await createLineChartTool.execute!({} as any, {} as any);
    expect(result).toBe("Success");
  });
});

describe("createPieChartTool schema", () => {
  it("defines a pie chart tool with execute function", async () => {
    const { createPieChartTool } = await import("./create-pie-chart");
    expect(typeof createPieChartTool.execute).toBe("function");
  });

  it("execute returns Success", async () => {
    const { createPieChartTool } = await import("./create-pie-chart");
    const result = await createPieChartTool.execute!({} as any, {} as any);
    expect(result).toBe("Success");
  });

  it("inputSchema accepts valid pie chart data", async () => {
    const { createPieChartTool } = await import("./create-pie-chart");
    const schema = createPieChartTool.inputSchema as any;
    const valid = schema.parse({
      data: [{ label: "Apple", value: 40 }, { label: "Google", value: 60 }],
      title: "Market Share",
      description: null,
      unit: "%",
    });
    expect(valid.data).toHaveLength(2);
  });
});

describe("createTableTool schema", () => {
  it("defines a table tool with execute function", async () => {
    const { createTableTool } = await import("./create-table");
    expect(typeof createTableTool.execute).toBe("function");
  });

  it("execute returns Success", async () => {
    const { createTableTool } = await import("./create-table");
    const result = await createTableTool.execute!({} as any, {} as any);
    expect(result).toBe("Success");
  });

  it("inputSchema accepts valid table data", async () => {
    const { createTableTool } = await import("./create-table");
    const schema = createTableTool.inputSchema as any;
    const valid = schema.parse({
      title: "Users",
      description: "User list",
      columns: [{ key: "name", label: "Name", type: "string" }],
      data: [{ name: "Alice" }, { name: "Bob" }],
    });
    expect(valid.columns).toHaveLength(1);
    expect(valid.data).toHaveLength(2);
  });
});
