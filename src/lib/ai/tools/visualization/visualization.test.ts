import { describe, it, expect } from "vitest";
import { createBarChartTool } from "./create-bar-chart";
import { createLineChartTool } from "./create-line-chart";
import { createPieChartTool } from "./create-pie-chart";
import { createTableTool } from "./create-table";

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
    expect(createBarChartTool.description.length).toBeGreaterThan(0);
  });

  it("has an inputSchema", () => {
    expect(createBarChartTool.inputSchema).toBeDefined();
  });

  it("has an execute function", () => {
    expect(typeof createBarChartTool.execute).toBe("function");
  });

  it("execute returns 'Success'", async () => {
    const result = await createBarChartTool.execute!({} as Parameters<typeof createBarChartTool.execute!>[0], {} as Parameters<typeof createBarChartTool.execute!>[1]);
    expect(result).toBe("Success");
  });

  it("validates valid bar chart input", () => {
    const r = createBarChartTool.inputSchema.safeParse({
      data: sampleSeriesData,
      title: "Quarterly Performance",
      description: "Sales vs Costs",
      yAxisLabel: "Amount ($)",
    });
    expect(r.success).toBe(true);
  });

  it("accepts null description and yAxisLabel", () => {
    const r = createBarChartTool.inputSchema.safeParse({
      data: sampleSeriesData,
      title: "Chart",
      description: null,
      yAxisLabel: null,
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing title", () => {
    const r = createBarChartTool.inputSchema.safeParse({
      data: sampleSeriesData,
      description: null,
      yAxisLabel: null,
    });
    expect(r.success).toBe(false);
  });

  it("rejects non-numeric series value", () => {
    const r = createBarChartTool.inputSchema.safeParse({
      data: [{ xAxisLabel: "Q1", series: [{ seriesName: "Sales", value: "100" }] }],
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
    const r = createLineChartTool.inputSchema.safeParse({
      data: sampleSeriesData,
      title: "Revenue Trend",
      description: "Monthly revenue",
      yAxisLabel: "Revenue",
    });
    expect(r.success).toBe(true);
  });

  it("accepts null description and yAxisLabel", () => {
    const r = createLineChartTool.inputSchema.safeParse({
      data: sampleSeriesData,
      title: "Trend",
      description: null,
      yAxisLabel: null,
    });
    expect(r.success).toBe(true);
  });

  it("accepts empty data array", () => {
    const r = createLineChartTool.inputSchema.safeParse({
      data: [],
      title: "Empty Chart",
      description: null,
      yAxisLabel: null,
    });
    expect(r.success).toBe(true);
  });

  it("execute returns 'Success'", async () => {
    const result = await createLineChartTool.execute!({} as Parameters<typeof createLineChartTool.execute!>[0], {} as Parameters<typeof createLineChartTool.execute!>[1]);
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
    const r = createPieChartTool.inputSchema.safeParse({
      data: validPieData,
      title: "Fruit Distribution",
      description: "Fruit sales breakdown",
      unit: "%",
    });
    expect(r.success).toBe(true);
  });

  it("accepts null description and unit", () => {
    const r = createPieChartTool.inputSchema.safeParse({
      data: validPieData,
      title: "Pie Chart",
      description: null,
      unit: null,
    });
    expect(r.success).toBe(true);
  });

  it("rejects non-numeric pie value", () => {
    const r = createPieChartTool.inputSchema.safeParse({
      data: [{ label: "A", value: "big" }],
      title: "Pie",
      description: null,
      unit: null,
    });
    expect(r.success).toBe(false);
  });

  it("execute returns 'Success'", async () => {
    const result = await createPieChartTool.execute!({} as Parameters<typeof createPieChartTool.execute!>[0], {} as Parameters<typeof createPieChartTool.execute!>[1]);
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
    const r = createTableTool.inputSchema.safeParse(validTableInput);
    expect(r.success).toBe(true);
  });

  it("accepts null description", () => {
    const r = createTableTool.inputSchema.safeParse({
      ...validTableInput,
      description: null,
    });
    expect(r.success).toBe(true);
  });

  it("defaults column type to 'string'", () => {
    const r = createTableTool.inputSchema.safeParse({
      title: "Table",
      description: null,
      columns: [{ key: "name", label: "Name" }],
      data: [],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.columns[0].type).toBe("string");
  });

  it("accepts null column type", () => {
    const r = createTableTool.inputSchema.safeParse({
      title: "Table",
      description: null,
      columns: [{ key: "name", label: "Name", type: null }],
      data: [],
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid column type", () => {
    const r = createTableTool.inputSchema.safeParse({
      title: "Table",
      description: null,
      columns: [{ key: "x", label: "X", type: "currency" }],
      data: [],
    });
    expect(r.success).toBe(false);
  });

  it("accepts date and boolean column types", () => {
    const r = createTableTool.inputSchema.safeParse({
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
    const r = createTableTool.inputSchema.safeParse({
      columns: [],
      data: [],
    });
    expect(r.success).toBe(false);
  });

  it("execute returns 'Success'", async () => {
    const result = await createTableTool.execute!({} as Parameters<typeof createTableTool.execute!>[0], {} as Parameters<typeof createTableTool.execute!>[1]);
    expect(result).toBe("Success");
  });
});
