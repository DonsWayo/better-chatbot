import { describe, expect, it } from "vitest";
import {
  canCreateAgent,
  canEditAgent,
  canDeleteAgent,
  canCreateWorkflow,
  canEditWorkflow,
  canDeleteWorkflow,
  canCreateMCP,
  canEditMCP,
  canDeleteMCP,
  canChangeVisibilityMCP,
  canUseResource,
  canViewResource,
} from "./client-permissions";

describe("client-permissions — admin role", () => {
  const role = "admin";

  it("admin can create agent", () => {
    expect(canCreateAgent(role)).toBe(true);
  });

  it("admin can edit agent", () => {
    expect(canEditAgent(role)).toBe(true);
  });

  it("admin can delete agent", () => {
    expect(canDeleteAgent(role)).toBe(true);
  });

  it("admin can create workflow", () => {
    expect(canCreateWorkflow(role)).toBe(true);
  });

  it("admin can edit workflow", () => {
    expect(canEditWorkflow(role)).toBe(true);
  });

  it("admin can delete workflow", () => {
    expect(canDeleteWorkflow(role)).toBe(true);
  });

  it("admin can create MCP", () => {
    expect(canCreateMCP(role)).toBe(true);
  });

  it("admin can edit MCP", () => {
    expect(canEditMCP(role)).toBe(true);
  });

  it("admin can delete MCP", () => {
    expect(canDeleteMCP(role)).toBe(true);
  });

  it("admin can change visibility MCP", () => {
    expect(canChangeVisibilityMCP(role)).toBe(true);
  });
});

describe("client-permissions — user role", () => {
  const role = "user";

  it("user cannot create agent", () => {
    expect(canCreateAgent(role)).toBe(false);
  });

  it("user cannot delete agent", () => {
    expect(canDeleteAgent(role)).toBe(false);
  });

  it("user cannot create workflow", () => {
    expect(canCreateWorkflow(role)).toBe(false);
  });

  it("user cannot delete workflow", () => {
    expect(canDeleteWorkflow(role)).toBe(false);
  });

  it("user cannot create MCP", () => {
    expect(canCreateMCP(role)).toBe(false);
  });

  it("user can use agent resource", () => {
    expect(canUseResource(role, "agent")).toBe(true);
  });

  it("user can view agent resource", () => {
    expect(canViewResource(role, "agent")).toBe(true);
  });
});

describe("client-permissions — editor role", () => {
  const role = "editor";

  it("editor can create agent", () => {
    expect(canCreateAgent(role)).toBe(true);
  });

  it("editor can edit agent", () => {
    expect(canEditAgent(role)).toBe(true);
  });

  it("editor can delete agent", () => {
    expect(canDeleteAgent(role)).toBe(true);
  });

  it("editor can create workflow", () => {
    expect(canCreateWorkflow(role)).toBe(true);
  });

  it("editor can create MCP", () => {
    expect(canCreateMCP(role)).toBe(true);
  });

  it("editor can edit MCP", () => {
    expect(canEditMCP(role)).toBe(true);
  });
});

describe("client-permissions — null/undefined role defaults to user", () => {
  it("null role cannot create agent", () => {
    expect(canCreateAgent(null)).toBe(false);
  });

  it("undefined role cannot delete agent", () => {
    expect(canDeleteAgent(undefined)).toBe(false);
  });

  it("null role can use agent", () => {
    expect(canUseResource(null, "agent")).toBe(true);
  });

  it("undefined role can view workflow", () => {
    expect(canViewResource(undefined, "workflow")).toBe(true);
  });
});

describe("client-permissions — return type invariants", () => {
  const fns = [
    canCreateAgent, canEditAgent, canDeleteAgent,
    canCreateWorkflow, canEditWorkflow, canDeleteWorkflow,
    canCreateMCP, canEditMCP, canDeleteMCP, canChangeVisibilityMCP,
  ];

  it("all permission functions return boolean for admin", () => {
    for (const fn of fns) {
      expect(typeof fn("admin")).toBe("boolean");
    }
  });

  it("all permission functions return boolean for null", () => {
    for (const fn of fns) {
      expect(typeof fn(null)).toBe("boolean");
    }
  });

  it("canUseResource returns boolean", () => {
    for (const resource of ["agent", "workflow", "mcp"] as const) {
      expect(typeof canUseResource("admin", resource)).toBe("boolean");
    }
  });

  it("canViewResource returns boolean", () => {
    for (const resource of ["agent", "workflow", "mcp"] as const) {
      expect(typeof canViewResource("user", resource)).toBe("boolean");
    }
  });
});
