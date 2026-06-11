import { describe, expect, it } from "vitest";

import {
  TOUR_ADMIN,
  TOUR_STUDIO,
  TOUR_WELCOME,
  resolveAutoTour,
  withCompletedTour,
} from "./tour-logic";

const base = {
  completedTours: [] as string[],
  canSeeStudio: false,
  isAdmin: false,
};

describe("resolveAutoTour", () => {
  it("starts the welcome tour on / for a fresh user", () => {
    expect(resolveAutoTour({ ...base, pathname: "/" })).toBe(TOUR_WELCOME);
  });

  it("does not start welcome once completed", () => {
    expect(
      resolveAutoTour({
        ...base,
        pathname: "/",
        completedTours: [TOUR_WELCOME],
      }),
    ).toBeNull();
  });

  it("does not start welcome away from the home screen", () => {
    for (const pathname of [
      "/chat/abc",
      "/settings/personalization",
      "/inbox",
    ]) {
      expect(resolveAutoTour({ ...base, pathname })).toBeNull();
    }
  });

  it("starts the studio tour on first /studio visit for builders", () => {
    expect(
      resolveAutoTour({ ...base, pathname: "/studio", canSeeStudio: true }),
    ).toBe(TOUR_STUDIO);
    expect(
      resolveAutoTour({
        ...base,
        pathname: "/studio/knowledge",
        canSeeStudio: true,
      }),
    ).toBe(TOUR_STUDIO);
  });

  it("never starts the studio tour for users without studio access", () => {
    expect(resolveAutoTour({ ...base, pathname: "/studio" })).toBeNull();
  });

  it("does not start studio once completed", () => {
    expect(
      resolveAutoTour({
        ...base,
        pathname: "/studio",
        canSeeStudio: true,
        completedTours: [TOUR_STUDIO],
      }),
    ).toBeNull();
  });

  it("starts the admin tour on first /admin visit for admins", () => {
    expect(
      resolveAutoTour({ ...base, pathname: "/admin", isAdmin: true }),
    ).toBe(TOUR_ADMIN);
    expect(
      resolveAutoTour({ ...base, pathname: "/admin/users", isAdmin: true }),
    ).toBe(TOUR_ADMIN);
  });

  it("never starts the admin tour for non-admins", () => {
    expect(
      resolveAutoTour({ ...base, pathname: "/admin", canSeeStudio: true }),
    ).toBeNull();
  });

  it("does not start admin once completed", () => {
    expect(
      resolveAutoTour({
        ...base,
        pathname: "/admin",
        isAdmin: true,
        completedTours: [TOUR_ADMIN],
      }),
    ).toBeNull();
  });

  it("does not confuse prefix-like paths with /admin or /studio", () => {
    expect(
      resolveAutoTour({ ...base, pathname: "/administrivia", isAdmin: true }),
    ).toBeNull();
    expect(
      resolveAutoTour({ ...base, pathname: "/studios", canSeeStudio: true }),
    ).toBeNull();
  });

  it("welcome on / takes priority even for admins with everything pending", () => {
    expect(
      resolveAutoTour({
        ...base,
        pathname: "/",
        canSeeStudio: true,
        isAdmin: true,
      }),
    ).toBe(TOUR_WELCOME);
  });
});

describe("withCompletedTour", () => {
  it("appends a new tour", () => {
    expect(withCompletedTour(["welcome"], "studio")).toEqual([
      "welcome",
      "studio",
    ]);
  });

  it("handles undefined", () => {
    expect(withCompletedTour(undefined, "welcome")).toEqual(["welcome"]);
  });

  it("returns the same array when already present (no-op signal)", () => {
    const tours = ["welcome"];
    expect(withCompletedTour(tours, "welcome")).toBe(tours);
  });
});
