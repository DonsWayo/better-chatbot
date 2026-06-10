import { describe, expect, it } from "vitest";

import {
  canCreateAgent,
  canCreateWorkflow,
  canEditWorkflow,
} from "./client-permissions";

// The Studio sidebar item, command-palette entry, and /studio page all gate
// on the same predicate. This locks the role behaviour in one place so the
// three call sites stay in sync.
function canSeeStudio(role?: string | null): boolean {
  return (
    canCreateAgent(role) || canCreateWorkflow(role) || canEditWorkflow(role)
  );
}

describe("canSeeStudio (builder gate)", () => {
  it("admins see Studio", () => {
    expect(canSeeStudio("admin")).toBe(true);
  });

  it("editors see Studio", () => {
    expect(canSeeStudio("editor")).toBe(true);
  });

  it("basic users do not see Studio", () => {
    expect(canSeeStudio("user")).toBe(false);
  });

  it("undefined/null role does not see Studio", () => {
    expect(canSeeStudio(undefined)).toBe(false);
    expect(canSeeStudio(null)).toBe(false);
  });
});
