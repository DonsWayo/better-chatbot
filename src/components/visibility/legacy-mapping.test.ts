import { describe, expect, it } from "vitest";
import {
  type FourLevelVisibility,
  fromLegacyVisibilityColumn,
  toLegacyVisibilityColumn,
} from "./legacy-mapping";

describe("toLegacyVisibilityColumn", () => {
  it("maps only company → public", () => {
    expect(toLegacyVisibilityColumn("company")).toBe("public");
  });

  it("maps private/team/shared → private (real signal lives in teamIds+grants)", () => {
    const levels: FourLevelVisibility[] = ["private", "team", "shared"];
    for (const level of levels) {
      expect(toLegacyVisibilityColumn(level)).toBe("private");
    }
  });
});

describe("fromLegacyVisibilityColumn", () => {
  it("public → company regardless of teamIds", () => {
    expect(fromLegacyVisibilityColumn("public", null)).toBe("company");
    expect(fromLegacyVisibilityColumn("public", ["t1"])).toBe("company");
  });

  it("legacy private with non-empty teamIds → team", () => {
    expect(fromLegacyVisibilityColumn("private", ["t1"])).toBe("team");
    expect(fromLegacyVisibilityColumn("private", ["t1", "t2"])).toBe("team");
  });

  it("legacy private with no teams → private", () => {
    expect(fromLegacyVisibilityColumn("private", null)).toBe("private");
    expect(fromLegacyVisibilityColumn("private", [])).toBe("private");
  });

  it("unknown / readonly / null legacy with no teams → private (fail closed)", () => {
    expect(fromLegacyVisibilityColumn("readonly", null)).toBe("private");
    expect(fromLegacyVisibilityColumn(null, null)).toBe("private");
    expect(fromLegacyVisibilityColumn(undefined, undefined)).toBe("private");
  });

  it("never returns shared (shared is inferred from grants, not the row)", () => {
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

  it("round-trips company and private through the legacy column", () => {
    // company → public → company
    expect(
      fromLegacyVisibilityColumn(toLegacyVisibilityColumn("company"), null),
    ).toBe("company");
    // private → private → private
    expect(
      fromLegacyVisibilityColumn(toLegacyVisibilityColumn("private"), null),
    ).toBe("private");
    // team survives because teamIds carries the signal
    expect(
      fromLegacyVisibilityColumn(toLegacyVisibilityColumn("team"), ["t1"]),
    ).toBe("team");
  });
});
