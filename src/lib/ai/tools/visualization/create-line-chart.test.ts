import { describe, expect, it } from "vitest";
import { createLineChartTool } from "./create-line-chart";

const validInput = {
  data: [{ xAxisLabel: "Q1", series: [{ seriesName: "Revenue", value: 200 }] }],
  title: "Quarterly Revenue",
  description: null,
  yAxisLabel: null,
};

describe("createLineChartTool", () => {
  it("is defined", () => {
    expect(createLineChartTool).toBeDefined();
  });

  it("inputSchema accepts valid data", () => {
    expect(createLineChartTool.inputSchema.safeParse(validInput).success).toBe(true);
  });

  it("inputSchema rejects missing title", () => {
    const { title: _, ...rest } = validInput;
    expect(createLineChartTool.inputSchema.safeParse(rest).success).toBe(false);
  });

  it("inputSchema accepts multiple series per data point", () => {
    const input = {
      ...validInput,
      data: [
        {
          xAxisLabel: "Q1",
          series: [
            { seriesName: "Revenue", value: 200 },
            { seriesName: "Cost", value: 150 },
          ],
        },
      ],
    };
    expect(createLineChartTool.inputSchema.safeParse(input).success).toBe(true);
  });

  it("inputSchema accepts non-null yAxisLabel", () => {
    const result = createLineChartTool.inputSchema.safeParse({ ...validInput, yAxisLabel: "Revenue ($)" });
    expect(result.success).toBe(true);
  });

  it("series value must be a number", () => {
    const input = {
      ...validInput,
      data: [{ xAxisLabel: "Q1", series: [{ seriesName: "Revenue", value: "200" }] }],
    };
    expect(createLineChartTool.inputSchema.safeParse(input).success).toBe(false);
  });

  it("accepts empty data array", () => {
    expect(createLineChartTool.inputSchema.safeParse({ ...validInput, data: [] }).success).toBe(true);
  });
});

describe("createLineChartTool — shape invariants", () => {
  it("has inputSchema", () => {
    expect(createLineChartTool.inputSchema).toBeDefined();
  });

  it("has a non-empty description", () => {
    expect(typeof createLineChartTool.description).toBe("string");
    expect(createLineChartTool.description.length).toBeGreaterThan(0);
  });

  it("description mentions 'line chart'", () => {
    expect(createLineChartTool.description.toLowerCase()).toContain("line");
  });

  it("has an execute function", () => {
    expect(typeof createLineChartTool.execute).toBe("function");
  });

  it("execute resolves to 'Success'", async () => {
    const result = await createLineChartTool.execute({ data: [], title: "T", description: null, yAxisLabel: null }, { messages: [], toolCallId: "t1" });
    expect(result).toBe("Success");
  });

  it("inputSchema rejects data item with missing xAxisLabel", () => {
    const input = {
      ...validInput,
      data: [{ series: [{ seriesName: "A", value: 1 }] }],
    };
    expect(createLineChartTool.inputSchema.safeParse(input).success).toBe(false);
  });

  it("inputSchema rejects series item with missing seriesName", () => {
    const input = {
      ...validInput,
      data: [{ xAxisLabel: "Q1", series: [{ value: 1 }] }],
    };
    expect(createLineChartTool.inputSchema.safeParse(input).success).toBe(false);
  });

  it("inputSchema accepts multiple data points", () => {
    const input = {
      ...validInput,
      data: [
        { xAxisLabel: "Q1", series: [{ seriesName: "A", value: 10 }] },
        { xAxisLabel: "Q2", series: [{ seriesName: "A", value: 20 }] },
        { xAxisLabel: "Q3", series: [{ seriesName: "A", value: 30 }] },
      ],
    };
    expect(createLineChartTool.inputSchema.safeParse(input).success).toBe(true);
  });

  it("inputSchema accepts null description", () => {
    expect(createLineChartTool.inputSchema.safeParse({ ...validInput, description: null }).success).toBe(true);
  });
});
