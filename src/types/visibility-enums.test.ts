import { describe, expect, it } from "vitest";
import { AgentVisibilitySchema } from "./agent";
import { WorkflowVisibilitySchema } from "./workflow";

// Migration 0041 widened the stored visibility to the literal four-level
// value; the create/update zod enums must accept the modern levels AND keep
// the legacy values readable for back-compat (unmigrated rows, older clients).
const MODERN = ["private", "shared", "team", "company"] as const;
const LEGACY = ["public", "readonly"] as const;

describe("AgentVisibilitySchema", () => {
  it("accepts every modern four-level value", () => {
    for (const v of MODERN) {
      expect(AgentVisibilitySchema.safeParse(v).success).toBe(true);
    }
  });

  it("keeps accepting legacy values for back-compat", () => {
    for (const v of LEGACY) {
      expect(AgentVisibilitySchema.safeParse(v).success).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(AgentVisibilitySchema.safeParse("hidden").success).toBe(false);
    expect(AgentVisibilitySchema.safeParse("").success).toBe(false);
    expect(AgentVisibilitySchema.safeParse("PUBLIC").success).toBe(false);
  });
});

describe("WorkflowVisibilitySchema", () => {
  it("accepts every modern four-level value", () => {
    for (const v of MODERN) {
      expect(WorkflowVisibilitySchema.safeParse(v).success).toBe(true);
    }
  });

  it("keeps accepting legacy values for back-compat", () => {
    for (const v of LEGACY) {
      expect(WorkflowVisibilitySchema.safeParse(v).success).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(WorkflowVisibilitySchema.safeParse("org").success).toBe(false);
    expect(WorkflowVisibilitySchema.safeParse(undefined).success).toBe(false);
  });
});
