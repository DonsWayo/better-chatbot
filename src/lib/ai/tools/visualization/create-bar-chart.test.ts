import { describe, expect, it } from "vitest";
import { createBarChartTool } from "./create-bar-chart";

const validInput = {
  data: [{ xAxisLabel: "Jan", series: [{ seriesName: "Sales", value: 100 }] }],
  title: "Monthly Sales",
  description: null,
  yAxisLabel: null,
};

describe("createBarChartTool", () => {
  it("is defined", () => {
    expect(createBarChartTool).toBeDefined();
  });

  it("inputSchema accepts valid data", () => {
    const result = createBarChartTool.inputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("inputSchema rejects missing title", () => {
    const { title: _, ...rest } = validInput;
    expect(createBarChartTool.inputSchema.safeParse(rest).success).toBe(false);
  });

  it("inputSchema requires data array", () => {
    const result = createBarChartTool.inputSchema.safeParse({ ...validInput, data: undefined });
    expect(result.success).toBe(false);
  });

  it("inputSchema accepts empty data array", () => {
    const result = createBarChartTool.inputSchema.safeParse({ ...validInput, data: [] });
    expect(result.success).toBe(true);
  });

  it("inputSchema accepts non-null description", () => {
    const result = createBarChartTool.inputSchema.safeParse({ ...validInput, description: "A chart" });
    expect(result.success).toBe(true);
  });

  it("inputSchema accepts non-null yAxisLabel", () => {
    const result = createBarChartTool.inputSchema.safeParse({ ...validInput, yAxisLabel: "USD" });
    expect(result.success).toBe(true);
  });

  it("series value must be number", () => {
    const input = {
      ...validInput,
      data: [{ xAxisLabel: "Jan", series: [{ seriesName: "Sales", value: "100" }] }],
    };
    expect(createBarChartTool.inputSchema.safeParse(input).success).toBe(false);
  });
});

describe("createBarChartTool — shape invariants", () => {
  it("has inputSchema", () => {
    expect(createBarChartTool.inputSchema).toBeDefined();
  });

  it("has description", () => {
    expect(typeof createBarChartTool.description).toBe("string");
    expect(createBarChartTool.description.length).toBeGreaterThan(0);
  });

  it("description mentions 'bar chart'", () => {
    expect(createBarChartTool.description.toLowerCase()).toContain("bar");
  });

  it("has an execute function", () => {
    expect(typeof createBarChartTool.execute).toBe("function");
  });

  it("execute resolves to 'Success'", async () => {
    const result = await createBarChartTool.execute(
      { data: [], title: "T", description: null, yAxisLabel: null },
      { messages: [], toolCallId: "t1" },
    );
    expect(result).toBe("Success");
  });

  it("inputSchema rejects series item with missing seriesName", () => {
    const input = {
      ...validInput,
      data: [{ xAxisLabel: "Jan", series: [{ value: 100 }] }],
    };
    expect(createBarChartTool.inputSchema.safeParse(input).success).toBe(false);
  });

  it("inputSchema accepts multiple data points", () => {
    const input = {
      ...validInput,
      data: [
        { xAxisLabel: "Jan", series: [{ seriesName: "A", value: 10 }] },
        { xAxisLabel: "Feb", series: [{ seriesName: "A", value: 20 }] },
      ],
    };
    expect(createBarChartTool.inputSchema.safeParse(input).success).toBe(true);
  });

  it("inputSchema accepts null yAxisLabel", () => {
    expect(createBarChartTool.inputSchema.safeParse({ ...validInput, yAxisLabel: null }).success).toBe(true);
  });
});
