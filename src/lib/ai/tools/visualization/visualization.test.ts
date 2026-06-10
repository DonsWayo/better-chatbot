import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { createBarChartTool } from "./create-bar-chart";
import { createLineChartTool } from "./create-line-chart";
import { createPieChartTool } from "./create-pie-chart";
import { createTableTool } from "./create-table";

// The AI SDK types inputSchema as FlexibleSchema, but at runtime these are zod schemas.
const barSchema = createBarChartTool.inputSchema as unknown as z.ZodTypeAny;
const lineSchema = createLineChartTool.inputSchema as unknown as z.ZodTypeAny;
const pieSchema = createPieChartTool.inputSchema as unknown as z.ZodTypeAny;
const tableSchema = createTableTool.inputSchema as unknown as z.ZodTypeAny;

// Helper to invoke tool.execute without fighting the AI SDK's optional/generic typing.
const runTool = (tool: { execute?: unknown }): Promise<unknown> =>
  Promise.resolve(
    (tool.execute as (input: unknown, options: unknown) => unknown)({}, {}),
  );

const sampleSeriesData = [
  {
    xAxisLabel: "Q1",
    series: [
      { seriesName: "Sales", value: 100 },
      { seriesName: "Costs", value: 80 },
    ],
  },
  {
    xAxisLabel: "Q2",
    series: [
      { seriesName: "Sales", value: 150 },
      { seriesName: "Costs", value: 90 },
    ],
  },
];

describe("createBarChartTool", () => {
  it("has a description", () => {
    expect(typeof createBarChartTool.description).toBe("string");
    expect(createBarChartTool.description?.length).toBeGreaterThan(0);
  });

  it("has an inputSchema", () => {
    expect(createBarChartTool.inputSchema).toBeDefined();
  });

  it("has an execute function", () => {
    expect(typeof createBarChartTool.execute).toBe("function");
  });

  it("execute returns 'Success'", async () => {
    const result = await runTool(createBarChartTool);
    expect(result).toBe("Success");
  });

  it("validates valid bar chart input", () => {
    const r = barSchema.safeParse({
      data: sampleSeriesData,
      title: "Quarterly Performance",
      description: "Sales vs Costs",
      yAxisLabel: "Amount ($)",
    });
    expect(r.success).toBe(true);
  });

  it("accepts null description and yAxisLabel", () => {
    const r = barSchema.safeParse({
      data: sampleSeriesData,
      title: "Chart",
      description: null,
      yAxisLabel: null,
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing title", () => {
    const r = barSchema.safeParse({
      data: sampleSeriesData,
      description: null,
      yAxisLabel: null,
    });
    expect(r.success).toBe(false);
  });

  it("rejects non-numeric series value", () => {
    const r = barSchema.safeParse({
      data: [
        { xAxisLabel: "Q1", series: [{ seriesName: "Sales", value: "100" }] },
      ],
      title: "Chart",
      description: null,
      yAxisLabel: null,
    });
    expect(r.success).toBe(false);
  });
});

describe("createLineChartTool", () => {
  it("has a description", () => {
    expect(typeof createLineChartTool.description).toBe("string");
  });

  it("validates valid line chart input", () => {
    const r = lineSchema.safeParse({
      data: sampleSeriesData,
      title: "Revenue Trend",
      description: "Monthly revenue",
      yAxisLabel: "Revenue",
    });
    expect(r.success).toBe(true);
  });

  it("accepts null description and yAxisLabel", () => {
    const r = lineSchema.safeParse({
      data: sampleSeriesData,
      title: "Trend",
      description: null,
      yAxisLabel: null,
    });
    expect(r.success).toBe(true);
  });

  it("accepts empty data array", () => {
    const r = lineSchema.safeParse({
      data: [],
      title: "Empty Chart",
      description: null,
      yAxisLabel: null,
    });
    expect(r.success).toBe(true);
  });

  it("execute returns 'Success'", async () => {
    const result = await runTool(createLineChartTool);
    expect(result).toBe("Success");
  });
});

describe("createPieChartTool", () => {
  const validPieData = [
    { label: "Apples", value: 30 },
    { label: "Oranges", value: 45 },
    { label: "Grapes", value: 25 },
  ];

  it("has a description", () => {
    expect(typeof createPieChartTool.description).toBe("string");
  });

  it("validates valid pie chart input", () => {
    const r = pieSchema.safeParse({
      data: validPieData,
      title: "Fruit Distribution",
      description: "Fruit sales breakdown",
      unit: "%",
    });
    expect(r.success).toBe(true);
  });

  it("accepts null description and unit", () => {
    const r = pieSchema.safeParse({
      data: validPieData,
      title: "Pie Chart",
      description: null,
      unit: null,
    });
    expect(r.success).toBe(true);
  });

  it("rejects non-numeric pie value", () => {
    const r = pieSchema.safeParse({
      data: [{ label: "A", value: "big" }],
      title: "Pie",
      description: null,
      unit: null,
    });
    expect(r.success).toBe(false);
  });

  it("execute returns 'Success'", async () => {
    const result = await runTool(createPieChartTool);
    expect(result).toBe("Success");
  });
});

describe("createTableTool", () => {
  const validTableInput = {
    title: "Sales Report",
    description: "Monthly sales data",
    columns: [
      { key: "month", label: "Month", type: "string" as const },
      { key: "revenue", label: "Revenue", type: "number" as const },
    ],
    data: [
      { month: "January", revenue: 10000 },
      { month: "February", revenue: 12000 },
    ],
  };

  it("has a description", () => {
    expect(typeof createTableTool.description).toBe("string");
  });

  it("validates valid table input", () => {
    const r = tableSchema.safeParse(validTableInput);
    expect(r.success).toBe(true);
  });

  it("accepts null description", () => {
    const r = tableSchema.safeParse({
      ...validTableInput,
      description: null,
    });
    expect(r.success).toBe(true);
  });

  it("defaults column type to 'string'", () => {
    const r = tableSchema.safeParse({
      title: "Table",
      description: null,
      columns: [{ key: "name", label: "Name" }],
      data: [],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      const data = r.data as { columns: Array<{ type?: string | null }> };
      expect(data.columns[0].type).toBe("string");
    }
  });

  it("accepts null column type", () => {
    const r = tableSchema.safeParse({
      title: "Table",
      description: null,
      columns: [{ key: "name", label: "Name", type: null }],
      data: [],
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid column type", () => {
    const r = tableSchema.safeParse({
      title: "Table",
      description: null,
      columns: [{ key: "x", label: "X", type: "currency" }],
      data: [],
    });
    expect(r.success).toBe(false);
  });

  it("accepts date and boolean column types", () => {
    const r = tableSchema.safeParse({
      title: "Table",
      description: null,
      columns: [
        { key: "joined", label: "Joined", type: "date" },
        { key: "active", label: "Active", type: "boolean" },
      ],
      data: [],
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing title", () => {
    const r = tableSchema.safeParse({
      columns: [],
      data: [],
    });
    expect(r.success).toBe(false);
  });

  it("execute returns 'Success'", async () => {
    const result = await runTool(createTableTool);
    expect(result).toBe("Success");
  });
});

describe("visualization tools — execute invariants", () => {
  it("createBarChartTool.execute always returns 'Success'", async () => {
    const result = await runTool(createBarChartTool);
    expect(result).toBe("Success");
  });

  it("createLineChartTool.execute always returns 'Success'", async () => {
    const result = await runTool(createLineChartTool);
    expect(result).toBe("Success");
  });

  it("createPieChartTool.execute always returns 'Success'", async () => {
    const result = await runTool(createPieChartTool);
    expect(result).toBe("Success");
  });

  it("all four tools have a non-empty description string", () => {
    for (const tool of [
      createBarChartTool,
      createLineChartTool,
      createPieChartTool,
      createTableTool,
    ]) {
      expect(typeof tool.description).toBe("string");
      expect(tool.description?.length).toBeGreaterThan(0);
    }
  });
});
