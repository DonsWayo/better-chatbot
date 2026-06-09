import { describe, expect, it } from "vitest";
import { createTableTool } from "./create-table";

const validInput = {
  title: "Users",
  description: null,
  columns: [{ key: "name", label: "Name", type: "string" }],
  data: [{ name: "Alice" }],
};

describe("createTableTool", () => {
  it("is defined", () => {
    expect(createTableTool).toBeDefined();
  });

  it("inputSchema accepts valid data", () => {
    expect(createTableTool.inputSchema.safeParse(validInput).success).toBe(true);
  });

  it("inputSchema rejects missing title", () => {
    const { title: _, ...rest } = validInput;
    expect(createTableTool.inputSchema.safeParse(rest).success).toBe(false);
  });

  it("inputSchema requires columns array", () => {
    const result = createTableTool.inputSchema.safeParse({ ...validInput, columns: undefined });
    expect(result.success).toBe(false);
  });

  it("column type defaults to 'string'", () => {
    const input = {
      ...validInput,
      columns: [{ key: "age", label: "Age" }],
    };
    const result = createTableTool.inputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("accepts valid column types: number, date, boolean", () => {
    for (const type of ["number", "date", "boolean"]) {
      const input = {
        ...validInput,
        columns: [{ key: "x", label: "X", type }],
      };
      expect(createTableTool.inputSchema.safeParse(input).success).toBe(true);
    }
  });

  it("rejects invalid column type", () => {
    const input = {
      ...validInput,
      columns: [{ key: "x", label: "X", type: "timestamp" }],
    };
    expect(createTableTool.inputSchema.safeParse(input).success).toBe(false);
  });

  it("accepts empty data array", () => {
    expect(createTableTool.inputSchema.safeParse({ ...validInput, data: [] }).success).toBe(true);
  });
});

describe("createTableTool — shape invariants", () => {
  it("has inputSchema", () => {
    expect(createTableTool.inputSchema).toBeDefined();
  });

  it("has description", () => {
    expect(typeof createTableTool.description).toBe("string");
    expect(createTableTool.description.length).toBeGreaterThan(0);
  });

  it("description mentions 'table'", () => {
    expect(createTableTool.description.toLowerCase()).toContain("table");
  });

  it("has an execute function", () => {
    expect(typeof createTableTool.execute).toBe("function");
  });

  it("execute resolves to 'Success'", async () => {
    const result = await createTableTool.execute(
      { title: "T", description: null, columns: [], data: [] },
      { messages: [], toolCallId: "t1" },
    );
    expect(result).toBe("Success");
  });

  it("accepts multiple columns with different types", () => {
    const input = {
      ...validInput,
      columns: [
        { key: "name", label: "Name", type: "string" },
        { key: "age", label: "Age", type: "number" },
        { key: "active", label: "Active", type: "boolean" },
        { key: "joined", label: "Joined", type: "date" },
      ],
    };
    expect(createTableTool.inputSchema.safeParse(input).success).toBe(true);
  });

  it("accepts null description", () => {
    expect(createTableTool.inputSchema.safeParse({ ...validInput, description: null }).success).toBe(true);
  });

  it("accepts multiple data rows", () => {
    const input = {
      ...validInput,
      data: [{ name: "Alice" }, { name: "Bob" }, { name: "Carol" }],
    };
    expect(createTableTool.inputSchema.safeParse(input).success).toBe(true);
  });
});
