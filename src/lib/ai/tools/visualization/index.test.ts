import { describe, it, expect } from "vitest";
import { createPieChartTool } from "./create-pie-chart";
import { createBarChartTool } from "./create-bar-chart";
import { createLineChartTool } from "./create-line-chart";
import { createTableTool } from "./create-table";

describe("createPieChartTool", () => {
  it("is defined", () => {
    expect(createPieChartTool).toBeDefined();
  });

  it("has a description", () => {
    expect(typeof createPieChartTool.description).toBe("string");
    expect(createPieChartTool.description!.length).toBeGreaterThan(0);
  });

  it("has inputSchema", () => {
    expect(createPieChartTool.inputSchema).toBeDefined();
  });

  it("execute returns 'Success'", async () => {
    const result = await createPieChartTool.execute!(
      { data: [{ label: "A", value: 10 }], title: "Test", description: null, unit: null },
      {} as Parameters<NonNullable<typeof createPieChartTool.execute>>[1],
    );
    expect(result).toBe("Success");
  });
});

describe("createBarChartTool", () => {
  it("is defined", () => {
    expect(createBarChartTool).toBeDefined();
  });

  it("has a description", () => {
    expect(typeof createBarChartTool.description).toBe("string");
    expect(createBarChartTool.description!.length).toBeGreaterThan(0);
  });

  it("has inputSchema", () => {
    expect(createBarChartTool.inputSchema).toBeDefined();
  });

  it("execute returns 'Success'", async () => {
    const result = await createBarChartTool.execute!(
      {
        data: [{ xAxisLabel: "Q1", series: [{ seriesName: "Revenue", value: 100 }] }],
        title: "Bar Chart",
        description: null,
        yAxisLabel: null,
      },
      {} as Parameters<NonNullable<typeof createBarChartTool.execute>>[1],
    );
    expect(result).toBe("Success");
  });
});

describe("createLineChartTool", () => {
  it("is defined", () => {
    expect(createLineChartTool).toBeDefined();
  });

  it("has a description", () => {
    expect(typeof createLineChartTool.description).toBe("string");
    expect(createLineChartTool.description!.length).toBeGreaterThan(0);
  });

  it("has inputSchema", () => {
    expect(createLineChartTool.inputSchema).toBeDefined();
  });

  it("execute returns 'Success'", async () => {
    const result = await createLineChartTool.execute!(
      {
        data: [{ xAxisLabel: "Jan", series: [{ seriesName: "Sales", value: 50 }] }],
        title: "Line Chart",
        description: "Monthly sales",
        yAxisLabel: "USD",
      },
      {} as Parameters<NonNullable<typeof createLineChartTool.execute>>[1],
    );
    expect(result).toBe("Success");
  });
});

describe("createTableTool", () => {
  it("is defined", () => {
    expect(createTableTool).toBeDefined();
  });

  it("has a description that mentions table", () => {
    expect(createTableTool.description!.toLowerCase()).toContain("table");
  });

  it("has inputSchema", () => {
    expect(createTableTool.inputSchema).toBeDefined();
  });

  it("execute returns 'Success'", async () => {
    const result = await createTableTool.execute!(
      {
        title: "Users",
        description: null,
        columns: [
          { key: "name", label: "Name", type: "string" },
          { key: "age", label: "Age", type: "number" },
        ],
        data: [{ name: "Alice", age: 30 }],
      },
      {} as Parameters<NonNullable<typeof createTableTool.execute>>[1],
    );
    expect(result).toBe("Success");
  });
});
