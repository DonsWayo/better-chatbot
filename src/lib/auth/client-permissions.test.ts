import { describe, it, expect } from "vitest";
import {
  canCreateAgent,
  canEditAgent,
  canDeleteAgent,
  canCreateWorkflow,
  canEditWorkflow,
  canDeleteWorkflow,
  canCreateMCP,
  canEditMCP,
  canChangeVisibilityMCP,
  canDeleteMCP,
  canUseResource,
  canViewResource,
} from "./client-permissions";

// Roles map: admin > editor > user
describe("canCreateAgent", () => {
  it("admin can create agents", () => {
    expect(canCreateAgent("admin")).toBe(true);
  });

  it("editor can create agents", () => {
    expect(canCreateAgent("editor")).toBe(true);
  });

  it("user cannot create agents", () => {
    expect(canCreateAgent("user")).toBe(false);
  });

  it("defaults to user (no permission) when role is undefined", () => {
    expect(canCreateAgent(undefined)).toBe(false);
  });

  it("defaults to user (no permission) when role is null", () => {
    expect(canCreateAgent(null)).toBe(false);
  });
});

describe("canEditAgent", () => {
  it("admin can edit agents", () => {
    expect(canEditAgent("admin")).toBe(true);
  });

  it("editor can edit agents", () => {
    expect(canEditAgent("editor")).toBe(true);
  });

  it("user cannot edit agents", () => {
    expect(canEditAgent("user")).toBe(false);
  });
});

describe("canDeleteAgent", () => {
  it("admin can delete agents", () => {
    expect(canDeleteAgent("admin")).toBe(true);
  });

  it("editor can delete agents", () => {
    expect(canDeleteAgent("editor")).toBe(true);
  });

  it("user cannot delete agents", () => {
    expect(canDeleteAgent("user")).toBe(false);
  });
});

describe("canCreateWorkflow", () => {
  it("admin can create workflows", () => {
    expect(canCreateWorkflow("admin")).toBe(true);
  });

  it("editor can create workflows", () => {
    expect(canCreateWorkflow("editor")).toBe(true);
  });

  it("user cannot create workflows", () => {
    expect(canCreateWorkflow("user")).toBe(false);
  });
});

describe("canEditWorkflow / canDeleteWorkflow", () => {
  it("admin can edit and delete workflows", () => {
    expect(canEditWorkflow("admin")).toBe(true);
    expect(canDeleteWorkflow("admin")).toBe(true);
  });

  it("editor can edit and delete workflows", () => {
    expect(canEditWorkflow("editor")).toBe(true);
    expect(canDeleteWorkflow("editor")).toBe(true);
  });

  it("user cannot edit or delete workflows", () => {
    expect(canEditWorkflow("user")).toBe(false);
    expect(canDeleteWorkflow("user")).toBe(false);
  });
});

describe("canCreateMCP / canEditMCP / canDeleteMCP", () => {
  it("admin has full MCP permissions", () => {
    expect(canCreateMCP("admin")).toBe(true);
    expect(canEditMCP("admin")).toBe(true);
    expect(canDeleteMCP("admin")).toBe(true);
    expect(canChangeVisibilityMCP("admin")).toBe(true);
  });

  it("editor can create/edit/delete MCP but not share visibility", () => {
    expect(canCreateMCP("editor")).toBe(true);
    expect(canEditMCP("editor")).toBe(true);
    expect(canDeleteMCP("editor")).toBe(true);
  });

  it("user cannot create/edit/delete MCP", () => {
    expect(canCreateMCP("user")).toBe(false);
    expect(canEditMCP("user")).toBe(false);
    expect(canDeleteMCP("user")).toBe(false);
  });
});

describe("canUseResource", () => {
  it("user can use agent resource", () => {
    expect(canUseResource("user", "agent")).toBe(true);
  });

  it("user can use workflow resource", () => {
    expect(canUseResource("user", "workflow")).toBe(true);
  });

  it("admin can use all resource types", () => {
    expect(canUseResource("admin", "agent")).toBe(true);
    expect(canUseResource("admin", "workflow")).toBe(true);
    expect(canUseResource("admin", "mcp")).toBe(true);
  });

  it("defaults resource to agent when not specified", () => {
    expect(canUseResource("user")).toBe(true);
  });
});

describe("canViewResource", () => {
  it("user can view agent resources", () => {
    expect(canViewResource("user", "agent")).toBe(true);
  });

  it("admin can view all resource types", () => {
    expect(canViewResource("admin", "agent")).toBe(true);
    expect(canViewResource("admin", "workflow")).toBe(true);
    expect(canViewResource("admin", "mcp")).toBe(true);
  });

  it("defaults resource to agent when not specified", () => {
    expect(canViewResource("user")).toBe(true);
  });
});

describe("OAuth-prefixed role strings are parsed correctly", () => {
  it("google:admin gets admin permissions", () => {
    expect(canCreateAgent("google:admin")).toBe(true);
  });

  it("github:editor gets editor permissions", () => {
    expect(canCreateWorkflow("github:editor")).toBe(true);
  });

  it("unknown:superuser defaults to user (no create permission)", () => {
    expect(canCreateAgent("unknown:superuser")).toBe(false);
  });
});

describe("canChangeVisibilityMCP — additional", () => {
  it("editor cannot change MCP visibility", () => {
    expect(canChangeVisibilityMCP("editor")).toBe(false);
  });

  it("user cannot change MCP visibility", () => {
    expect(canChangeVisibilityMCP("user")).toBe(false);
  });

  it("undefined role cannot change MCP visibility", () => {
    expect(canChangeVisibilityMCP(undefined)).toBe(false);
  });

  it("null role cannot change MCP visibility", () => {
    expect(canChangeVisibilityMCP(null)).toBe(false);
  });
});

describe("canUseResource — additional", () => {
  it("user cannot use mcp resource", () => {
    expect(canUseResource("user", "mcp")).toBe(false);
  });

  it("editor can use agent resource", () => {
    expect(canUseResource("editor", "agent")).toBe(true);
  });

  it("editor can use workflow resource", () => {
    expect(canUseResource("editor", "workflow")).toBe(true);
  });

  it("undefined role cannot use mcp resource", () => {
    expect(canUseResource(undefined, "mcp")).toBe(false);
  });
});

describe("canViewResource — additional", () => {
  it("editor can view all resource types", () => {
    expect(canViewResource("editor", "agent")).toBe(true);
    expect(canViewResource("editor", "workflow")).toBe(true);
    expect(canViewResource("editor", "mcp")).toBe(true);
  });

  it("user can view workflow resource", () => {
    expect(canViewResource("user", "workflow")).toBe(true);
  });

  it("undefined role returns false for mcp view", () => {
    expect(canViewResource(undefined, "mcp")).toBe(false);
  });
});

describe("canCreateAgent — additional", () => {
  it("empty string role cannot create agents", () => {
    expect(canCreateAgent("")).toBe(false);
  });

  it("unknown role cannot create agents", () => {
    expect(canCreateAgent("superuser")).toBe(false);
  });

  it("canDeleteAgent returns true for editor", () => {
    expect(canDeleteAgent("editor")).toBe(true);
  });

  it("canEditAgent returns false for null", () => {
    expect(canEditAgent(null)).toBe(false);
  });
});

describe("canDeleteAgent — additional", () => {
  it("undefined role cannot delete agents", () => {
    expect(canDeleteAgent(undefined)).toBe(false);
  });

  it("null role cannot delete agents", () => {
    expect(canDeleteAgent(null)).toBe(false);
  });

  it("empty string cannot delete agents", () => {
    expect(canDeleteAgent("")).toBe(false);
  });

  it("user role cannot delete agents", () => {
    expect(canDeleteAgent("user")).toBe(false);
  });
});

describe("workflow and MCP permissions — cross-role invariants", () => {
  it("admin can create workflows", () => {
    expect(canCreateWorkflow("admin")).toBe(true);
  });

  it("user cannot delete workflows", () => {
    expect(canDeleteWorkflow("user")).toBe(false);
  });

  it("admin can delete MCP", () => {
    expect(canDeleteMCP("admin")).toBe(true);
  });

  it("user cannot create MCP", () => {
    expect(canCreateMCP("user")).toBe(false);
  });
});
