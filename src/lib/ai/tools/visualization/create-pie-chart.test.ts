import { describe, expect, it } from "vitest";
import { createPieChartTool } from "./create-pie-chart";

const validInput = {
  data: [{ label: "A", value: 40 }, { label: "B", value: 60 }],
  title: "Pie Chart",
  description: null,
  unit: null,
};

describe("createPieChartTool", () => {
  it("is defined", () => {
    expect(createPieChartTool).toBeDefined();
  });

  it("inputSchema accepts valid data", () => {
    expect(createPieChartTool.inputSchema.safeParse(validInput).success).toBe(true);
  });

  it("inputSchema rejects missing title", () => {
    const { title: _, ...rest } = validInput;
    expect(createPieChartTool.inputSchema.safeParse(rest).success).toBe(false);
  });

  it("inputSchema accepts non-null unit", () => {
    const result = createPieChartTool.inputSchema.safeParse({ ...validInput, unit: "%" });
    expect(result.success).toBe(true);
  });

  it("inputSchema accepts empty data array", () => {
    expect(createPieChartTool.inputSchema.safeParse({ ...validInput, data: [] }).success).toBe(true);
  });

  it("value in data must be number", () => {
    const input = { ...validInput, data: [{ label: "A", value: "40" }] };
    expect(createPieChartTool.inputSchema.safeParse(input).success).toBe(false);
  });

  it("label in data must be string", () => {
    const input = { ...validInput, data: [{ label: 1, value: 40 }] };
    expect(createPieChartTool.inputSchema.safeParse(input).success).toBe(false);
  });
});

describe("createPieChartTool — shape invariants", () => {
  it("has inputSchema", () => {
    expect(createPieChartTool.inputSchema).toBeDefined();
  });

  it("has description containing 'pie'", () => {
    expect(createPieChartTool.description.toLowerCase()).toContain("pie");
  });

  it("has an execute function", () => {
    expect(typeof createPieChartTool.execute).toBe("function");
  });

  it("execute resolves to 'Success'", async () => {
    const result = await createPieChartTool.execute({ data: [], title: "T", description: null, unit: null }, { messages: [], toolCallId: "t1" });
    expect(result).toBe("Success");
  });

  it("inputSchema rejects data item with missing label", () => {
    const input = { ...validInput, data: [{ value: 50 }] };
    expect(createPieChartTool.inputSchema.safeParse(input).success).toBe(false);
  });

  it("inputSchema rejects data item with missing value", () => {
    const input = { ...validInput, data: [{ label: "X" }] };
    expect(createPieChartTool.inputSchema.safeParse(input).success).toBe(false);
  });

  it("inputSchema accepts multiple data items", () => {
    const input = {
      ...validInput,
      data: [
        { label: "A", value: 30 },
        { label: "B", value: 30 },
        { label: "C", value: 40 },
      ],
    };
    expect(createPieChartTool.inputSchema.safeParse(input).success).toBe(true);
  });

  it("inputSchema accepts null description", () => {
    expect(createPieChartTool.inputSchema.safeParse({ ...validInput, description: null }).success).toBe(true);
  });

  it("inputSchema rejects missing data field", () => {
    const { data: _, ...rest } = validInput;
    expect(createPieChartTool.inputSchema.safeParse(rest).success).toBe(false);
  });
});
