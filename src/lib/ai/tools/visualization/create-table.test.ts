import { describe, it, expect } from "vitest";
import { createTableTool } from "./create-table";

describe("createTableTool", () => {
  it("has a non-empty description", () => {
    expect(createTableTool.description!.length).toBeGreaterThan(0);
  });

  it("has an inputSchema", () => {
    expect(createTableTool.inputSchema).toBeDefined();
  });

  it("has an execute function", () => {
    expect(typeof createTableTool.execute).toBe("function");
  });

  it("execute returns 'Success'", async () => {
    const result = await createTableTool.execute!({} as any, {} as any);
    expect(result).toBe("Success");
  });
});

describe("createTableTool inputSchema validation", () => {
  const schema = createTableTool.inputSchema;

  const validInput = {
    title: "User List",
    description: "All registered users",
    columns: [
      { key: "name", label: "Name", type: "string" },
      { key: "age", label: "Age", type: "number" },
      { key: "active", label: "Active", type: "boolean" },
    ],
    data: [
      { name: "Alice", age: 30, active: true },
      { name: "Bob", age: 25, active: false },
    ],
  };

  it("accepts valid table data", () => {
    expect(schema.safeParse(validInput).success).toBe(true);
  });

  it("accepts null description", () => {
    expect(schema.safeParse({ ...validInput, description: null }).success).toBe(true);
  });

  it("rejects when title is missing", () => {
    const { title: _t, ...rest } = validInput;
    expect(schema.safeParse(rest).success).toBe(false);
  });

  it("rejects when columns is missing", () => {
    const { columns: _c, ...rest } = validInput;
    expect(schema.safeParse(rest).success).toBe(false);
  });

  it("rejects when data is missing", () => {
    const { data: _d, ...rest } = validInput;
    expect(schema.safeParse(rest).success).toBe(false);
  });

  it("rejects when column is missing key", () => {
    const bad = {
      ...validInput,
      columns: [{ label: "Name", type: "string" }],
    };
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("rejects when column is missing label", () => {
    const bad = {
      ...validInput,
      columns: [{ key: "name", type: "string" }],
    };
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("accepts null column type", () => {
    const withNullType = {
      ...validInput,
      columns: [{ key: "name", label: "Name", type: null }],
    };
    expect(schema.safeParse(withNullType).success).toBe(true);
  });

  it("accepts column type 'date'", () => {
    const withDate = {
      ...validInput,
      columns: [{ key: "created", label: "Created At", type: "date" }],
    };
    expect(schema.safeParse(withDate).success).toBe(true);
  });

  it("accepts empty data array", () => {
    expect(schema.safeParse({ ...validInput, data: [] }).success).toBe(true);
  });

  it("accepts empty columns array", () => {
    expect(schema.safeParse({ ...validInput, columns: [] }).success).toBe(true);
  });

  it("data rows can have any extra keys", () => {
    const withExtra = {
      ...validInput,
      data: [{ name: "Alice", arbitrary: true, nested: { x: 1 } }],
    };
    expect(schema.safeParse(withExtra).success).toBe(true);
  });
});
