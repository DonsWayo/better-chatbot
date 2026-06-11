// Pure decision logic for the onboarding tours (no React, fully testable).
//
// Three tours exist (docs: content/docs/tours.mdx):
// - "welcome": everyone, auto-starts once on "/"
// - "studio":  builders/admins only, auto-starts on first visit to /studio
// - "admin":   admins only, auto-starts on first visit to /admin
//
// Completion/skips are persisted in UserPreferences.completedTours; the
// AppTours controller calls resolveAutoTour on every pathname change.

export const TOUR_WELCOME = "welcome";
export const TOUR_STUDIO = "studio";
export const TOUR_ADMIN = "admin";

export type TourName =
  | typeof TOUR_WELCOME
  | typeof TOUR_STUDIO
  | typeof TOUR_ADMIN;

export interface ResolveAutoTourInput {
  pathname: string;
  completedTours: string[];
  canSeeStudio: boolean;
  isAdmin: boolean;
}

/**
 * Decide which tour (if any) should auto-start for the current location.
 * Returns null when nothing should fire — already completed, wrong page,
 * or the user lacks permission to see the surface being toured.
 */
export function resolveAutoTour({
  pathname,
  completedTours,
  canSeeStudio,
  isAdmin,
}: ResolveAutoTourInput): TourName | null {
  const done = (tour: TourName) => completedTours.includes(tour);

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return isAdmin && !done(TOUR_ADMIN) ? TOUR_ADMIN : null;
  }
  if (pathname === "/studio" || pathname.startsWith("/studio/")) {
    return canSeeStudio && !done(TOUR_STUDIO) ? TOUR_STUDIO : null;
  }
  // The welcome tour anchors (sidebar + composer) all live on the home
  // screen, so it only auto-starts there.
  if (pathname === "/") {
    return !done(TOUR_WELCOME) ? TOUR_WELCOME : null;
  }
  return null;
}

/** Append a finished tour, deduplicated, without mutating the input. */
export function withCompletedTour(
  completedTours: string[] | undefined,
  tour: string,
): string[] {
  const current = completedTours ?? [];
  return current.includes(tour) ? current : [...current, tour];
}
