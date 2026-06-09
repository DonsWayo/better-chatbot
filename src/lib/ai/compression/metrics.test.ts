import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { incMock, observeMock } = vi.hoisted(() => ({
  incMock: vi.fn(),
  observeMock: vi.fn(),
}));

vi.mock("prom-client", () => ({
  Counter: vi.fn().mockImplementation(() => ({
    inc: incMock,
    labels: vi.fn().mockReturnThis(),
  })),
  Histogram: vi.fn().mockImplementation(() => ({
    observe: observeMock,
    labels: vi.fn().mockReturnThis(),
  })),
}));

import { recordCompressionSavings } from "./metrics";

describe("recordCompressionSavings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when charsBefore is 0", () => {
    recordCompressionSavings({ teamId: "t1", level: "standard", charsBefore: 0, charsAfter: 0 });
    expect(incMock).not.toHaveBeenCalled();
    expect(observeMock).not.toHaveBeenCalled();
  });

  it("observes ratio when no savings (no reduction)", () => {
    recordCompressionSavings({ teamId: "t1", level: "standard", charsBefore: 100, charsAfter: 100 });
    expect(incMock).not.toHaveBeenCalled();
    expect(observeMock).toHaveBeenCalledWith(
      expect.objectContaining({ team_id: "t1", level: "standard" }),
      1.0,
    );
  });

  it("increments chars saved and observes ratio when compressed", () => {
    recordCompressionSavings({ teamId: "team-abc", level: "aggressive", charsBefore: 200, charsAfter: 100 });
    expect(incMock).toHaveBeenCalledWith(
      expect.objectContaining({ team_id: "team-abc", level: "aggressive" }),
      100,
    );
    expect(observeMock).toHaveBeenCalledWith(
      expect.objectContaining({ team_id: "team-abc", level: "aggressive" }),
      0.5,
    );
  });

  it("uses none as team_id when teamId is null", () => {
    recordCompressionSavings({ teamId: null, level: "light", charsBefore: 50, charsAfter: 40 });
    expect(observeMock).toHaveBeenCalledWith(
      expect.objectContaining({ team_id: "none" }),
      0.8,
    );
  });

  it("uses none as team_id when teamId is undefined", () => {
    recordCompressionSavings({ teamId: undefined, level: "light", charsBefore: 100, charsAfter: 50 });
    expect(observeMock).toHaveBeenCalledWith(
      expect.objectContaining({ team_id: "none" }),
      0.5,
    );
  });

  it("does not increment when charsAfter is greater than charsBefore (expansion)", () => {
    recordCompressionSavings({ teamId: "t1", level: "standard", charsBefore: 50, charsAfter: 60 });
    expect(incMock).not.toHaveBeenCalled();
    // but ratio is still observed
    expect(observeMock).toHaveBeenCalled();
  });
});
