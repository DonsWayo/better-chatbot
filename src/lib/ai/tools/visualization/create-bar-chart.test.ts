import { describe, it, expect } from "vitest";
import { createBarChartTool } from "./create-bar-chart";

describe("createBarChartTool", () => {
  it("has a non-empty description", () => {
    expect(createBarChartTool.description!.length).toBeGreaterThan(0);
  });

  it("has an inputSchema", () => {
    expect(createBarChartTool.inputSchema).toBeDefined();
  });

  it("has an execute function", () => {
    expect(typeof createBarChartTool.execute).toBe("function");
  });

  it("execute returns 'Success'", async () => {
    const result = await createBarChartTool.execute!({} as any, {} as any);
    expect(result).toBe("Success");
  });
});

describe("createBarChartTool inputSchema validation", () => {
  const schema = createBarChartTool.inputSchema;

  const validData = {
    data: [
      {
        xAxisLabel: "Jan",
        series: [
          { seriesName: "Revenue", value: 100 },
          { seriesName: "Costs", value: 60 },
        ],
      },
      {
        xAxisLabel: "Feb",
        series: [
          { seriesName: "Revenue", value: 120 },
          { seriesName: "Costs", value: 70 },
        ],
      },
    ],
    title: "Monthly Financials",
    description: "Revenue vs Costs",
    yAxisLabel: "USD",
  };

  it("accepts valid bar chart data", () => {
    expect(schema.safeParse(validData).success).toBe(true);
  });

  it("accepts null description", () => {
    expect(schema.safeParse({ ...validData, description: null }).success).toBe(true);
  });

  it("accepts null yAxisLabel", () => {
    expect(schema.safeParse({ ...validData, yAxisLabel: null }).success).toBe(true);
  });

  it("rejects when title is missing", () => {
    const { title: _title, ...rest } = validData;
    expect(schema.safeParse(rest).success).toBe(false);
  });

  it("rejects when data is missing", () => {
    const { data: _data, ...rest } = validData;
    expect(schema.safeParse(rest).success).toBe(false);
  });

  it("rejects when xAxisLabel is missing", () => {
    const bad = {
      ...validData,
      data: [{ series: [{ seriesName: "X", value: 1 }] }],
    };
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("rejects when series item is missing seriesName", () => {
    const bad = {
      ...validData,
      data: [{ xAxisLabel: "Jan", series: [{ value: 1 }] }],
    };
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("rejects when series item value is not a number", () => {
    const bad = {
      ...validData,
      data: [{ xAxisLabel: "Jan", series: [{ seriesName: "Rev", value: "big" }] }],
    };
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("accepts empty data array", () => {
    expect(schema.safeParse({ ...validData, data: [] }).success).toBe(true);
  });

  it("accepts single series per data point", () => {
    const single = {
      ...validData,
      data: [{ xAxisLabel: "Q1", series: [{ seriesName: "Revenue", value: 500 }] }],
    };
    expect(schema.safeParse(single).success).toBe(true);
  });
});
