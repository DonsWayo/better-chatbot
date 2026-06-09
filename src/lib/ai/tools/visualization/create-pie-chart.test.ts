import { describe, it, expect } from "vitest";
import { createPieChartTool } from "./create-pie-chart";

describe("createPieChartTool", () => {
  it("has a non-empty description", () => {
    expect(createPieChartTool.description!.length).toBeGreaterThan(0);
  });

  it("has an inputSchema", () => {
    expect(createPieChartTool.inputSchema).toBeDefined();
  });

  it("has an execute function", () => {
    expect(typeof createPieChartTool.execute).toBe("function");
  });

  it("execute returns 'Success'", async () => {
    const result = await createPieChartTool.execute!({} as any, {} as any);
    expect(result).toBe("Success");
  });
});

describe("createPieChartTool inputSchema validation", () => {
  const schema = createPieChartTool.inputSchema;

  it("accepts valid pie chart data", () => {
    const result = schema.safeParse({
      data: [
        { label: "Slice A", value: 30 },
        { label: "Slice B", value: 70 },
      ],
      title: "Market Share",
      description: "Q1 2025",
      unit: "%",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null description", () => {
    const result = schema.safeParse({
      data: [{ label: "A", value: 1 }],
      title: "Chart",
      description: null,
      unit: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts null unit", () => {
    const result = schema.safeParse({
      data: [{ label: "A", value: 1 }],
      title: "Chart",
      description: null,
      unit: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects when title is missing", () => {
    const result = schema.safeParse({
      data: [{ label: "A", value: 1 }],
      description: null,
      unit: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects when data is missing", () => {
    const result = schema.safeParse({
      title: "Chart",
      description: null,
      unit: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects when data item is missing label", () => {
    const result = schema.safeParse({
      data: [{ value: 50 }],
      title: "Chart",
      description: null,
      unit: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects when data item value is not a number", () => {
    const result = schema.safeParse({
      data: [{ label: "A", value: "big" }],
      title: "Chart",
      description: null,
      unit: null,
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty data array", () => {
    const result = schema.safeParse({
      data: [],
      title: "Empty Chart",
      description: null,
      unit: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts multiple data entries", () => {
    const result = schema.safeParse({
      data: Array.from({ length: 5 }, (_, i) => ({ label: `Slice ${i}`, value: 20 })),
      title: "Five Slices",
      description: "Equal distribution",
      unit: "%",
    });
    expect(result.success).toBe(true);
  });
});
