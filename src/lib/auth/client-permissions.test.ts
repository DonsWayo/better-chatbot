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
  canDeleteMCP,
  canUseResource,
  canViewResource,
} from "./client-permissions";

// better-auth/plugins/access returns real role objects, so we test against the real ac.
// The module doesn't use server-only, so it can run client-side and in tests.

describe("agent permissions", () => {
  it("admin can create/edit/delete agents", () => {
    expect(canCreateAgent("admin")).toBe(true);
    expect(canEditAgent("admin")).toBe(true);
    expect(canDeleteAgent("admin")).toBe(true);
  });

  it("editor can create/edit/delete agents", () => {
    expect(canCreateAgent("editor")).toBe(true);
    expect(canEditAgent("editor")).toBe(true);
    expect(canDeleteAgent("editor")).toBe(true);
  });

  it("user cannot create/edit/delete agents", () => {
    expect(canCreateAgent("user")).toBe(false);
    expect(canEditAgent("user")).toBe(false);
    expect(canDeleteAgent("user")).toBe(false);
  });

  it("null/undefined defaults to user role", () => {
    expect(canCreateAgent(null)).toBe(false);
    expect(canCreateAgent(undefined)).toBe(false);
  });
});

describe("workflow permissions", () => {
  it("admin can create/edit/delete workflows", () => {
    expect(canCreateWorkflow("admin")).toBe(true);
    expect(canEditWorkflow("admin")).toBe(true);
    expect(canDeleteWorkflow("admin")).toBe(true);
  });

  it("editor can create/edit/delete workflows", () => {
    expect(canCreateWorkflow("editor")).toBe(true);
    expect(canEditWorkflow("editor")).toBe(true);
    expect(canDeleteWorkflow("editor")).toBe(true);
  });

  it("user cannot create/edit/delete workflows", () => {
    expect(canCreateWorkflow("user")).toBe(false);
    expect(canEditWorkflow("user")).toBe(false);
    expect(canDeleteWorkflow("user")).toBe(false);
  });
});

describe("MCP permissions", () => {
  it("admin can create/edit/delete MCP", () => {
    expect(canCreateMCP("admin")).toBe(true);
    expect(canEditMCP("admin")).toBe(true);
    expect(canDeleteMCP("admin")).toBe(true);
  });

  it("editor can create/edit/delete MCP", () => {
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
  it("user can use agent, workflow, mcp", () => {
    expect(canUseResource("user", "agent")).toBe(true);
    expect(canUseResource("user", "workflow")).toBe(true);
    expect(canUseResource("user", "mcp")).toBe(true);
  });
});

describe("canViewResource", () => {
  it("all roles can view agents", () => {
    expect(canViewResource("user", "agent")).toBe(true);
    expect(canViewResource("editor", "agent")).toBe(true);
    expect(canViewResource("admin", "agent")).toBe(true);
  });
});
