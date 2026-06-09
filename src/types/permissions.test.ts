import { describe, expect, it } from "vitest";
import { RESOURCES, PERMISSION_TYPES } from "./permissions";

describe("RESOURCES", () => {
  it("has WORKFLOW, AGENT, MCP, CHAT, TEMPORARY_CHAT", () => {
    expect(RESOURCES).toHaveProperty("WORKFLOW");
    expect(RESOURCES).toHaveProperty("AGENT");
    expect(RESOURCES).toHaveProperty("MCP");
    expect(RESOURCES).toHaveProperty("CHAT");
    expect(RESOURCES).toHaveProperty("TEMPORARY_CHAT");
  });

  it("all values are non-empty strings", () => {
    for (const v of Object.values(RESOURCES)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it("all values are unique", () => {
    const values = Object.values(RESOURCES);
    expect(new Set(values).size).toBe(values.length);
  });

  it("has at least 4 resources", () => {
    expect(Object.keys(RESOURCES).length).toBeGreaterThanOrEqual(4);
  });
});

describe("PERMISSION_TYPES", () => {
  it("has CREATE, VIEW, UPDATE, DELETE, SHARE, USE, LIST", () => {
    expect(PERMISSION_TYPES).toHaveProperty("CREATE");
    expect(PERMISSION_TYPES).toHaveProperty("VIEW");
    expect(PERMISSION_TYPES).toHaveProperty("UPDATE");
    expect(PERMISSION_TYPES).toHaveProperty("DELETE");
    expect(PERMISSION_TYPES).toHaveProperty("SHARE");
    expect(PERMISSION_TYPES).toHaveProperty("USE");
    expect(PERMISSION_TYPES).toHaveProperty("LIST");
  });

  it("all values are non-empty strings", () => {
    for (const v of Object.values(PERMISSION_TYPES)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it("all values are lowercase", () => {
    for (const v of Object.values(PERMISSION_TYPES)) {
      expect(v).toBe(v.toLowerCase());
    }
  });

  it("all values are unique", () => {
    const values = Object.values(PERMISSION_TYPES);
    expect(new Set(values).size).toBe(values.length);
  });

  it("has at least 5 permission types", () => {
    expect(Object.keys(PERMISSION_TYPES).length).toBeGreaterThanOrEqual(5);
  });
});

describe("permissions — shape invariants", () => {
  it("RESOURCES is a plain object", () => {
    expect(typeof RESOURCES).toBe("object");
    expect(RESOURCES).not.toBeNull();
    expect(Array.isArray(RESOURCES)).toBe(false);
  });

  it("PERMISSION_TYPES is a plain object", () => {
    expect(typeof PERMISSION_TYPES).toBe("object");
    expect(PERMISSION_TYPES).not.toBeNull();
    expect(Array.isArray(PERMISSION_TYPES)).toBe(false);
  });

  it("WORKFLOW resource value is 'workflow'", () => {
    expect(RESOURCES.WORKFLOW).toBe("workflow");
  });

  it("AGENT resource value is 'agent'", () => {
    expect(RESOURCES.AGENT).toBe("agent");
  });

  it("MCP resource value is 'mcp'", () => {
    expect(RESOURCES.MCP).toBe("mcp");
  });

  it("CREATE permission value is 'create'", () => {
    expect(PERMISSION_TYPES.CREATE).toBe("create");
  });

  it("DELETE permission value is 'delete'", () => {
    expect(PERMISSION_TYPES.DELETE).toBe("delete");
  });
});
