import { describe, expect, it } from "vitest";
import {
  type FourLevelVisibility,
  fromLegacyVisibilityColumn,
  toLegacyVisibilityColumn,
} from "./legacy-mapping";

describe("toLegacyVisibilityColumn", () => {
  it("is an identity since migration 0041 — the literal level is stored", () => {
    const levels: FourLevelVisibility[] = [
      "private",
      "shared",
      "team",
      "company",
    ];
    for (const level of levels) {
      expect(toLegacyVisibilityColumn(level)).toBe(level);
    }
  });

  it("no longer writes the legacy 'public' value", () => {
    expect(toLegacyVisibilityColumn("company")).not.toBe("public");
  });
});

describe("fromLegacyVisibilityColumn — modern stored values", () => {
  it("passes modern values through literally", () => {
    expect(fromLegacyVisibilityColumn("company", null)).toBe("company");
    expect(fromLegacyVisibilityColumn("shared", null)).toBe("shared");
    expect(fromLegacyVisibilityColumn("team", ["t1"])).toBe("team");
    expect(fromLegacyVisibilityColumn("private", null)).toBe("private");
  });

  it("stored 'team' stays team even with empty teamIds (resolver fails closed)", () => {
    expect(fromLegacyVisibilityColumn("team", null)).toBe("team");
    expect(fromLegacyVisibilityColumn("team", [])).toBe("team");
  });

  it("stored 'shared' stays shared regardless of teamIds", () => {
    expect(fromLegacyVisibilityColumn("shared", ["t1"])).toBe("shared");
  });

  it("round-trips every modern level through the column", () => {
    const levels: FourLevelVisibility[] = [
      "private",
      "shared",
      "team",
      "company",
    ];
    for (const level of levels) {
      expect(
        fromLegacyVisibilityColumn(
          toLegacyVisibilityColumn(level),
          level === "team" ? ["t1"] : null,
        ),
      ).toBe(level);
    }
  });
});

describe("fromLegacyVisibilityColumn — legacy stored values (back-compat)", () => {
  it("public → company regardless of teamIds", () => {
    expect(fromLegacyVisibilityColumn("public", null)).toBe("company");
    expect(fromLegacyVisibilityColumn("public", ["t1"])).toBe("company");
  });

  it("legacy private with non-empty teamIds → team (pre-0041 storage shape)", () => {
    expect(fromLegacyVisibilityColumn("private", ["t1"])).toBe("team");
    expect(fromLegacyVisibilityColumn("private", ["t1", "t2"])).toBe("team");
  });

  it("legacy private with no teams → private", () => {
    expect(fromLegacyVisibilityColumn("private", null)).toBe("private");
    expect(fromLegacyVisibilityColumn("private", [])).toBe("private");
  });

  it("unknown / readonly / null with no teams → private (fail closed)", () => {
    expect(fromLegacyVisibilityColumn("readonly", null)).toBe("private");
    expect(fromLegacyVisibilityColumn(null, null)).toBe("private");
    expect(fromLegacyVisibilityColumn(undefined, undefined)).toBe("private");
  });

  it("never returns shared for legacy rows (shared is inferred from grants)", () => {
    const inputs: Array<[string | null, string[] | null]> = [
      ["public", null],
      ["private", ["t1"]],
      ["private", null],
      ["readonly", ["t1"]],
    ];
    for (const [legacy, teamIds] of inputs) {
      expect(fromLegacyVisibilityColumn(legacy, teamIds)).not.toBe("shared");
    }
  });
});
