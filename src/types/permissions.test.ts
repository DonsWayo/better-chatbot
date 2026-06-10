import { describe, expect, it } from "vitest";
import { PERMISSION_TYPES, RESOURCES } from "./permissions";

describe("RESOURCES", () => {
  it("has WORKFLOW resource", () => {
    expect(RESOURCES.WORKFLOW).toBe("workflow");
  });

  it("has AGENT resource", () => {
    expect(RESOURCES.AGENT).toBe("agent");
  });

  it("has MCP resource", () => {
    expect(RESOURCES.MCP).toBe("mcp");
  });

  it("has CHAT resource", () => {
    expect(RESOURCES.CHAT).toBe("chat");
  });

  it("has TEMPORARY_CHAT resource", () => {
    expect(RESOURCES.TEMPORARY_CHAT).toBe("temporaryChat");
  });

  it("has exactly 5 resources", () => {
    expect(Object.keys(RESOURCES)).toHaveLength(5);
  });

  it("all resource values are strings", () => {
    for (const v of Object.values(RESOURCES)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });
});

describe("PERMISSION_TYPES", () => {
  it("has CREATE permission", () => {
    expect(PERMISSION_TYPES.CREATE).toBe("create");
  });

  it("has VIEW permission", () => {
    expect(PERMISSION_TYPES.VIEW).toBe("view");
  });

  it("has UPDATE permission", () => {
    expect(PERMISSION_TYPES.UPDATE).toBe("update");
  });

  it("has DELETE permission", () => {
    expect(PERMISSION_TYPES.DELETE).toBe("delete");
  });

  it("has USE permission", () => {
    expect(PERMISSION_TYPES.USE).toBe("use");
  });

  it("has LIST permission", () => {
    expect(PERMISSION_TYPES.LIST).toBe("list");
  });

  it("has SHARE permission", () => {
    expect(PERMISSION_TYPES.SHARE).toBe("share");
  });

  it("has exactly 7 permissions", () => {
    expect(Object.keys(PERMISSION_TYPES)).toHaveLength(7);
  });

  it("all permission values are lowercase strings", () => {
    for (const v of Object.values(PERMISSION_TYPES)) {
      expect(typeof v).toBe("string");
      expect(v).toBe(v.toLowerCase());
    }
  });
});

describe("RESOURCES — uniqueness and format", () => {
  it("has no duplicate values", () => {
    const values = Object.values(RESOURCES);
    expect(new Set(values).size).toBe(values.length);
  });

  it("all keys are uppercase strings", () => {
    for (const k of Object.keys(RESOURCES)) {
      expect(k).toBe(k.toUpperCase());
    }
  });
});

describe("PERMISSION_TYPES — uniqueness and format", () => {
  it("has no duplicate values", () => {
    const values = Object.values(PERMISSION_TYPES);
    expect(new Set(values).size).toBe(values.length);
  });

  it("all keys are uppercase strings", () => {
    for (const k of Object.keys(PERMISSION_TYPES)) {
      expect(k).toBe(k.toUpperCase());
    }
  });
});

describe("RESOURCES and PERMISSION_TYPES — cross-property", () => {
  it("no overlapping values between RESOURCES and PERMISSION_TYPES", () => {
    const resourceValues = new Set<string>(Object.values(RESOURCES));
    for (const v of Object.values(PERMISSION_TYPES)) {
      expect(resourceValues.has(v)).toBe(false);
    }
  });
});
