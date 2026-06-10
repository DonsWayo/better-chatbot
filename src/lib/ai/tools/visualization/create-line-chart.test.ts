import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { createLineChartTool } from "./create-line-chart";

describe("createLineChartTool", () => {
  it("has a non-empty description", () => {
    expect(createLineChartTool.description!.length).toBeGreaterThan(0);
  });

  it("has an inputSchema", () => {
    expect(createLineChartTool.inputSchema).toBeDefined();
  });

  it("has an execute function", () => {
    expect(typeof createLineChartTool.execute).toBe("function");
  });

  it("execute returns 'Success'", async () => {
    const result = await createLineChartTool.execute!({} as any, {} as any);
    expect(result).toBe("Success");
  });
});

describe("createLineChartTool inputSchema validation", () => {
  // The AI SDK types inputSchema as FlexibleSchema, but at runtime it is a zod schema.
  const schema = createLineChartTool.inputSchema as unknown as z.ZodTypeAny;

  const validData = {
    data: [
      {
        xAxisLabel: "Week 1",
        series: [
          { seriesName: "Sales", value: 200 },
          { seriesName: "Returns", value: 10 },
        ],
      },
      {
        xAxisLabel: "Week 2",
        series: [
          { seriesName: "Sales", value: 250 },
          { seriesName: "Returns", value: 15 },
        ],
      },
    ],
    title: "Weekly Sales",
    description: "Sales and returns per week",
    yAxisLabel: "Units",
  };

  it("accepts valid line chart data", () => {
    expect(schema.safeParse(validData).success).toBe(true);
  });

  it("accepts null description", () => {
    expect(schema.safeParse({ ...validData, description: null }).success).toBe(
      true,
    );
  });

  it("accepts null yAxisLabel", () => {
    expect(schema.safeParse({ ...validData, yAxisLabel: null }).success).toBe(
      true,
    );
  });

  it("rejects when title is missing", () => {
    const { title: _title, ...rest } = validData;
    expect(schema.safeParse(rest).success).toBe(false);
  });

  it("rejects when data array is missing", () => {
    const { data: _data, ...rest } = validData;
    expect(schema.safeParse(rest).success).toBe(false);
  });

  it("rejects when series entry is missing value", () => {
    const bad = {
      ...validData,
      data: [{ xAxisLabel: "W1", series: [{ seriesName: "Sales" }] }],
    };
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("rejects when series value is not a number", () => {
    const bad = {
      ...validData,
      data: [
        { xAxisLabel: "W1", series: [{ seriesName: "Sales", value: "high" }] },
      ],
    };
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("accepts empty data array", () => {
    expect(schema.safeParse({ ...validData, data: [] }).success).toBe(true);
  });

  it("accepts many data points", () => {
    const many = {
      ...validData,
      data: Array.from({ length: 52 }, (_, i) => ({
        xAxisLabel: `Week ${i + 1}`,
        series: [{ seriesName: "KPI", value: i * 10 }],
      })),
    };
    expect(schema.safeParse(many).success).toBe(true);
  });

  it("rejects when xAxisLabel is missing", () => {
    const bad = {
      ...validData,
      data: [{ series: [{ seriesName: "Sales", value: 100 }] }],
    };
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("rejects when series item is missing seriesName", () => {
    const bad = {
      ...validData,
      data: [{ xAxisLabel: "W1", series: [{ value: 100 }] }],
    };
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("accepts zero value in series", () => {
    const data = {
      ...validData,
      data: [{ xAxisLabel: "W1", series: [{ seriesName: "Sales", value: 0 }] }],
    };
    expect(schema.safeParse(data).success).toBe(true);
  });

  it("accepts negative values in series", () => {
    const data = {
      ...validData,
      data: [
        { xAxisLabel: "W1", series: [{ seriesName: "Loss", value: -50 }] },
      ],
    };
    expect(schema.safeParse(data).success).toBe(true);
  });

  it("accepts empty series array per data point", () => {
    const data = {
      ...validData,
      data: [{ xAxisLabel: "W1", series: [] }],
    };
    expect(schema.safeParse(data).success).toBe(true);
  });
});
